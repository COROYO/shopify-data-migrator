import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "./_shared/utils.ts";
import { MigrateRequest, Result } from "./_shared/types.ts";
import { Logger } from "./_shared/logger.ts";
import { migrateProducts } from "./modules/products/migrate.ts";
import { migrateCollections } from "./modules/collections/migrate.ts";
import { migratePages } from "./modules/pages/migrate.ts";
import { migrateBlogs } from "./modules/blogs/migrate.ts";
import { migrateMetaobjects } from "./modules/metaobjects/migrate.ts";
import { migrateMetafieldDefinitions } from "./modules/metafield-definitions/migrate.ts";

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const body: MigrateRequest = await req.json();
    const { dataType, itemIds } = body;
    let results: Result[] = [];
    const logger = new Logger("MAIN");

    logger.info(
      `Received migration request for ${dataType} (${itemIds?.length} items)`,
    );

    switch (dataType) {
      case "products":
        results = await migrateProducts(body);
        break;
      case "collections":
        results = await migrateCollections(body);
        break;
      case "pages":
        results = await migratePages(body);
        break;
      case "blogs":
        results = await migrateBlogs(body);
        break;
      case "metaobjects":
        results = await migrateMetaobjects(body);
        break;
      case "metafield_definitions":
        results = await migrateMetafieldDefinitions(body);
        break;
      default:
        throw new Error(`Unsupported data type: ${dataType}`);
    }

    // Ensure results match itemIds length (simple error padding if mismatch)
    // Note: Some migrations like blogs/metaobjects might return more results (child items) or fewer (skipped)
    // The original logic padded errors for missing items.
    // For products/collections/pages it's 1:1 usually.
    if (
      results.length < itemIds.length &&
      ["products", "collections", "pages"].includes(dataType)
    ) {
      const missingCount = itemIds.length - results.length;
      logger.warn(
        `Result mismatch. Expected ${itemIds.length}, got ${results.length}. Padding with errors.`,
      );
      for (let k = 0; k < missingCount; k++) {
        const missingIdx = results.length;
        const missingId = itemIds[missingIdx] || "Unknown";
        results.push({
          id: String(missingId),
          title: "Unknown",
          status: "error",
          message: "Internal Error: Processing interrupted (Batch incomplete)",
        });
      }
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.status === "created").length,
      updated: results.filter((r) => r.status === "updated").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
      conflicts: results.filter((r) => r.status === "conflict").length,
    };

    logger.info(
      `Migration completed. Total results: ${results.length}`,
      summary,
    );

    return new Response(JSON.stringify({ results, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Critical error in migration handler:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
