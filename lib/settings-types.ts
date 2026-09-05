export type DisplayCurrency = "USD";
export type PaymentRail = "binance-pay" | "x402" | "agentic-wallet";
export type SpendingLimit = { perPaymentUsdLimit: string | null; dailyUsdLimit: string | null };
export type SpendingLimits = Record<PaymentRail, SpendingLimit>;

export type AgentPaySettings = {
  displayName: string;
  displayCurrency: DisplayCurrency;
  timeZone: string;
  requireApproval: true;
  spendingLimits: SpendingLimits;
  trustedWalletDestinations: string[];
  trustedX402Hosts: string[];
  updatedAt: string;
};

export type UpdateAgentPaySettings = {
  displayName: string;
  displayCurrency: DisplayCurrency;
  timeZone: string;
  spendingLimits: SpendingLimits;
  trustedWalletDestinations: string[];
  trustedX402Hosts: string[];
};

export const DEFAULT_AGENTPAY_SETTINGS: UpdateAgentPaySettings = {
  displayName: "Mark",
  displayCurrency: "USD",
  timeZone: "UTC",
  spendingLimits: {
    "binance-pay": { perPaymentUsdLimit: "50", dailyUsdLimit: "100" },
    x402: { perPaymentUsdLimit: "20", dailyUsdLimit: "20" },
    "agentic-wallet": { perPaymentUsdLimit: "50", dailyUsdLimit: "100" },
  },
  trustedWalletDestinations: [],
  trustedX402Hosts: [],
};
