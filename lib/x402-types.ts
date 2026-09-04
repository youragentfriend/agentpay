export type X402OptionStatus = "READY_TO_SIGN" | "ACTION_REQUIRED" | "NOT_SIGNABLE";
export type X402IntentStatus = "awaiting-approval" | "signing" | "approving" | "completed" | "failed";

export interface X402PaymentOption {
  index: number;
  status: X402OptionStatus;
  reasons: string[];
  scheme?: string;
  assetTransferMethod?: string;
  binanceChainId?: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  amount?: string;
  amountUsd?: string;
  payTo?: string;
  userWalletAddress?: string;
  currentBalance?: string;
  currentBalanceUsd?: string;
  needApproveFirst?: boolean;
}

export interface X402Preview {
  paymentId: string;
  options: X402PaymentOption[];
}

export interface X402Signature {
  paymentHeaderName: string;
  paymentHeaderValue: string;
  approveTxHash?: string | null;
  binanceChainId?: string | null;
  signatureExpiresAt: number;
}

export interface X402Intent {
  id: string;
  resourceUrl: string;
  resourceHost: string;
  status: X402IntentStatus;
  paymentId: string;
  options: X402PaymentOption[];
  selectedIndex?: number;
  responseStatus?: number;
  responseContentType?: string;
  responseBody?: string;
  settlementTxHash?: string;
  approvalTxHash?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface X402BazaarResource {
  id: string;
  source: string;
  resourceUrl: string;
  resourceHost: string;
  description: string;
  method: string;
  networks: string[];
  bscOptions: Array<{ scheme?: string; network: string; asset?: string; amount?: string; payTo?: string }>;
  allowlisted: boolean;
}
