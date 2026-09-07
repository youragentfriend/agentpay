export type OnchainPayOrderStatus =
  | "prepared"
  | "approved"
  | "link-created"
  | "waiting-for-binance"
  | "on-ramp-processing"
  | "on-ramp-completed"
  | "convert-processing"
  | "convert-completed"
  | "withdraw-initiated"
  | "withdraw-processing"
  | "completed"
  | "abandoned"
  | "failed"
  | "expired"
  | "unknown";

export interface OnchainPayNetwork {
  asset: string;
  network: string;
  addressRegex?: string;
  memoRegex?: string;
  withdrawFee: string;
  withdrawMinAmount: string;
  withdrawMaxAmount: string;
  contractAddress?: string;
  withdrawEnabled: boolean;
  depositEnabled: boolean;
}

export interface OnchainPayCatalog {
  assets: Array<{ asset: string; networks: OnchainPayNetwork[] }>;
  source: "live-binance" | "documented-preview";
  fetchedAt: string;
  warning?: string;
}

export interface OnchainPayCapability {
  configured: boolean;
  executionEnabled: boolean;
  liveDiscoveryEnabled: boolean;
  webhookReady: boolean;
  missing: string[];
  mode: "live" | "preview";
  message: string;
}

export interface OnchainPayOrder {
  id: string;
  externalOrderId: string;
  fingerprint: string;
  status: OnchainPayOrderStatus;
  providerStatus?: number;
  asset: string;
  network: string;
  address: string;
  memo?: string;
  amount: string;
  withdrawFee: string;
  netReceive: boolean;
  expectedReceive: string;
  catalogSource: OnchainPayCatalog["source"];
  orderLink?: string;
  linkExpireTime?: string;
  txHash?: string;
  providerOrderDetailLink?: string;
  amountUsd?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface OnchainPayPrepareInput {
  asset: string;
  network: string;
  address: string;
  memo?: string;
  amount: string;
  netReceive?: boolean;
  amountUsd?: string;
}
