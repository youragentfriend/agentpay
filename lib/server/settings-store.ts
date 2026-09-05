import { mkdirSync } from "node:fs";
import { isIP } from "node:net";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AgentPaySettings, UpdateAgentPaySettings } from "@/lib/settings-types";
import { DEFAULT_AGENTPAY_SETTINGS } from "@/lib/settings-types";

let database: DatabaseSync | undefined;
let databaseFile = "";

export class SettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsValidationError";
  }
}

function db() {
  const filename = process.env.AGENTPAY_DB_PATH || path.join(process.cwd(), "data", "agentpay.sqlite");
  if (database && databaseFile === filename) return database;
  database?.close();
  mkdirSync(path.dirname(filename), { recursive: true });
  database = new DatabaseSync(filename);
  databaseFile = filename;
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      display_name TEXT NOT NULL,
      display_currency TEXT NOT NULL,
      time_zone TEXT NOT NULL,
      per_payment_usd_limit TEXT,
      daily_usd_limit TEXT,
      binance_pay_per_payment_usd_limit TEXT,
      binance_pay_daily_usd_limit TEXT,
      x402_per_payment_usd_limit TEXT,
      x402_daily_usd_limit TEXT,
      wallet_per_payment_usd_limit TEXT,
      wallet_daily_usd_limit TEXT,
      trusted_wallet_destinations TEXT NOT NULL DEFAULT '[]',
      trusted_x402_hosts TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    )
  `);
  const columns = new Set((database.prepare("PRAGMA table_info(app_settings)").all() as unknown as Array<{ name: string }>).map((column) => column.name));
  if (!columns.has("per_payment_usd_limit")) database.exec("ALTER TABLE app_settings ADD COLUMN per_payment_usd_limit TEXT");
  if (!columns.has("daily_usd_limit")) database.exec("ALTER TABLE app_settings ADD COLUMN daily_usd_limit TEXT");
  if (!columns.has("binance_pay_per_payment_usd_limit")) database.exec("ALTER TABLE app_settings ADD COLUMN binance_pay_per_payment_usd_limit TEXT");
  if (!columns.has("binance_pay_daily_usd_limit")) database.exec("ALTER TABLE app_settings ADD COLUMN binance_pay_daily_usd_limit TEXT");
  if (!columns.has("x402_per_payment_usd_limit")) database.exec("ALTER TABLE app_settings ADD COLUMN x402_per_payment_usd_limit TEXT");
  if (!columns.has("x402_daily_usd_limit")) database.exec("ALTER TABLE app_settings ADD COLUMN x402_daily_usd_limit TEXT");
  if (!columns.has("wallet_per_payment_usd_limit")) database.exec("ALTER TABLE app_settings ADD COLUMN wallet_per_payment_usd_limit TEXT");
  if (!columns.has("wallet_daily_usd_limit")) database.exec("ALTER TABLE app_settings ADD COLUMN wallet_daily_usd_limit TEXT");
  if (!columns.has("trusted_wallet_destinations")) database.exec("ALTER TABLE app_settings ADD COLUMN trusted_wallet_destinations TEXT NOT NULL DEFAULT '[]'");
  if (!columns.has("trusted_x402_hosts")) database.exec("ALTER TABLE app_settings ADD COLUMN trusted_x402_hosts TEXT NOT NULL DEFAULT '[]'");
  const now = new Date().toISOString();
  database.prepare(`
    INSERT OR IGNORE INTO app_settings (id, display_name, display_currency, time_zone, binance_pay_per_payment_usd_limit, binance_pay_daily_usd_limit, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?)
  `).run(DEFAULT_AGENTPAY_SETTINGS.displayName, DEFAULT_AGENTPAY_SETTINGS.displayCurrency, DEFAULT_AGENTPAY_SETTINGS.timeZone,
    DEFAULT_AGENTPAY_SETTINGS.spendingLimits["binance-pay"].perPaymentUsdLimit, DEFAULT_AGENTPAY_SETTINGS.spendingLimits["binance-pay"].dailyUsdLimit, now);
  if (!columns.has("binance_pay_per_payment_usd_limit")) database.exec("UPDATE app_settings SET binance_pay_per_payment_usd_limit=COALESCE(per_payment_usd_limit,'50') WHERE id=1");
  if (!columns.has("binance_pay_daily_usd_limit")) database.exec("UPDATE app_settings SET binance_pay_daily_usd_limit=COALESCE(daily_usd_limit,'100') WHERE id=1");
  if (!columns.has("x402_per_payment_usd_limit")) database.exec("UPDATE app_settings SET x402_per_payment_usd_limit=per_payment_usd_limit WHERE id=1");
  if (!columns.has("x402_daily_usd_limit")) database.exec("UPDATE app_settings SET x402_daily_usd_limit=daily_usd_limit WHERE id=1");
  if (!columns.has("wallet_per_payment_usd_limit")) database.exec("UPDATE app_settings SET wallet_per_payment_usd_limit=per_payment_usd_limit WHERE id=1");
  if (!columns.has("wallet_daily_usd_limit")) database.exec("UPDATE app_settings SET wallet_daily_usd_limit=daily_usd_limit WHERE id=1");
  return database;
}

function validateDisplayName(value: unknown) {
  if (typeof value !== "string") throw new SettingsValidationError("Display name is required.");
  const displayName = value.trim().replace(/\s+/g, " ");
  if (displayName.length < 1 || displayName.length > 50) throw new SettingsValidationError("Display name must contain 1 to 50 characters.");
  if (/\p{Cc}/u.test(displayName)) throw new SettingsValidationError("Display name contains unsupported control characters.");
  return displayName;
}

function validateDisplayCurrency(value: unknown): "USD" {
  if (value !== "USD") throw new SettingsValidationError("USD is currently the only supported display currency.");
  return "USD";
}

function validateTimeZone(value: unknown) {
  if (typeof value !== "string") throw new SettingsValidationError("Time zone is required.");
  const timeZone = value.trim();
  if (!timeZone || timeZone.length > 100) throw new SettingsValidationError("Enter a valid IANA time zone.");
  try { new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date()); }
  catch { throw new SettingsValidationError("Enter a valid IANA time zone such as UTC or America/New_York."); }
  return timeZone;
}

const USD_LIMIT = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function validateUsdLimit(value: unknown, label: string): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new SettingsValidationError(`${label} must be a USD amount or blank.`);
  const normalized = value.trim();
  if (!USD_LIMIT.test(normalized) || Number(normalized) <= 0) {
    throw new SettingsValidationError(`${label} must be a positive USD amount with at most 2 decimal places.`);
  }
  return normalized;
}

function validateStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new SettingsValidationError(`${label} must be a list.`);
  if (value.length > 100) throw new SettingsValidationError(`${label} supports at most 100 entries.`);
  if (value.some((item) => typeof item !== "string")) throw new SettingsValidationError(`${label} entries must be text.`);
  return value.map((item) => (item as string).trim()).filter(Boolean);
}

function validateWalletDestinations(value: unknown): string[] {
  const destinations = validateStringArray(value, "Trusted wallet destinations").map((destination) => {
    if (!EVM_ADDRESS.test(destination) && !SOLANA_ADDRESS.test(destination)) {
      throw new SettingsValidationError("Trusted wallet destinations must be valid EVM or Solana addresses.");
    }
    return destination.startsWith("0x") ? destination.toLowerCase() : destination;
  });
  return [...new Set(destinations)];
}

function validateX402Hosts(value: unknown): string[] {
  const hosts = validateStringArray(value, "Trusted x402 hosts").map((item) => {
    const host = item.toLowerCase().replace(/\.$/, "");
    if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)
      || host === "localhost" || host.endsWith(".local") || isIP(host) !== 0) {
      throw new SettingsValidationError("Trusted x402 hosts must be public hostnames without a scheme, path, port, or wildcard.");
    }
    return host;
  });
  return [...new Set(hosts)];
}

function validateSpendingLimits(value: unknown): UpdateAgentPaySettings["spendingLimits"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SettingsValidationError("Spending limits must be provided for each payment rail.");
  const input = value as Record<string, unknown>;
  const read = (rail: string, label: string) => {
    const candidate = input[rail];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new SettingsValidationError(`${label} spending limits are required.`);
    const fields = candidate as Record<string, unknown>;
    return { perPaymentUsdLimit: validateUsdLimit(fields.perPaymentUsdLimit, `${label} per-payment limit`), dailyUsdLimit: validateUsdLimit(fields.dailyUsdLimit, `${label} daily limit`) };
  };
  const limits = { "binance-pay": read("binance-pay", "Binance Pay"), x402: read("x402", "x402"), "agentic-wallet": read("agentic-wallet", "Agentic Wallet") };
  if (limits["binance-pay"].perPaymentUsdLimit && Number(limits["binance-pay"].perPaymentUsdLimit) > 50) throw new SettingsValidationError("Binance Pay per-payment limit cannot exceed $50.");
  if (limits["binance-pay"].dailyUsdLimit && Number(limits["binance-pay"].dailyUsdLimit) > 100) throw new SettingsValidationError("Binance Pay daily limit cannot exceed $100.");
  return limits;
}

export function validateSettingsUpdate(value: unknown): UpdateAgentPaySettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SettingsValidationError("Settings must be a JSON object.");
  const input = value as Record<string, unknown>;
  return {
    displayName: validateDisplayName(input.displayName),
    displayCurrency: validateDisplayCurrency(input.displayCurrency),
    timeZone: validateTimeZone(input.timeZone),
    spendingLimits: validateSpendingLimits(input.spendingLimits),
    trustedWalletDestinations: validateWalletDestinations(input.trustedWalletDestinations),
    trustedX402Hosts: validateX402Hosts(input.trustedX402Hosts),
  };
}

function parseStoredList(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch { return []; }
}

function mapSettings(row: Record<string, unknown>): AgentPaySettings {
  return {
    displayName: String(row.display_name),
    displayCurrency: "USD",
    timeZone: String(row.time_zone),
    requireApproval: true,
    spendingLimits: {
      "binance-pay": { perPaymentUsdLimit: row.binance_pay_per_payment_usd_limit === null ? null : String(row.binance_pay_per_payment_usd_limit), dailyUsdLimit: row.binance_pay_daily_usd_limit === null ? null : String(row.binance_pay_daily_usd_limit) },
      x402: { perPaymentUsdLimit: row.x402_per_payment_usd_limit === null ? null : String(row.x402_per_payment_usd_limit), dailyUsdLimit: row.x402_daily_usd_limit === null ? null : String(row.x402_daily_usd_limit) },
      "agentic-wallet": { perPaymentUsdLimit: row.wallet_per_payment_usd_limit === null ? null : String(row.wallet_per_payment_usd_limit), dailyUsdLimit: row.wallet_daily_usd_limit === null ? null : String(row.wallet_daily_usd_limit) },
    },
    trustedWalletDestinations: parseStoredList(row.trusted_wallet_destinations),
    trustedX402Hosts: parseStoredList(row.trusted_x402_hosts),
    updatedAt: String(row.updated_at),
  };
}

export function getAgentPaySettings(): AgentPaySettings {
  const row = db().prepare("SELECT * FROM app_settings WHERE id = 1").get() as Record<string, unknown>;
  return mapSettings(row);
}

export function checkSettingsDatabaseHealth(): boolean {
  const result = db().prepare("PRAGMA quick_check").get() as Record<string, unknown> | undefined;
  return result !== undefined && Object.values(result).some((value) => value === "ok");
}

export function updateAgentPaySettings(value: unknown): AgentPaySettings {
  const settings = validateSettingsUpdate(value);
  const updatedAt = new Date().toISOString();
  db().prepare(`
    UPDATE app_settings
    SET display_name = ?, display_currency = ?, time_zone = ?,
        binance_pay_per_payment_usd_limit=?, binance_pay_daily_usd_limit=?, x402_per_payment_usd_limit=?, x402_daily_usd_limit=?, wallet_per_payment_usd_limit=?, wallet_daily_usd_limit=?,
        trusted_wallet_destinations = ?, trusted_x402_hosts = ?, updated_at = ?
    WHERE id = 1
  `).run(settings.displayName, settings.displayCurrency, settings.timeZone,
    settings.spendingLimits["binance-pay"].perPaymentUsdLimit, settings.spendingLimits["binance-pay"].dailyUsdLimit,
    settings.spendingLimits.x402.perPaymentUsdLimit, settings.spendingLimits.x402.dailyUsdLimit,
    settings.spendingLimits["agentic-wallet"].perPaymentUsdLimit, settings.spendingLimits["agentic-wallet"].dailyUsdLimit,
    JSON.stringify(settings.trustedWalletDestinations), JSON.stringify(settings.trustedX402Hosts), updatedAt);
  return getAgentPaySettings();
}

export function resetSettingsStoreForTests() {
  database?.close();
  database = undefined;
  databaseFile = "";
}
