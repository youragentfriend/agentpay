export type GasLevel = "LOW" | "MEDIUM" | "HIGH";

export interface PrepareTransferRequest {
  instruction?: string;
  amount?: string;
  recipient?: string;
  tokenAddress?: string;
  binanceChainId?: string;
  gasLevel?: GasLevel;
}

export interface PreparedTransfer {
  id: string;
  status: "awaiting-approval" | "approved";
  instruction?: string;
  amount: string;
  asset: string;
  availableBalance: string;
  recipient: string;
  tokenAddress: string;
  binanceChainId: string;
  chainName: string;
  gasLevel: GasLevel;
  createdAt: string;
  expiresAt: string;
  warnings: string[];
}

export interface PaymentApiError {
  error: string;
  code: string;
}
