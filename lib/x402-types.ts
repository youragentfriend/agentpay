export type X402OptionStatus = "READY_TO_SIGN" | "ACTION_REQUIRED" | "NOT_SIGNABLE";
export type X402IntentStatus = "prepared" | "reviewed" | "approved" | "signing" | "approving" | "replaying" | "completed" | "cancelled" | "failed";
export type X402RequestMethod = "GET" | "POST";

export interface X402PaymentOption {
  index: number;
  status: X402OptionStatus;
  reasons: string[];
  scheme?: string;
  assetTransferMethod?: string;
  binanceChainId?: string;
  network?: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  amount?: string;
  amountUsd?: string;
  payTo?: string;
  userWalletAddress?: string;
  currentBalance?: string;
  currentBalanceUsd?: string;
  needApproveFirst?: boolean;
  originalAccept?: Record<string, unknown>;
}

export interface X402Preview { paymentId: string; options: X402PaymentOption[]; }
export interface X402Signature { paymentHeaderName: string; paymentHeaderValue: string; approveTxHash?: string | null; binanceChainId?: string | null; signatureExpiresAt: number; }

export interface X402Result {
  kind: "json" | "text";
  body: unknown;
  truncated: boolean;
  sourceUrl: string;
  requestMethod: X402RequestMethod;
  contentType?: string;
  responseStatus: number;
}

export interface X402Intent {
  id: string;
  resourceUrl: string;
  resourceHost: string;
  requestMethod: X402RequestMethod;
  requestBody?: string;
  source: "ai" | "catalog" | "direct";
  catalogResourceId?: string;
  userRequest?: string;
  status: X402IntentStatus;
  paymentId: string;
  options: X402PaymentOption[];
  selectedIndex?: number;
  selectedOption?: X402PaymentOption;
  amountUsd?: string;
  reviewedAt?: string;
  approvedAt?: string;
  paidAt?: string;
  responseStatus?: number;
  responseContentType?: string;
  responseBody?: string;
  responseKind?: "json" | "text";
  resultTruncated?: boolean;
  settlementTxHash?: string;
  approvalTxHash?: string;
  receipt?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  deliveryStatus?: "pending" | "delivered" | "paid_but_invalid" | "paid_but_failed" | "failed_before_payment" | "cancelled";
}

export type X402ChatRole = "user" | "assistant";
export interface X402ChatMessage { id: string; role: X402ChatRole; content: string; createdAt: string; }
export interface X402ChatSession { id: string; status: "active" | "awaiting_confirmation" | "completed" | "cancelled" | "failed"; messages: X402ChatMessage[]; intentId?: string; updatedAt: string; }

export interface X402CatalogPaymentOption { scheme?: string; network: string; asset?: string; amount?: string; payTo?: string; }
export interface X402CatalogResource {
  id: string;
  source: string;
  resourceUrl: string;
  resourceHost: string;
  description: string;
  category?: string;
  method: X402RequestMethod;
  requestBody?: unknown;
  networks: string[];
  paymentOptions: X402CatalogPaymentOption[];
  trusted: boolean;
  allowlisted: boolean;
}
export interface X402LlmStatus { configured: boolean; provider: string | null; model: string | null; }
export interface X402AiDiscovery { configured: boolean; message: string; candidateIds: string[]; candidates: X402CatalogResource[]; }
