import { supabase } from "@/integrations/supabase/client";

interface ShopifyProxyRequest {
  shopUrl: string;
  accessToken: string;
  endpoint?: string;
  method?: string;
  body?: unknown;
  graphql?: { query: string; variables?: Record<string, unknown> };
}

export async function shopifyProxy(req: ShopifyProxyRequest) {
  const { data, error } = await supabase.functions.invoke("shopify-proxy", {
    body: req,
  });
  if (error) throw new Error(error.message);
  // Check for GraphQL-level errors
  if (req.graphql && data?.errors?.length > 0) {
    const msg = data.errors.map((e: any) => e.message).join("; ");
    throw new Error(msg);
  }
  return data;
}

const numId = (gid: string) => (gid || "").split("/").pop() ?? "";

async function gqlPaginateNodes(
  shopUrl: string,
  accessToken: string,
  buildQuery: (cursor: string | null) => string,
  extractConnection: (data: any) => {
    nodes: any[];
    pageInfo: { hasNextPage: boolean; endCursor?: string | null };
  },
): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | null = null;
  let hasNext = true;
  while (hasNext) {
    const data = await shopifyProxy({
      shopUrl,
      accessToken,
      graphql: { query: buildQuery(cursor) },
    });
    const conn = extractConnection(data);
    const nodes = conn?.nodes ?? [];
    all.push(...nodes);
    hasNext = conn?.pageInfo?.hasNextPage ?? false;
    cursor = conn?.pageInfo?.endCursor ?? null;
  }
  return all;
}

export async function testConnection(shopUrl: string, accessToken: string) {
  const data = await shopifyProxy({
    shopUrl,
    accessToken,
    endpoint: "/admin/api/2024-01/shop.json",
  });
  return data?.shop;
}

export async function fetchProducts(shopUrl: string, accessToken: string) {
  const nodes = await gqlPaginateNodes(
    shopUrl,
    accessToken,
    (cursor) =>
      `{ products(first: 250${cursor ? `, after: "${cursor}"` : ""}) { nodes { id title handle } pageInfo { hasNextPage endCursor } } }`,
    (d) => d?.data?.products,
  );
  return nodes.map((n: any) => ({
    id: numId(n.id),
    title: n.title,
    handle: n.handle,
  }));
}

export async function fetchCollections(shopUrl: string, accessToken: string) {
  const nodes = await gqlPaginateNodes(
    shopUrl,
    accessToken,
    (cursor) =>
      `{ collections(first: 250${cursor ? `, after: "${cursor}"` : ""}) { nodes { id title handle ruleSet { rules { column } } } pageInfo { hasNextPage endCursor } } }`,
    (d) => d?.data?.collections,
  );
  return nodes.map((n: any) => ({
    id: numId(n.id),
    title: n.title,
    handle: n.handle,
    type: n.ruleSet?.rules?.length ? "smart" : "custom",
  }));
}

export async function fetchPages(shopUrl: string, accessToken: string) {
  const nodes = await gqlPaginateNodes(
    shopUrl,
    accessToken,
    (cursor) =>
      `{ pages(first: 250${cursor ? `, after: "${cursor}"` : ""}) { nodes { id title handle } pageInfo { hasNextPage endCursor } } }`,
    (d) => d?.data?.pages,
  );
  return nodes.map((n: any) => ({
    id: numId(n.id),
    title: n.title,
    handle: n.handle,
  }));
}

export async function fetchBlogs(shopUrl: string, accessToken: string) {
  const blogNodes = await gqlPaginateNodes(
    shopUrl,
    accessToken,
    (cursor) =>
      `{ blogs(first: 50${cursor ? `, after: "${cursor}"` : ""}) { nodes { id title handle } pageInfo { hasNextPage endCursor } } }`,
    (d) => d?.data?.blogs,
  );
  const result: any[] = [];
  for (const blog of blogNodes) {
    const blogGid = blog.id;
    const articleNodes = await gqlPaginateNodes(
      shopUrl,
      accessToken,
      (cursor) =>
        `{ blog(id: "${blogGid}") { articles(first: 250${cursor ? `, after: "${cursor}"` : ""}) { nodes { id title handle } pageInfo { hasNextPage endCursor } } } }`,
      (d) => d?.data?.blog?.articles,
    );
    result.push({
      id: numId(blog.id),
      title: blog.title,
      handle: blog.handle,
      articles: articleNodes.map((a: any) => ({
        id: numId(a.id),
        title: a.title,
        handle: a.handle,
      })),
    });
  }
  return result;
}

// Fetch metaobject definitions via GraphQL with cursor pagination
export async function fetchMetaobjects(shopUrl: string, accessToken: string) {
  const definitions: any[] = [];
  let cursor: string | null = null;
  let hasNext = true;
  while (hasNext) {
    const query = `{
      metaobjectDefinitions(first: 50${cursor ? `, after: "${cursor}"` : ""}) {
        edges {
          node {
            id
            name
            type
            fieldDefinitions {
              key
              name
              type { name }
              required
            }
          }
          cursor
        }
        pageInfo { hasNextPage }
      }
    }`;
    const data = await shopifyProxy({
      shopUrl,
      accessToken,
      graphql: { query },
    });
    const edges = data?.data?.metaobjectDefinitions?.edges ?? [];
    definitions.push(...edges.map((e: any) => e.node));
    hasNext = data?.data?.metaobjectDefinitions?.pageInfo?.hasNextPage ?? false;
    cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
  }

  if (definitions.length === 0) return [];

  const result: any[] = [];
  for (const def of definitions) {
    let count = 0;
    try {
      let entryCursor: string | null = null;
      let entryHasNext = true;
      while (entryHasNext) {
        const countQuery = `{
          metaobjects(type: "${def.type}", first: 250${entryCursor ? `, after: "${entryCursor}"` : ""}) {
            edges { node { id } cursor }
            pageInfo { hasNextPage }
          }
        }`;
        const countData = await shopifyProxy({
          shopUrl,
          accessToken,
          graphql: { query: countQuery },
        });
        const edges = countData?.data?.metaobjects?.edges ?? [];
        count += edges.length;
        entryHasNext =
          countData?.data?.metaobjects?.pageInfo?.hasNextPage ?? false;
        entryCursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
      }
    } catch {
      /* ignore */
    }

    result.push({
      id: def.id,
      title: def.name,
      handle: def.type,
      name: `${def.name} (${count} Einträge)`,
      type: def.type,
      fieldDefinitions: def.fieldDefinitions,
    });
  }
  return result;
}

// Fetch metafield definitions for a specific owner type via GraphQL with cursor pagination
export async function fetchMetafieldDefinitions(
  shopUrl: string,
  accessToken: string,
  ownerType: string,
) {
  const allNodes: any[] = [];
  let cursor: string | null = null;
  let hasNext = true;
  while (hasNext) {
    const query = `{
      metafieldDefinitions(ownerType: ${ownerType}, first: 100${cursor ? `, after: "${cursor}"` : ""}) {
        edges {
          node {
            id
            name
            namespace
            key
            type { name }
            description
            ownerType
          }
          cursor
        }
        pageInfo { hasNextPage }
      }
    }`;
    const data = await shopifyProxy({
      shopUrl,
      accessToken,
      graphql: { query },
    });
    const edges = data?.data?.metafieldDefinitions?.edges ?? [];
    allNodes.push(...edges.map((e: any) => e.node));
    hasNext = data?.data?.metafieldDefinitions?.pageInfo?.hasNextPage ?? false;
    cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
  }

  return allNodes.map((node: any) => ({
    id: `${node.namespace}.${node.key}`,
    title: node.name,
    name: node.name,
    handle: `${node.namespace}.${node.key}`,
    namespace: node.namespace,
    key: node.key,
    typeName: node.type?.name,
    description: node.description,
    ownerType: node.ownerType,
  }));
}
