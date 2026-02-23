import { numId } from "../../_shared/utils.ts";

export function cleanArticle(a: any) {
  const {
    id,
    admin_graphql_api_id,
    created_at,
    updated_at,
    blog_id,
    user_id,
    ...rest
  } = a;
  if (rest.image) rest.image = { src: rest.image.src, alt: rest.image.alt };
  return rest;
}

export function gqlToRestArticle(a: any): any {
  return {
    id: numId(a.id),
    title: a.title ?? "",
    handle: a.handle ?? "",
    body_html: a.contentHtml ?? "",
    summary: a.summary ?? "",
    tags: Array.isArray(a.tags) ? a.tags.join(", ") : (a.tags ?? ""),
    author: a.author?.name ?? "",
    image: a.image ? { src: a.image.url, alt: a.image.altText ?? "" } : null,
    published: a.isPublished ?? false,
  };
}

export function gqlToRestBlog(b: any): any {
  const commentable =
    b.commentPolicy === "OPEN"
      ? "yes"
      : b.commentPolicy === "MODERATE"
        ? "moderate"
        : "no";
  return {
    id: numId(b.id),
    title: b.title ?? "",
    handle: b.handle ?? "",
    commentable,
    template_suffix: b.templateSuffix ?? null,
  };
}
