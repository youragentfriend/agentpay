import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AgentPaySettings } from "@/lib/settings-types";
import { getAgentPaySettings } from "@/lib/server/settings-store";

const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const USD_EQUIVALENTS = new Set(["USD", "USDT", "USDC", "FDUSD"]);

export type PaymentPolicyInput = {
  rail: "agentic-wallet" | "binance-pay" | "x402";
  amountUsd?: string;
  destination?: string;
  x402Host?: string;
};

export class PaymentPolicyError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "PaymentPolicyError";
  }
}

function decimalParts(value: string): { units: bigint; scale: number } | undefined {
  if (!DECIMAL.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  return { units: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function align(left: string, right: string): [bigint, bigint, number] {
  const a = decimalParts(left);
  const b = decimalParts(right);
  if (!a || !b) throw new PaymentPolicyError("A USD value could not be evaluated safely.", "POLICY_AMOUNT_USD_REQUIRED");
  const scale = Math.max(a.scale, b.scale);
  return [a.units * BigInt(10) ** BigInt(scale - a.scale), b.units * BigInt(10) ** BigInt(scale - b.scale), scale];
}

export function addDecimalStrings(left: string, right: string): string {
  const [a, b, scale] = align(left, right);
  const raw = (a + b).toString().padStart(scale + 1, "0");
  if (scale === 0) return raw;
  const value = `${raw.slice(0, -scale)}.${raw.slice(-scale)}`.replace(/\.?0+$/, "");
  return value || "0";
}

export function multiplyDecimalStrings(left: string, right: string): string | undefined {
  const a = decimalParts(left);
  const b = decimalParts(right);
  if (!a || !b) return undefined;
  const scale = a.scale + b.scale;
  const raw = (a.units * b.units).toString().padStart(scale + 1, "0");
  if (scale === 0) return raw;
  return `${raw.slice(0, -scale)}.${raw.slice(-scale)}`.replace(/\.?0+$/, "") || "0";
}

function greaterThan(left: string, right: string): boolean {
  const [a, b] = align(left, right);
  return a > b;
}

export function usdAmountForCurrency(amount: unknown, currency: unknown): string | undefined {
  const value = typeof amount === "number" ? String(amount) : typeof amount === "string" ? amount.trim() : "";
  const symbol = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  return USD_EQUIVALENTS.has(symbol) && decimalParts(value) ? value : undefined;
}

export function evaluatePaymentPolicy(
  input: PaymentPolicyInput,
  settings: AgentPaySettings,
  currentDailySpendUsd = "0",
): void {
  if (settings.requireApproval !== true) throw new PaymentPolicyError("Mandatory payment approval is not enabled.", "POLICY_APPROVAL_REQUIRED");

  const limits = settings.spendingLimits[input.rail];
  const hasMonetaryRule = limits.perPaymentUsdLimit !== null || limits.dailyUsdLimit !== null;
  const amountUsd = input.amountUsd?.trim();
  if (hasMonetaryRule && (!amountUsd || !decimalParts(amountUsd))) {
    throw new PaymentPolicyError("This payment has no reliable USD valuation, so configured spending limits cannot be evaluated.", "POLICY_AMOUNT_USD_REQUIRED");
  }
  if (amountUsd && limits.perPaymentUsdLimit && greaterThan(amountUsd, limits.perPaymentUsdLimit)) {
    throw new PaymentPolicyError(`Payment exceeds the $${limits.perPaymentUsdLimit} ${input.rail} per-payment limit.`, "POLICY_PER_PAYMENT_LIMIT_EXCEEDED");
  }
  if (amountUsd && limits.dailyUsdLimit && greaterThan(addDecimalStrings(currentDailySpendUsd, amountUsd), limits.dailyUsdLimit)) {
    throw new PaymentPolicyError(`Payment would exceed the $${limits.dailyUsdLimit} ${input.rail} daily limit.`, "POLICY_DAILY_LIMIT_EXCEEDED");
  }

  if (input.destination && settings.trustedWalletDestinations.length > 0) {
    const normalized = input.destination.startsWith("0x") ? input.destination.toLowerCase() : input.destination;
    if (!settings.trustedWalletDestinations.includes(normalized)) {
      throw new PaymentPolicyError("Wallet destination is not in the trusted destination list.", "POLICY_DESTINATION_NOT_TRUSTED");
    }
  }
  if (input.x402Host && settings.trustedX402Hosts.length > 0 && !settings.trustedX402Hosts.includes(input.x402Host.toLowerCase())) {
    throw new PaymentPolicyError("x402 host is not in the trusted host list.", "POLICY_X402_HOST_NOT_TRUSTED");
  }
}

let database: DatabaseSync | undefined;
let databaseFile = "";
function db(): DatabaseSync {
  const filename = process.env.AGENTPAY_DB_PATH || path.join(process.cwd(), "data", "agentpay.sqlite");
  if (database && databaseFile === filename) return database;
  database?.close();
  mkdirSync(path.dirname(filename), { recursive: true });
  database = new DatabaseSync(filename);
  databaseFile = filename;
  return database;
}
function tableExists(name: string): boolean {
  return Boolean(db().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

export function getDailySpendUsd(rail: PaymentPolicyInput["rail"], now = new Date()): string {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const amounts: Array<string | undefined> = [];
  if (rail === "agentic-wallet" && tableExists("payment_intents")) {
    const columns = new Set((db().prepare("PRAGMA table_info(payment_intents)").all() as unknown as Array<{ name: string }>).map((column) => column.name));
    if (columns.has("amount_usd")) {
      for (const row of db().prepare("SELECT amount_usd FROM payment_intents WHERE status IN ('submitting','submitted','confirmed') AND COALESCE(submitted_at, approved_at, created_at) >= ?").all(since) as unknown as Array<{ amount_usd: string | null }>) amounts.push(row.amount_usd ?? undefined);
    }
  }
  if (rail === "binance-pay" && tableExists("binance_pay_orders")) {
    for (const row of db().prepare("SELECT amount, currency FROM binance_pay_orders WHERE status IN ('PROCESSING','SUCCESS') AND updated_at >= ?").all(since) as unknown as Array<{ amount: string | null; currency: string | null }>) {
      amounts.push(usdAmountForCurrency(row.amount, row.currency));
    }
  }
  if (rail === "x402" && tableExists("x402_intents")) {
    for (const row of db().prepare("SELECT options_json, selected_index FROM x402_intents WHERE status IN ('signing','approving','completed') AND updated_at >= ?").all(since) as unknown as Array<{ options_json: string; selected_index: number | null }>) {
      try {
        const options = JSON.parse(row.options_json) as Array<{ index?: number; amountUsd?: string }>;
        amounts.push(options.find((option) => option.index === row.selected_index)?.amountUsd);
      } catch { amounts.push(undefined); }
    }
  }
  if (amounts.some((amount) => amount === undefined || !decimalParts(amount))) {
    throw new PaymentPolicyError("Today’s payment total includes a transaction without a reliable USD valuation.", "POLICY_DAILY_SPEND_UNAVAILABLE");
  }
  return amounts.reduce<string>((total, amount) => addDecimalStrings(total, amount as string), "0");
}

export function enforcePaymentPolicy(input: PaymentPolicyInput): void {
  const settings = getAgentPaySettings();
  const dailySpend = settings.spendingLimits[input.rail].dailyUsdLimit === null ? "0" : getDailySpendUsd(input.rail);
  evaluatePaymentPolicy(input, settings, dailySpend);
}

export function enforceTrustedX402Host(host: string): void {
  const settings = getAgentPaySettings();
  if (settings.trustedX402Hosts.length > 0 && !settings.trustedX402Hosts.includes(host.toLowerCase())) {
    throw new PaymentPolicyError("x402 host is not in the trusted host list.", "POLICY_X402_HOST_NOT_TRUSTED");
  }
}

export function resetPaymentPolicyStoreForTests(): void {
  database?.close();
  database = undefined;
  databaseFile = "";
}
