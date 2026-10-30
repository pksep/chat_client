import type { Ref } from 'vue';

export interface IQrAuthResult {
  token: string;
  organization?: string;
}

export type ParsedQrAuthPayload =
  | (IQrAuthResult & { code?: never })
  | { code: string; token?: never; organization: string };

export interface IQrAuth {
  isScanning: Ref<boolean>;
  scanQrCode: () => Promise<IQrAuthResult | null>;
}
