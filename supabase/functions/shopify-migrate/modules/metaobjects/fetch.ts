import { gqlPaginateAll } from "../../_shared/client.ts";

export async function fetchMetaobjectDefinitions(
  url: string,
  token: string,
) {
  const buildDefQuery = (cursor: string | null) =>
    `{ metaobjectDefinitions(first: 50${cursor ? `, after: "${cursor}"` : ""}) { edges { node { id name type fieldDefinitions { key name type { name } required description validations { name value } } } cursor } pageInfo { hasNextPage } } }`;
  const extractDefs = (data: any) => data?.data?.metaobjectDefinitions;
  return await gqlPaginateAll(
    url,
    token,
    buildDefQuery,
    extractDefs,
  );
}
