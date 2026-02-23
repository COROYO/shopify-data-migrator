export interface MigrateRequest {
  sourceShop: { url: string; token: string };
  targetShop: { url: string; token: string };
  dataType: string;
  itemIds: string[];
  conflictMode: "overwrite" | "skip" | "ask";
  dryRun: boolean;
  metafieldsOwnerType?: string;
}

export type Result = {
  id: string;
  title: string;
  status: "created" | "updated" | "skipped" | "error" | "conflict";
  message?: string;
  sourceData?: any;
  targetData?: any;
};

export interface PageInfo {
  hasNextPage: boolean;
  endCursor?: string | null;
}

export interface Connection<T> {
  edges: { node: T; cursor: string }[];
  pageInfo: PageInfo;
}

export interface NodesConnection<T> {
  nodes: T[];
  pageInfo: PageInfo;
}
