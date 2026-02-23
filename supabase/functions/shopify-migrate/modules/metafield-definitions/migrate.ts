import { fetchMetafieldDefinitions } from "./fetch.ts";
import { gql } from "../../_shared/client.ts";
import { MigrateRequest, Result } from "../../_shared/types.ts";
import { BATCH_SIZE, BATCH_DELAY_MS, sleep } from "../../_shared/utils.ts";
import { Logger } from "../../_shared/logger.ts";

export async function migrateMetafieldDefinitions(
  req: MigrateRequest,
): Promise<Result[]> {
  const { sourceShop: src, targetShop: tgt, itemIds: defKeys, conflictMode: cm, dryRun: dry, metafieldsOwnerType } = req;
  const logger = new Logger("METAFIELD_DEF");
  const results: Result[] = [];
  const ownerType = metafieldsOwnerType || "PRODUCT";

  logger.info(`Fetching metafield definitions for ${ownerType}...`);

  const srcDefs = await fetchMetafieldDefinitions(src.url, src.token, ownerType);
  const tgtDefs = await fetchMetafieldDefinitions(tgt.url, tgt.token, ownerType);

  // Filter to selected keys (namespace.key format)
  const selected = srcDefs.filter((d: any) =>
    defKeys.includes(`${d.namespace}.${d.key}`),
  );

  if (selected.length === 0) {
    results.push({
      id: ownerType,
      title: `Metafeld-Definitionen (${ownerType})`,
      status: "skipped",
      message: "Keine passenden Definitionen gefunden",
    });
    return results;
  }

  // Iterate with BATCH_SIZE (1)
  for (let i = 0; i < selected.length; i += BATCH_SIZE) {
    const batch = selected.slice(i, i + BATCH_SIZE);
    
    for (let j = 0; j < batch.length; j++) {
        const def = batch[j];
        
        // Delay logic if batch > 1, but we iterate 1 by 1 anyway effectively with current logic structure
        // If we process multiple, we sleep between items or batches.
        // Original logic: if (_i > 0 && _i % BATCH_SIZE === 0) await sleep(BATCH_DELAY_MS);
        // Here we handle batching by loop.
        
        const title = `${def.namespace}.${def.key} (${def.name})`;
        logger.info(`Migrating definition: ${title}`);

        const existing = tgtDefs.find(
          (t: any) => t.namespace === def.namespace && t.key === def.key,
        );

        if (existing && cm === "skip") {
          results.push({
            id: def.id,
            title,
            status: "skipped",
            message: "Bereits vorhanden",
          });
          continue;
        }

        if (existing && cm === "ask") {
          results.push({
            id: def.id,
            title,
            status: "conflict",
            message: "Bereits vorhanden",
            sourceData: def,
            targetData: existing,
          });
          continue;
        }

        if (existing && cm === "overwrite") {
          // Update existing definition
          if (dry) {
            results.push({
              id: def.id,
              title,
              status: "updated",
              message: "Testlauf",
            });
            continue;
          }
          try {
            const updateMutation = `mutation($definition: MetafieldDefinitionUpdateInput!) {
              metafieldDefinitionUpdate(definition: $definition) {
                updatedDefinition { id }
                userErrors { field message }
              }
            }`;
            const updateInput: any = {
              namespace: def.namespace,
              key: def.key,
              ownerType: def.ownerType,
              name: def.name,
              description: def.description || undefined,
            };
            if (def.pinnedPosition != null) updateInput.pin = true;
            const ur = await gql(tgt.url, tgt.token, updateMutation, {
              definition: updateInput,
            });
            const ue = ur?.data?.metafieldDefinitionUpdate?.userErrors;
            if (ue?.length > 0) {
              results.push({
                id: def.id,
                title,
                status: "error",
                message: ue.map((e: any) => e.message).join(", "),
              });
            } else {
              results.push({ id: def.id, title, status: "updated" });
            }
          } catch (e: any) {
            logger.error(`Error updating definition ${title}`, e);
            results.push({
              id: def.id,
              title,
              status: "error",
              message: e.message,
            });
          }
          continue;
        }

        if (existing) {
          results.push({
            id: def.id,
            title,
            status: "skipped",
            message: "Bereits vorhanden",
          });
          continue;
        }

        // Create new definition
        if (dry) {
          results.push({
            id: def.id,
            title,
            status: "created",
            message: "Testlauf",
          });
          continue;
        }

        try {
          const createMutation = `mutation($definition: MetafieldDefinitionInput!) {
            metafieldDefinitionCreate(definition: $definition) {
              createdDefinition { id }
              userErrors { field message }
            }
          }`;
          const createInput: any = {
            name: def.name,
            namespace: def.namespace,
            key: def.key,
            type: def.type.name,
            ownerType: def.ownerType,
            description: def.description || undefined,
            pin: def.pinnedPosition != null,
          };
          if (def.validations?.length > 0) {
            createInput.validations = def.validations.map((v: any) => ({
              name: v.name,
              value: v.value,
            }));
          }
          const cr = await gql(tgt.url, tgt.token, createMutation, {
            definition: createInput,
          });
          const ce = cr?.data?.metafieldDefinitionCreate?.userErrors;
          if (ce?.length > 0) {
            results.push({
              id: def.id,
              title,
              status: "error",
              message: ce.map((e: any) => e.message).join(", "),
            });
          } else {
            results.push({ id: def.id, title, status: "created" });
          }
        } catch (e: any) {
          logger.error(`Error creating definition ${title}`, e);
          results.push({ id: def.id, title, status: "error", message: e.message });
        }
    }
    
    if (i + BATCH_SIZE < selected.length) {
        await sleep(BATCH_DELAY_MS);
    }
  }

  return results;
}
