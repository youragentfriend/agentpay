import type { PaymentRail } from "@/lib/settings-types";
import { getPaymentExecutionControls } from "@/lib/server/settings-store";

export class PaymentExecutionError extends Error {
  constructor(message: string, public readonly code: "PAYMENT_SERVER_DISABLED" | "PAYMENTS_EMERGENCY_STOPPED" | "PAYMENT_RAIL_DISABLED") {
    super(message);
    this.name = "PaymentExecutionError";
  }
}

export function paymentRailServerEnabled(rail: PaymentRail) {
  if (rail === "agentic-wallet") return process.env.AGENTPAY_ENABLE_WALLET_SEND === "true";
  if (rail === "binance-pay") return process.env.AGENTPAY_ENABLE_BINANCE_PAY === "true";
  return process.env.AGENTPAY_ENABLE_X402 === "true";
}

export function getPaymentExecutionState() {
  const controls = getPaymentExecutionControls();
  const rails = Object.fromEntries((Object.keys(controls.rails) as PaymentRail[]).map((rail) => {
    const serverEnabled = paymentRailServerEnabled(rail);
    const userEnabled = controls.rails[rail];
    return [rail, { serverEnabled, userEnabled, effectiveEnabled: serverEnabled && controls.masterEnabled && userEnabled }];
  })) as Record<PaymentRail, { serverEnabled: boolean; userEnabled: boolean; effectiveEnabled: boolean }>;
  return { masterEnabled: controls.masterEnabled, updatedAt: controls.updatedAt, rails };
}

export function isPaymentRailEffectivelyEnabled(rail: PaymentRail) {
  return getPaymentExecutionState().rails[rail].effectiveEnabled;
}

export function assertPaymentExecutionAllowed(rail: PaymentRail) {
  if (!paymentRailServerEnabled(rail)) throw new PaymentExecutionError(`${rail === "agentic-wallet" ? "Agentic Wallet" : rail === "binance-pay" ? "Binance Pay" : "x402"} execution is disabled by server configuration.`, "PAYMENT_SERVER_DISABLED");
  const controls = getPaymentExecutionControls();
  if (!controls.masterEnabled) throw new PaymentExecutionError("The emergency stop is active. Enable payment execution in Rules & approvals before continuing.", "PAYMENTS_EMERGENCY_STOPPED");
  if (!controls.rails[rail]) throw new PaymentExecutionError(`${rail === "agentic-wallet" ? "Agentic Wallet" : rail === "binance-pay" ? "Binance Pay" : "x402"} execution is disabled in Rules & approvals.`, "PAYMENT_RAIL_DISABLED");
}
