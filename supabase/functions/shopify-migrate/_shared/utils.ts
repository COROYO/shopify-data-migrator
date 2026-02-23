export const BATCH_SIZE = 1;
export const BATCH_DELAY_MS = 200;
export const V = "2026-01";
export const NODES_BATCH_SIZE = 5;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function clean(shopUrl: string) {
  return shopUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function numId(gid: string) {
  return (gid || "").split("/").pop() ?? "";
}

export function toGid(
  type: "Product" | "Collection" | "Page" | "Blog" | "Article",
  id: string,
): string {
  const trimmed = String(id).trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("gid://")) return trimmed;
  return `gid://shopify/${type}/${trimmed}`;
}

export function normalizeIds(ids: string[]): string[] {
  return ids.map((id) => String(id).trim());
}

export function escapeHandleForQuery(handle: string): string {
  if (/^[a-zA-Z0-9_-]+$/.test(handle)) return handle;
  return `"${handle.replace(/"/g, '\\"')}"`;
}
