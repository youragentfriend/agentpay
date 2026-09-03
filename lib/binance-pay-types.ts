export type BinancePayStatus =
  | "AWAITING_CONFIRMATION"
  | "AWAITING_AMOUNT"
  | "AMOUNT_SET"
  | "AMOUNT_LOCKED"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "ERROR";

export interface BinancePayOrder {
  status: BinancePayStatus;
  checkout_id?: string;
  pay_order_id?: string;
  payment_type?: "C2C" | "PIX";
  payee?: string;
  amount?: string | number;
  amount_sent?: string | number;
  currency?: string;
  has_preset_amount?: boolean;
  single_transaction_limit?: string;
  daily_limit?: string;
  message?: string;
  hint?: string;
  code?: string | number;
  paid_with?: Array<{ asset: string; amount: string; price?: string }>;
}

export interface BinancePayCapability {
  configured: boolean;
  executionEnabled: boolean;
  imageDecodeReady: boolean;
  missing: string[];
}
