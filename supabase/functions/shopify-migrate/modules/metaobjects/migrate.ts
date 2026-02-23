import { fetchMetaobjectDefinitions } from "./fetch.ts";
import { gql } from "../../_shared/client.ts";
import { MigrateRequest, Result } from "../../_shared/types.ts";
import { BATCH_SIZE, BATCH_DELAY_MS, sleep } from "../../_shared/utils.ts";
import { Logger } from "../../_shared/logger.ts";

export async function migrateMetaobjects(
  req: MigrateRequest,
): Promise<Result[]> {
  const { sourceShop: src, targetShop: tgt, itemIds: defIds, conflictMode: cm, dryRun: dry } = req;
  const logger = new Logger("METAOBJECT");
  const results: Result[] = [];

  logger.info(`Processing ${defIds.length} metaobject definitions...`);

  const srcDefs = await fetchMetaobjectDefinitions(src.url, src.token);
  const tgtDefs = await fetchMetaobjectDefinitions(tgt.url, tgt.token);
  
  const selected = srcDefs.filter((d: any) => defIds.includes(d.id));

  for (const def of selected) {
    logger.info(`Migrating definition: ${def.name} (${def.type})`);
    
    const existing = tgtDefs.find((t: any) => t.type === def.type);
    
    // 1. Definition Migration
    if (existing) {
      if (cm === "skip") {
        results.push({
          id: def.id,
          title: `Def: ${def.name}`,
          status: "skipped",
          message: "Bereits vorhanden",
        });
      } else if (cm === "ask") {
        results.push({
          id: def.id,
          title: `Def: ${def.name}`,
          status: "conflict",
          message: "Bereits vorhanden",
          sourceData: def,
          targetData: existing,
        });
      } else if (!dry) {
        // overwrite — skip definition update for metaobjects for now
        results.push({
          id: def.id,
          title: `Def: ${def.name}`,
          status: "skipped",
          message: "Bereits vorhanden",
        });
      } else {
        results.push({
          id: def.id,
          title: `Def: ${def.name}`,
          status: "updated",
          message: "Testlauf",
        });
      }
    } else {
      if (dry) {
        results.push({
          id: def.id,
          title: `Def: ${def.name}`,
          status: "created",
          message: "Testlauf",
        });
      } else {
        try {
          const m = `mutation($d: MetaobjectDefinitionCreateInput!) { metaobjectDefinitionCreate(definition: $d) { metaobjectDefinition { id } userErrors { field message } } }`;
          const fd = def.fieldDefinitions.map((f: any) => ({
            key: f.key,
            name: f.name,
            type: f.type.name,
            required: f.required,
            description: f.description || undefined,
            validations: f.validations?.length > 0 ? f.validations : undefined,
          }));
          const r = await gql(tgt.url, tgt.token, m, {
            d: {
              type: def.type,
              name: def.name,
              fieldDefinitions: fd,
              access: { storefront: "PUBLIC_READ" },
            },
          });
          const ue = r?.data?.metaobjectDefinitionCreate?.userErrors;
          if (ue?.length > 0) {
            results.push({
              id: def.id,
              title: `Def: ${def.name}`,
              status: "error",
              message: ue.map((e: any) => e.message).join(", "),
            });
          } else {
            results.push({
              id: def.id,
              title: `Def: ${def.name}`,
              status: "created",
            });
          }
        } catch (e: any) {
          logger.error(`Error creating definition ${def.name}`, e);
          results.push({
            id: def.id,
            title: `Def: ${def.name}`,
            status: "error",
            message: e.message,
          });
        }
      }
    }

    // 2. Entries Migration
    logger.info(`Fetching entries for ${def.type}...`);
    
    let cursor: string | null = null;
    let hasNext = true;
    const entries: any[] = [];
    while (hasNext) {
      const eq = `{ metaobjects(type: "${def.type}", first: 50${cursor ? `, after: "${cursor}"` : ""}) { edges { node { id handle fields { key value } } cursor } pageInfo { hasNextPage } } }`;
      const ed = await gql(src.url, src.token, eq);
      const edges = ed?.data?.metaobjects?.edges ?? [];
      entries.push(...edges.map((e: any) => e.node));
      hasNext = ed?.data?.metaobjects?.pageInfo?.hasNextPage ?? false;
      cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
    }

    const tgtEntries: any[] = [];
    let tc: string | null = null;
    let th = true;
    while (th) {
      try {
        const tq = `{ metaobjects(type: "${def.type}", first: 50${tc ? `, after: "${tc}"` : ""}) { edges { node { id handle } cursor } pageInfo { hasNextPage } } }`;
        const td = await gql(tgt.url, tgt.token, tq);
        const te = td?.data?.metaobjects?.edges ?? [];
        tgtEntries.push(...te.map((e: any) => e.node));
        th = td?.data?.metaobjects?.pageInfo?.hasNextPage ?? false;
        tc = te.length > 0 ? te[te.length - 1].cursor : null;
      } catch {
        th = false;
      }
    }

    // Iterate entries with BATCH_SIZE (1)
    for (let _i = 0; _i < entries.length; _i++) {
      if (_i > 0 && _i % BATCH_SIZE === 0) await sleep(BATCH_DELAY_MS);
      const entry = entries[_i];
      const title = `${def.name}: ${entry.handle || entry.id}`;
      logger.info(`  Migrating entry: ${title}`);

      const ex = tgtEntries.find((t: any) => t.handle === entry.handle);
      
      if (ex && cm === "skip") {
        results.push({
          id: entry.id,
          title,
          status: "skipped",
          message: "Bereits vorhanden",
        });
        continue;
      }
      
      if (ex && cm === "ask") {
        results.push({
          id: entry.id,
          title,
          status: "conflict",
          message: "Bereits vorhanden",
          sourceData: entry,
          targetData: ex,
        });
        continue;
      }
      
      if (dry) {
        results.push({
          id: entry.id,
          title,
          status: ex ? "updated" : "created",
          message: "Testlauf",
        });
        continue;
      }
      
      const fields =
        entry.fields
          ?.filter((f: any) => f.value != null && f.value !== "")
          .map((f: any) => ({ key: f.key, value: f.value })) ?? [];
          
      try {
        if (ex && cm === "overwrite") {
          const um = `mutation($id: ID!, $m: MetaobjectUpdateInput!) { metaobjectUpdate(id: $id, metaobject: $m) { metaobject { id } userErrors { field message } } }`;
          const ur = await gql(tgt.url, tgt.token, um, {
            id: ex.id,
            m: { fields },
          });
          const ue = ur?.data?.metaobjectUpdate?.userErrors;
          results.push({
            id: entry.id,
            title,
            status: ue?.length > 0 ? "error" : "updated",
            message:
              ue?.length > 0
                ? ue.map((e: any) => e.message).join(", ")
                : undefined,
          });
        } else if (!ex) {
          const cm2 = `mutation($m: MetaobjectCreateInput!) { metaobjectCreate(metaobject: $m) { metaobject { id } userErrors { field message } } }`;
          const cr = await gql(tgt.url, tgt.token, cm2, {
            m: { type: def.type, handle: entry.handle, fields },
          });
          const ce = cr?.data?.metaobjectCreate?.userErrors;
          results.push({
            id: entry.id,
            title,
            status: ce?.length > 0 ? "error" : "created",
            message:
              ce?.length > 0
                ? ce.map((e: any) => e.message).join(", ")
                : undefined,
          });
        }
      } catch (e: any) {
        logger.error(`  Error processing entry ${title}`, e);
        results.push({
          id: entry.id,
          title,
          status: "error",
          message: e.message,
        });
      }
    }
  }
  return results;
}
