export type DisplayCurrency = "USD";

export type AgentPaySettings = {
  displayName: string;
  displayCurrency: DisplayCurrency;
  timeZone: string;
  updatedAt: string;
};

export type UpdateAgentPaySettings = {
  displayName: string;
  displayCurrency: DisplayCurrency;
  timeZone: string;
};

export const DEFAULT_AGENTPAY_SETTINGS: UpdateAgentPaySettings = {
  displayName: "Mark",
  displayCurrency: "USD",
  timeZone: "UTC",
};
