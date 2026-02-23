import { gql } from "../../_shared/client.ts";
import {
  normalizeIds,
  toGid,
  NODES_BATCH_SIZE,
  numId,
  sleep,
  BATCH_DELAY_MS,
} from "../../_shared/utils.ts";
import { gqlToRestProduct } from "./transform.ts";

const PRODUCT_FRAGMENT = `
  id title handle descriptionHtml vendor productType
  tags status templateSuffix
  options { name values }
  variants(first: 250) {
    nodes {
      title price compareAtPrice sku barcode
      taxable
      selectedOptions { name value }
      inventoryItem {
        requiresShipping
        measurement {
          weight {
            value
            unit
          }
        }
      }
    }
  }
  images(first: 250) {
    nodes { url altText }
  }
`;

export async function fetchProductsByIds(
  url: string,
  token: string,
  ids: string[],
): Promise<(any | null)[]> {
  const normalized = normalizeIds(ids);
  if (normalized.length === 0) return [];
  const results: (any | null)[] = new Array(normalized.length).fill(null);
  const gids = normalized.map((id) => toGid("Product", id));

  // Note: We use NODES_BATCH_SIZE here because this is a bulk fetch operation
  // independent of the processing BATCH_SIZE (1)
  for (let i = 0; i < gids.length; i += NODES_BATCH_SIZE) {
    const batch = gids.slice(i, i + NODES_BATCH_SIZE);

    // Add delay between fetch batches to respect rate limits
    if (i > 0) await sleep(BATCH_DELAY_MS);

    const idsJson = JSON.stringify(batch);
    const query = `{
      nodes(ids: ${idsJson}) {
        ... on Product {
          ${PRODUCT_FRAGMENT}
        }
      }
    }`;
    const data = await gql(url, token, query);
    const nodes = data?.data?.nodes ?? [];
    if (nodes.length !== batch.length) {
      console.error(
        `[fetchProductsByIds] Mismatch: Requested ${batch.length} nodes, got ${nodes.length}`,
      );
    }
    for (let j = 0; j < nodes.length; j++) {
      const idx = i + j;
      const node = nodes[j];
      if (node) {
        results[idx] = gqlToRestProduct(node);
      }
    }
  }
  return results;
}

export async function fetchProductsByHandles(
  url: string,
  token: string,
  handles: string[],
): Promise<any[]> {
  if (handles.length === 0) return [];
  const results: any[] = [];

  // Checking handles individually or in small batches is safer for existence checks
  // but for performance we keep the loop logic.
  // Since we process 1 by 1 in migrate, we might just call this per item or
  // pre-fetch all. The original code pre-fetched all.
  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i];
    if (i > 0) await sleep(BATCH_DELAY_MS);

    try {
      const query = `query($id: ProductIdentifierInput!) {
        product: productByIdentifier(identifier: $id) {
          id title handle vendor productType
          variants(first: 1) { nodes { id } }
          images(first: 1) { nodes { url } }
        }
      }`;
      const data = await gql(url, token, query, {
        id: { handle },
      });
      const n = data?.data?.product;
      if (n) {
        results.push({
          id: numId(n.id),
          title: n.title,
          handle: n.handle,
          vendor: n.vendor,
          product_type: n.productType,
          variants: n.variants?.nodes?.length ?? 0,
          images: n.images?.nodes?.length ?? 0,
        });
      }
    } catch {
      /* ignore */
    }
  }
  return results;
}
