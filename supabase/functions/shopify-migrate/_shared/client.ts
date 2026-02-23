import { clean } from "./utils.ts";

const GQL_API = "2024-10";
const DEBUG_GRAPHQL = Deno.env.get("DEBUG_GRAPHQL") === "1";

export async function shopGet(url: string, token: string, ep: string) {
  const res = await fetch(`https://${clean(url)}${ep}`, {
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GET ${ep} (${res.status}): ${t}`);
  }
  return res.json();
}

export async function shopPost(
  url: string,
  token: string,
  ep: string,
  body: unknown,
) {
  const res = await fetch(`https://${clean(url)}${ep}`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const d = await res.json();
  if (!res.ok) {
    throw new Error(`POST ${ep} (${res.status}): ${JSON.stringify(d)}`);
  }
  return d;
}

export async function shopPut(
  url: string,
  token: string,
  ep: string,
  body: unknown,
) {
  const res = await fetch(`https://${clean(url)}${ep}`, {
    method: "PUT",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const d = await res.json();
  if (!res.ok) {
    throw new Error(`PUT ${ep} (${res.status}): ${JSON.stringify(d)}`);
  }
  return d;
}

export async function gql(
  url: string,
  token: string,
  query: string,
  variables?: Record<string, unknown>,
) {
  const res = await fetch(
    `https://${clean(url)}/admin/api/${GQL_API}/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  const d = await res.json();
  if (DEBUG_GRAPHQL) {
    const queryPreview = query.replace(/\s+/g, " ").slice(0, 120);
    console.log("[GraphQL] query:", queryPreview + "...");
    console.log("[GraphQL] response:", JSON.stringify(d, null, 2));
  }
  if (d.errors) throw new Error(`GraphQL: ${JSON.stringify(d.errors)}`);
  return d;
}

export async function gqlPaginateNodes(
  url: string,
  token: string,
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
    const data = await gql(url, token, buildQuery(cursor));
    const conn = extractConnection(data);
    const nodes = conn?.nodes ?? [];
    all.push(...nodes);
    hasNext = conn?.pageInfo?.hasNextPage ?? false;
    cursor = conn?.pageInfo?.endCursor ?? null;
  }
  return all;
}

export async function gqlPaginateAll(
  url: string,
  token: string,
  buildQuery: (cursor: string | null) => string,
  extractEdges: (data: any) => {
    edges: any[];
    pageInfo: { hasNextPage: boolean };
  },
): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | null = null;
  let hasNext = true;
  while (hasNext) {
    const data = await gql(url, token, buildQuery(cursor));
    const connection = extractEdges(data);
    const edges = connection?.edges ?? [];
    all.push(...edges.map((e: any) => e.node));
    hasNext = connection?.pageInfo?.hasNextPage ?? false;
    cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
  }
  return all;
}
