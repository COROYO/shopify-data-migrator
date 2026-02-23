import { gql } from "../../_shared/client.ts";
import { normalizeIds, toGid, NODES_BATCH_SIZE, escapeHandleForQuery, numId } from "../../_shared/utils.ts";
import { gqlToRestPage } from "./transform.ts";

const PAGE_FRAGMENT = `
  id title handle body
  templateSuffix isPublished
`;

export async function fetchPagesByIds(
  url: string,
  token: string,
  ids: string[],
): Promise<(any | null)[]> {
  const normalized = normalizeIds(ids);
  if (normalized.length === 0) return [];
  const results: (any | null)[] = new Array(normalized.length).fill(null);
  const gids = normalized.map((id) => toGid("Page", id));
  
  for (let i = 0; i < gids.length; i += NODES_BATCH_SIZE) {
    const batch = gids.slice(i, i + NODES_BATCH_SIZE);
    const idsJson = JSON.stringify(batch);
    const query = `{
      nodes(ids: ${idsJson}) {
        ... on Page {
          ${PAGE_FRAGMENT}
        }
      }
    }`;
    const data = await gql(url, token, query);
    const nodes = data?.data?.nodes ?? [];
    if (nodes.length !== batch.length) {
      console.error(
        `[fetchPagesByIds] Mismatch: Requested ${batch.length} nodes, got ${nodes.length}`,
      );
    }
    for (let j = 0; j < nodes.length; j++) {
      const idx = i + j;
      const node = nodes[j];
      if (node) {
        results[idx] = gqlToRestPage(node);
      }
    }
  }
  return results;
}

export async function fetchPagesByHandles(
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
        pages(first: 1, query: ${JSON.stringify(q)}) {
          nodes {
            id title handle body
          }
        }
      }`;
      const data = await gql(url, token, query);
      const nodes = data?.data?.pages?.nodes ?? [];
      for (const n of nodes) {
        results.push({
          id: numId(n.id),
          title: n.title,
          handle: n.handle,
          body_html: n.body ?? "",
        });
      }
    } catch {
      /* ignore */
    }
  }
  return results;
}
