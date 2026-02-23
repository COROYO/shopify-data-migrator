import { gql } from "../../_shared/client.ts";
import { normalizeIds, toGid, NODES_BATCH_SIZE, escapeHandleForQuery, numId } from "../../_shared/utils.ts";
import { gqlToRestCollection } from "./transform.ts";

const COLLECTION_FRAGMENT = `
  id title handle descriptionHtml
  sortOrder templateSuffix
  ruleSet { appliedDisjunctively rules { column relation condition } }
  image { url altText }
`;

export async function fetchCollectionsByIds(
  url: string,
  token: string,
  ids: string[],
): Promise<(any | null)[]> {
  const normalized = normalizeIds(ids);
  if (normalized.length === 0) return [];
  const results: (any | null)[] = new Array(normalized.length).fill(null);
  const gids = normalized.map((id) => toGid("Collection", id));
  
  for (let i = 0; i < gids.length; i += NODES_BATCH_SIZE) {
    const batch = gids.slice(i, i + NODES_BATCH_SIZE);
    const idsJson = JSON.stringify(batch);
    const query = `{
      nodes(ids: ${idsJson}) {
        ... on Collection {
          ${COLLECTION_FRAGMENT}
        }
      }
    }`;
    const data = await gql(url, token, query);
    const nodes = data?.data?.nodes ?? [];
    if (nodes.length !== batch.length) {
      console.error(
        `[fetchCollectionsByIds] Mismatch: Requested ${batch.length} nodes, got ${nodes.length}`,
      );
    }
    for (let j = 0; j < nodes.length; j++) {
      const idx = i + j;
      const node = nodes[j];
      if (node) {
        results[idx] = gqlToRestCollection(node);
      }
    }
  }
  return results;
}

export async function fetchCollectionsByHandles(
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
        collections(first: 1, query: ${JSON.stringify(q)}) {
          nodes {
            id title handle
          }
        }
      }`;
      const data = await gql(url, token, query);
      const nodes = data?.data?.collections?.nodes ?? [];
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
