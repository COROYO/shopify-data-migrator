import { numId } from "../../_shared/utils.ts";

const SORT_ORDER_MAP: Record<string, string> = {
  PRICE_DESC: "price-desc",
  PRICE_ASC: "price-asc",
  MANUAL: "manual",
  CREATED_DESC: "created-desc",
  CREATED: "created",
  BEST_SELLING: "best-selling",
  ALPHA_DESC: "alpha-des",
  ALPHA_ASC: "alpha-asc",
};

export function cleanCollection(c: any) {
  const {
    id,
    admin_graphql_api_id,
    created_at,
    updated_at,
    published_at,
    type,
    _type,
    ...rest
  } = c;
  if (rest.image) rest.image = { src: rest.image.src, alt: rest.image.alt };
  return rest;
}

export function gqlToRestCollection(c: any): any {
  const isSmart = c.ruleSet?.rules?.length > 0;
  return {
    id: numId(c.id),
    title: c.title ?? "",
    handle: c.handle ?? "",
    body_html: c.descriptionHtml ?? "",
    sort_order: SORT_ORDER_MAP[c.sortOrder] ?? c.sortOrder ?? "best-selling",
    template_suffix: c.templateSuffix ?? null,
    _type: isSmart ? "smart" : "custom",
    image: c.image ? { src: c.image.url, alt: c.image.altText ?? "" } : null,
    rules: isSmart
      ? c.ruleSet?.rules?.map((r: any) => ({
          column: r.column,
          relation: r.relation,
          condition: r.condition,
        }))
      : undefined,
    disjunctive: isSmart
      ? (c.ruleSet?.appliedDisjunctively ?? false)
      : undefined,
  };
}
