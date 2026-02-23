import { gql } from "../../_shared/client.ts";
import { normalizeIds, toGid, NODES_BATCH_SIZE, escapeHandleForQuery, numId } from "../../_shared/utils.ts";
import { gqlToRestBlog, gqlToRestArticle } from "./transform.ts";

const BLOG_FRAGMENT = `
  id title handle
  commentPolicy templateSuffix
`;

export async function fetchBlogsByIds(
  url: string,
  token: string,
  ids: string[],
): Promise<(any | null)[]> {
  const normalized = normalizeIds(ids);
  if (normalized.length === 0) return [];
  const gids = normalized.map((id) => toGid("Blog", id));
  const nodeResults: (any | null)[] = new Array(normalized.length).fill(null);
  
  for (let i = 0; i < gids.length; i += NODES_BATCH_SIZE) {
    const batch = gids.slice(i, i + NODES_BATCH_SIZE);
    const idsJson = JSON.stringify(batch);
    const query = `{
      nodes(ids: ${idsJson}) {
        ... on Blog {
          ${BLOG_FRAGMENT}
        }
      }
    }`;
    const data = await gql(url, token, query);
    const nodes = data?.data?.nodes ?? [];
    if (nodes.length !== batch.length) {
      console.error(
        `[fetchBlogsByIds] Mismatch: Requested ${batch.length} nodes, got ${nodes.length}`,
      );
    }
    for (let j = 0; j < nodes.length; j++) {
      const idx = i + j;
      const blog = nodes[j];
      if (!blog) continue;
      const restBlog = gqlToRestBlog(blog);
      const articles: any[] = [];
      let artCursor: string | null = null;
      let artHasNext = true;
      while (artHasNext) {
        const artQuery = `{
          blog(id: "${blog.id}") {
            articles(first: 250${artCursor ? `, after: "${artCursor}"` : ""}) {
              nodes {
                id title handle contentHtml summary tags
                author { name }
                image { url altText }
                isPublished
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }`;
        const artData = await gql(url, token, artQuery);
        const artConn = artData?.data?.blog?.articles;
        const artNodes = artConn?.nodes ?? [];
        articles.push(...artNodes.map(gqlToRestArticle));
        artHasNext = artConn?.pageInfo?.hasNextPage ?? false;
        artCursor = artConn?.pageInfo?.endCursor ?? null;
      }
      nodeResults[idx] = { ...restBlog, articles };
    }
  }
  return nodeResults;
}

export async function fetchBlogsByHandles(
  url: string,
  token: string,
  handles: string[],
): Promise<any[]> {
  if (handles.length === 0) return [];
  const results: any[] = [];
  
  for (const handle of handles) {
    try {
      const q = `handle:${escapeHandleForQuery(handle)}`;
      const query = `{
        blogs(first: 1, query: ${JSON.stringify(q)}) {
          nodes {
            id title handle
          }
        }
      }`;
      const data = await gql(url, token, query);
      const nodes = data?.data?.blogs?.nodes ?? [];
      for (const n of nodes) {
        results.push({
          id: numId(n.id),
          title: n.title,
          handle: n.handle,
        });
      }
    } catch {
      /* ignore */
    }
  }
  return results;
}
