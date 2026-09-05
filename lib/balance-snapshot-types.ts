export type BalanceSnapshotSource = "agentic-wallet" | "binance-account";
export type BalanceSnapshotStatus = "captured" | "unavailable";

export type SnapshotBalance = {
  asset: string;
  total: string;
  usdValue: number | null;
};

export type BalanceSnapshot = {
  id: string;
  captureId: string;
  source: BalanceSnapshotSource;
  status: BalanceSnapshotStatus;
  totalUsd: number | null;
  assetCount: number;
  balances: SnapshotBalance[];
  message?: string;
  capturedAt: string;
};

export type BalanceSnapshotCapture = {
  captureId: string;
  snapshots: BalanceSnapshot[];
};
