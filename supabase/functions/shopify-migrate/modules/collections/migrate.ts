import { fetchCollectionsByIds, fetchCollectionsByHandles } from "./fetch.ts";
import { cleanCollection } from "./transform.ts";
import { shopPut, shopPost } from "../../_shared/client.ts";
import { MigrateRequest, Result } from "../../_shared/types.ts";
import { V, BATCH_SIZE, BATCH_DELAY_MS, sleep } from "../../_shared/utils.ts";
import { Logger } from "../../_shared/logger.ts";

export async function migrateCollections(
  req: MigrateRequest,
): Promise<Result[]> {
  const { sourceShop: src, targetShop: tgt, itemIds, conflictMode: cm, dryRun: dry } = req;
  const logger = new Logger("COLLECTION");
  const results: Result[] = [];

  logger.info(`Fetching ${itemIds.length} collections from source...`);
  
  const sel = await fetchCollectionsByIds(src.url, src.token, itemIds);
  
  const handles = sel
    .filter((c): c is any => c != null)
    .map((c: any) => c.handle);
    
  let allTgt: any[] = [];
  try {
    allTgt = await fetchCollectionsByHandles(tgt.url, tgt.token, handles);
  } catch (e) {
    logger.error("Failed to fetch existing collections from target", e);
  }

  for (let i = 0; i < sel.length; i += BATCH_SIZE) {
    const batch = sel.slice(i, i + BATCH_SIZE);
    
    for (let j = 0; j < batch.length; j++) {
        const col = batch[j];
        const originalIdx = i + j;
        const reqId = itemIds[originalIdx] ?? String(originalIdx);

        if (!col) {
          results.push({
            id: String(reqId),
            title: String(reqId),
            status: "error",
            message: "Nicht gefunden",
          });
          continue;
        }

        const t = col.title || String(col.id);
        const ct = col._type;
        logger.info(`Migrating collection: ${t} (${col.handle})`);

        try {
          const ex = allTgt.find((tc: any) => tc.handle === col.handle);

          if (ex && cm === "skip") {
            results.push({
              id: String(col.id),
              title: t,
              status: "skipped",
              message: "Bereits vorhanden",
            });
            continue;
          }

          if (ex && cm === "ask") {
            results.push({
              id: String(col.id),
              title: t,
              status: "conflict",
              message: "Bereits vorhanden",
              sourceData: { title: col.title, handle: col.handle },
              targetData: { title: ex.title, handle: ex.handle },
            });
            continue;
          }

          if (dry) {
            results.push({
              id: String(col.id),
              title: t,
              status: ex ? "updated" : "created",
              message: "Testlauf",
            });
            continue;
          }

          const cl = cleanCollection(col);
          const ep =
            ct === "smart" ? "smart_collections" : "custom_collections";
          const wr = ct === "smart" ? "smart_collection" : "custom_collection";

          if (ex && cm === "overwrite") {
            await shopPut(
              tgt.url,
              tgt.token,
              `/admin/api/${V}/${ep}/${ex.id}.json`,
              { [wr]: cl },
            );
            results.push({ id: String(col.id), title: t, status: "updated" });
          } else if (!ex) {
            await shopPost(tgt.url, tgt.token, `/admin/api/${V}/${ep}.json`, {
              [wr]: cl,
            });
            results.push({ id: String(col.id), title: t, status: "created" });
          }
        } catch (e: any) {
          logger.error(`Error migrating collection ${t}`, e);
          results.push({
            id: String(col.id),
            title: t,
            status: "error",
            message: e.message,
          });
        }
    }
    
    if (i + BATCH_SIZE < sel.length) {
        await sleep(BATCH_DELAY_MS);
    }
  }

  return results;
}
