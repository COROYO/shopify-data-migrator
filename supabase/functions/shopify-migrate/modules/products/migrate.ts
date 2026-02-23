import { fetchProductsByIds, fetchProductsByHandles } from "./fetch.ts";
import { cleanProduct } from "./transform.ts";
import { shopPut, shopPost } from "../../_shared/client.ts";
import { MigrateRequest, Result } from "../../_shared/types.ts";
import { V, BATCH_SIZE, BATCH_DELAY_MS, sleep } from "../../_shared/utils.ts";
import { Logger } from "../../_shared/logger.ts";

export async function migrateProducts(
  req: MigrateRequest,
): Promise<Result[]> {
  const { sourceShop: src, targetShop: tgt, itemIds, conflictMode: cm, dryRun: dry } = req;
  const logger = new Logger("PRODUCT");
  const results: Result[] = [];

  logger.info(`Fetching ${itemIds.length} products from source...`);
  
  // We fetch all source data first (bulk is efficient)
  const sel = await fetchProductsByIds(src.url, src.token, itemIds);
  
  // Pre-fetch target handles for existence check
  const handles = sel
    .filter((p): p is any => p != null)
    .map((p: any) => p.handle);
    
  let tgtAll: any[] = [];
  try {
    tgtAll = await fetchProductsByHandles(tgt.url, tgt.token, handles);
  } catch (e) {
    logger.error("Failed to fetch existing products from target", e);
  }

  // Iterate with BATCH_SIZE (1)
  for (let i = 0; i < sel.length; i += BATCH_SIZE) {
    const batch = sel.slice(i, i + BATCH_SIZE);
    
    // Process batch
    for (let j = 0; j < batch.length; j++) {
      const p = batch[j];
      const originalIdx = i + j;
      const reqId = itemIds[originalIdx] ?? String(originalIdx);

      if (!p) {
        results.push({
          id: String(reqId),
          title: String(reqId),
          status: "error",
          message: "Nicht gefunden",
        });
        continue;
      }

      const t = p.title || String(p.id);
      logger.info(`Migrating product: ${t} (${p.handle})`);

      try {
        const ex = tgtAll.find((tp: any) => tp.handle === p.handle);

        if (ex && cm === "skip") {
          results.push({
            id: String(p.id),
            title: t,
            status: "skipped",
            message: "Bereits vorhanden",
          });
          continue;
        }

        if (ex && cm === "ask") {
          results.push({
            id: String(p.id),
            title: t,
            status: "conflict",
            message: "Bereits vorhanden",
            sourceData: {
              title: p.title,
              handle: p.handle,
              vendor: p.vendor,
              product_type: p.product_type,
              variants: p.variants?.length ?? 0,
              images: p.images?.length ?? 0,
            },
            targetData: {
              title: ex.title,
              handle: ex.handle,
              vendor: ex.vendor,
              product_type: ex.product_type,
              variants: ex.variants?.length ?? 0,
              images: ex.images?.length ?? 0,
            },
          });
          continue;
        }

        if (dry) {
          results.push({
            id: String(p.id),
            title: t,
            status: ex ? "updated" : "created",
            message: "Testlauf",
          });
          continue;
        }

        const c = cleanProduct(p);

        if (ex && cm === "overwrite") {
          await shopPut(
            tgt.url,
            tgt.token,
            `/admin/api/${V}/products/${ex.id}.json`,
            { product: c },
          );
          results.push({ id: String(p.id), title: t, status: "updated" });
        } else if (!ex) {
          await shopPost(
            tgt.url,
            tgt.token,
            `/admin/api/${V}/products.json`,
            { product: c },
          );
          results.push({ id: String(p.id), title: t, status: "created" });
        }
      } catch (e: any) {
        logger.error(`Error migrating product ${t}`, e);
        results.push({
          id: String(p.id),
          title: t,
          status: "error",
          message: e.message,
        });
      }
    }
    
    // Delay between batches
    if (i + BATCH_SIZE < sel.length) {
        await sleep(BATCH_DELAY_MS);
    }
  }

  return results;
}
