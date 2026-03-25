export type LarkTokenType = 'tenant' | 'user';

export interface LarkClientConfig {
  baseUrl: string;
  appId: string;
  appSecret: string;
  tokenType: LarkTokenType;
  userAccessToken: string;
}

export interface LarkAuthTokenResponse {
  tenant_access_token: string;
  expire: number;
}

export interface LarkDocxBlock {
  block_id: string;
  parent_id: string;
  block_type: number;
  /**
   * Optional in real API payloads.
   * Some leaf blocks omit `children` entirely instead of returning `[]`.
   */
  children?: string[];
  [key: string]: unknown;
}

export interface LarkDocxListBlocksResponse {
  items: LarkDocxBlock[];
  has_more: boolean;
  page_token: string;
}

export interface LarkDriveFile {
  token: string;
  name: string;
  type: string;
  parent_token?: string;
  url?: string;
  owner_id?: string;
  created_time?: string;
  modified_time?: string;
}

export interface LarkDriveListFilesResponse {
  files: LarkDriveFile[];
  has_more: boolean;
  next_page_token: string;
}

export interface LarkApiEnvelope<TData> {
  code: number;
  msg: string;
  data?: TData;
  request_id?: string;
}
