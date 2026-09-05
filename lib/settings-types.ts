export type DisplayCurrency = "USD";

export type AgentPaySettings = {
  displayName: string;
  displayCurrency: DisplayCurrency;
  timeZone: string;
  requireApproval: true;
  perPaymentUsdLimit: string | null;
  dailyUsdLimit: string | null;
  trustedWalletDestinations: string[];
  trustedX402Hosts: string[];
  updatedAt: string;
};

export type UpdateAgentPaySettings = {
  displayName: string;
  displayCurrency: DisplayCurrency;
  timeZone: string;
  perPaymentUsdLimit: string | null;
  dailyUsdLimit: string | null;
  trustedWalletDestinations: string[];
  trustedX402Hosts: string[];
};

export const DEFAULT_AGENTPAY_SETTINGS: UpdateAgentPaySettings = {
  displayName: "Mark",
  displayCurrency: "USD",
  timeZone: "UTC",
  perPaymentUsdLimit: null,
  dailyUsdLimit: null,
  trustedWalletDestinations: [],
  trustedX402Hosts: [],
};
