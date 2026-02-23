import { gqlPaginateAll } from "../../_shared/client.ts";

export async function fetchMetafieldDefinitions(
  url: string,
  token: string,
  ownerType: string,
) {
  const buildMfQuery = (cursor: string | null) => `{
    metafieldDefinitions(ownerType: ${ownerType}, first: 100${cursor ? `, after: "${cursor}"` : ""}) {
      edges {
        node {
          id name namespace key
          type { name }
          description
          ownerType
          pinnedPosition
          validations { name value }
        }
        cursor
      }
      pageInfo { hasNextPage }
    }
  }`;
  const extractMf = (data: any) => data?.data?.metafieldDefinitions;
  return await gqlPaginateAll(
    url,
    token,
    buildMfQuery,
    extractMf,
  );
}
