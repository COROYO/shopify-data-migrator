import { numId } from "../../_shared/utils.ts";

export function cleanPage(p: any) {
  const {
    id,
    admin_graphql_api_id,
    created_at,
    updated_at,
    published_at,
    shop_id,
    ...rest
  } = p;
  return rest;
}

export function gqlToRestPage(p: any): any {
  return {
    id: numId(p.id),
    title: p.title ?? "",
    handle: p.handle ?? "",
    body_html: p.body ?? "",
    template_suffix: p.templateSuffix ?? null,
    published: p.isPublished ?? false,
  };
}
