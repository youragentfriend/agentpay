export type DisplayCurrency = "USD";
export type PaymentRail = "binance-pay" | "x402" | "agentic-wallet";
export type SpendingLimit = { perPaymentUsdLimit: string | null; dailyUsdLimit: string | null };
export type SpendingLimits = Record<PaymentRail, SpendingLimit>;

export const SPENDING_LIMIT_RULES = {
  "binance-pay": { minimum: "0.0001", perPaymentMaximum: "50", dailyMaximum: "100", decimals: 4 },
  x402: { minimum: "0.0001", perPaymentMaximum: "20", dailyMaximum: "20", decimals: 4 },
  "agentic-wallet": { minimum: "0.00001", perPaymentMaximum: "50", dailyMaximum: "100", decimals: 5 },
} as const satisfies Record<PaymentRail, { minimum: string; perPaymentMaximum: string; dailyMaximum: string; decimals: number }>;

export function spendingLimitError(rail: PaymentRail, field: keyof SpendingLimit, value: string | null): string {
  const rule = SPENDING_LIMIT_RULES[rail];
  const maximum = field === "perPaymentUsdLimit" ? rule.perPaymentMaximum : rule.dailyMaximum;
  const label = field === "perPaymentUsdLimit" ? "Per-payment limit" : "Daily limit";
  const normalized = value?.trim() ?? "";
  if (!normalized) return `${label} is required.`;
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) return `${label} must be a valid USD amount.`;
  if (Number(normalized) < Number(rule.minimum) || Number(normalized) > Number(maximum)) return `${label} must be between $${rule.minimum} and $${maximum}.`;
  const decimalPlaces = normalized.includes(".") ? normalized.length - normalized.indexOf(".") - 1 : 0;
  if (decimalPlaces > rule.decimals) return `${label} supports up to ${rule.decimals} decimal places.`;
  return "";
}

export type AgentPaySettings = {
  displayName: string;
  profileImageDataUrl: string | null;
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
  profileImageDataUrl: string | null;
  displayCurrency: DisplayCurrency;
  timeZone: string;
  spendingLimits: SpendingLimits;
  trustedWalletDestinations: string[];
  trustedX402Hosts: string[];
};

export const DEFAULT_AGENTPAY_SETTINGS: UpdateAgentPaySettings = {
  displayName: "Mark",
  profileImageDataUrl: null,
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
