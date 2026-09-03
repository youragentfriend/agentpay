export type PaymentRail = "agentic-wallet" | "binance-pay" | "x402" | "onchain-pay";

export type PaymentStatus =
  | "discovered"
  | "prepared"
  | "awaiting-approval"
  | "submitted"
  | "verifying"
  | "succeeded"
  | "failed"
  | "expired";

export interface PaymentIntent {
  id: string;
  instruction: string;
  amount?: string;
  asset?: string;
  destination?: string;
  resourceUrl?: string;
  rail?: PaymentRail;
  network?: string;
  purpose?: string;
}

export interface Approval {
  id: string;
  paymentIntentId: string;
  summary: string;
  required: boolean;
  approvedAt?: string;
}

export interface PaymentAttempt {
  id: string;
  paymentIntentId: string;
  rail: PaymentRail;
  status: PaymentStatus;
  providerReference?: string;
  transactionHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Receipt {
  id: string;
  paymentAttemptId: string;
  status: Extract<PaymentStatus, "succeeded" | "failed" | "expired">;
  amount?: string;
  asset?: string;
  rail: PaymentRail;
  providerReference?: string;
  transactionHash?: string;
  completedAt: string;
}
