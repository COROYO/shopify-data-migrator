import { fetchBlogsByIds, fetchBlogsByHandles } from "./fetch.ts";
import { cleanArticle } from "./transform.ts";
import { shopPost } from "../../_shared/client.ts";
import { MigrateRequest, Result } from "../../_shared/types.ts";
import { V, BATCH_SIZE, BATCH_DELAY_MS, sleep } from "../../_shared/utils.ts";
import { Logger } from "../../_shared/logger.ts";

export async function migrateBlogs(
  req: MigrateRequest,
): Promise<Result[]> {
  const { sourceShop: src, targetShop: tgt, itemIds, conflictMode: cm, dryRun: dry } = req;
  const logger = new Logger("BLOG");
  const results: Result[] = [];

  logger.info(`Fetching ${itemIds.length} blogs from source...`);
  
  const sel = await fetchBlogsByIds(src.url, src.token, itemIds);
  
  const handles = sel
    .filter((b): b is any => b != null)
    .map((b: any) => b.handle);
    
  let tgtBlogs: any[] = [];
  try {
    tgtBlogs = await fetchBlogsByHandles(tgt.url, tgt.token, handles);
  } catch (e) {
    logger.error("Failed to fetch existing blogs from target", e);
  }

  for (let i = 0; i < sel.length; i += BATCH_SIZE) {
    const batch = sel.slice(i, i + BATCH_SIZE);
    
    for (let j = 0; j < batch.length; j++) {
        const blog = batch[j];
        const originalIdx = i + j;
        const reqId = itemIds[originalIdx] ?? String(originalIdx);

        if (!blog) {
          results.push({
            id: String(reqId),
            title: String(reqId),
            status: "error",
            message: "Nicht gefunden",
          });
          continue;
        }

        const t = blog.title || String(blog.id);
        logger.info(`Migrating blog: ${t} (${blog.handle})`);

        try {
          const ex = tgtBlogs.find((tb: any) => tb.handle === blog.handle);

          if (dry) {
            results.push({
              id: String(blog.id),
              title: t,
              status: ex ? "updated" : "created",
              message: "Testlauf",
            });
            continue;
          }

          if (ex && cm === "ask") {
            results.push({
              id: String(blog.id),
              title: t,
              status: "conflict",
              message: "Bereits vorhanden",
              sourceData: { title: blog.title, handle: blog.handle },
              targetData: { title: ex.title, handle: ex.handle },
            });
            continue;
          }

          if (ex && cm === "skip") {
            results.push({
              id: String(blog.id),
              title: t,
              status: "skipped",
              message: "Bereits vorhanden",
            });
            continue;
          }

          let targetBlogId: number;
          if (ex) {
            targetBlogId = ex.id;
            results.push({ id: String(blog.id), title: t, status: "updated" });
          } else {
            const cr = await shopPost(
              tgt.url,
              tgt.token,
              `/admin/api/${V}/blogs.json`,
              {
                blog: {
                  title: blog.title,
                  handle: blog.handle,
                  commentable: blog.commentable,
                },
              },
            );
            targetBlogId = cr?.blog?.id;
            results.push({ id: String(blog.id), title: t, status: "created" });
          }

          if (targetBlogId) {
            const arts = blog.articles ?? [];
            for (let _j = 0; _j < arts.length; _j++) {
              if (_j > 0 && _j % BATCH_SIZE === 0) await sleep(BATCH_DELAY_MS);
              const a = arts[_j];
              logger.info(`  Migrating article: ${a.title}`);
              try {
                await shopPost(
                  tgt.url,
                  tgt.token,
                  `/admin/api/${V}/blogs/${targetBlogId}/articles.json`,
                  { article: cleanArticle(a) },
                );
                results.push({
                  id: String(a.id),
                  title: `Artikel: ${a.title}`,
                  status: "created",
                });
              } catch (e: any) {
                logger.error(`  Error migrating article ${a.title}`, e);
                results.push({
                  id: String(a.id),
                  title: `Artikel: ${a.title}`,
                  status: "error",
                  message: e.message,
                });
              }
            }
          }
        } catch (e: any) {
          logger.error(`Error migrating blog ${t}`, e);
          results.push({
            id: String(blog.id),
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
