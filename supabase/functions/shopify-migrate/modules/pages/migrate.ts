import { fetchPagesByIds, fetchPagesByHandles } from "./fetch.ts";
import { cleanPage } from "./transform.ts";
import { shopPut, shopPost } from "../../_shared/client.ts";
import { MigrateRequest, Result } from "../../_shared/types.ts";
import { V, BATCH_SIZE, BATCH_DELAY_MS, sleep } from "../../_shared/utils.ts";
import { Logger } from "../../_shared/logger.ts";

export async function migratePages(
  req: MigrateRequest,
): Promise<Result[]> {
  const { sourceShop: src, targetShop: tgt, itemIds, conflictMode: cm, dryRun: dry } = req;
  const logger = new Logger("PAGE");
  const results: Result[] = [];

  logger.info(`Fetching ${itemIds.length} pages from source...`);
  
  const sel = await fetchPagesByIds(src.url, src.token, itemIds);
  
  const handles = sel
    .filter((p): p is any => p != null)
    .map((p: any) => p.handle);
    
  let tgtAll: any[] = [];
  try {
    tgtAll = await fetchPagesByHandles(tgt.url, tgt.token, handles);
  } catch (e) {
    logger.error("Failed to fetch existing pages from target", e);
  }

  for (let i = 0; i < sel.length; i += BATCH_SIZE) {
    const batch = sel.slice(i, i + BATCH_SIZE);
    
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
        logger.info(`Migrating page: ${t} (${p.handle})`);

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
                body_html: p.body_html?.substring(0, 200),
              },
              targetData: {
                title: ex.title,
                handle: ex.handle,
                body_html: ex.body_html?.substring(0, 200),
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

          const cl = cleanPage(p);

          if (ex && cm === "overwrite") {
            await shopPut(
              tgt.url,
              tgt.token,
              `/admin/api/${V}/pages/${ex.id}.json`,
              { page: cl },
            );
            results.push({ id: String(p.id), title: t, status: "updated" });
          } else if (!ex) {
            await shopPost(tgt.url, tgt.token, `/admin/api/${V}/pages.json`, {
              page: cl,
            });
            results.push({ id: String(p.id), title: t, status: "created" });
          }
        } catch (e: any) {
          logger.error(`Error migrating page ${t}`, e);
          results.push({
            id: String(p.id),
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
