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
      trusted_wallet_destinations TEXT NOT NULL DEFAULT '[]',
      trusted_x402_hosts TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    )
  `);
  const columns = new Set((database.prepare("PRAGMA table_info(app_settings)").all() as unknown as Array<{ name: string }>).map((column) => column.name));
  if (!columns.has("per_payment_usd_limit")) database.exec("ALTER TABLE app_settings ADD COLUMN per_payment_usd_limit TEXT");
  if (!columns.has("daily_usd_limit")) database.exec("ALTER TABLE app_settings ADD COLUMN daily_usd_limit TEXT");
  if (!columns.has("trusted_wallet_destinations")) database.exec("ALTER TABLE app_settings ADD COLUMN trusted_wallet_destinations TEXT NOT NULL DEFAULT '[]'");
  if (!columns.has("trusted_x402_hosts")) database.exec("ALTER TABLE app_settings ADD COLUMN trusted_x402_hosts TEXT NOT NULL DEFAULT '[]'");
  const now = new Date().toISOString();
  database.prepare(`
    INSERT OR IGNORE INTO app_settings (id, display_name, display_currency, time_zone, updated_at)
    VALUES (1, ?, ?, ?, ?)
  `).run(DEFAULT_AGENTPAY_SETTINGS.displayName, DEFAULT_AGENTPAY_SETTINGS.displayCurrency, DEFAULT_AGENTPAY_SETTINGS.timeZone, now);
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

export function validateSettingsUpdate(value: unknown): UpdateAgentPaySettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SettingsValidationError("Settings must be a JSON object.");
  const input = value as Record<string, unknown>;
  return {
    displayName: validateDisplayName(input.displayName),
    displayCurrency: validateDisplayCurrency(input.displayCurrency),
    timeZone: validateTimeZone(input.timeZone),
    perPaymentUsdLimit: validateUsdLimit(input.perPaymentUsdLimit, "Per-payment limit"),
    dailyUsdLimit: validateUsdLimit(input.dailyUsdLimit, "Daily limit"),
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
    perPaymentUsdLimit: row.per_payment_usd_limit === null ? null : String(row.per_payment_usd_limit),
    dailyUsdLimit: row.daily_usd_limit === null ? null : String(row.daily_usd_limit),
    trustedWalletDestinations: parseStoredList(row.trusted_wallet_destinations),
    trustedX402Hosts: parseStoredList(row.trusted_x402_hosts),
    updatedAt: String(row.updated_at),
  };
}

export function getAgentPaySettings(): AgentPaySettings {
  const row = db().prepare("SELECT display_name, display_currency, time_zone, per_payment_usd_limit, daily_usd_limit, trusted_wallet_destinations, trusted_x402_hosts, updated_at FROM app_settings WHERE id = 1").get() as Record<string, unknown>;
  return mapSettings(row);
}

export function updateAgentPaySettings(value: unknown): AgentPaySettings {
  const settings = validateSettingsUpdate(value);
  const updatedAt = new Date().toISOString();
  db().prepare(`
    UPDATE app_settings
    SET display_name = ?, display_currency = ?, time_zone = ?, per_payment_usd_limit = ?, daily_usd_limit = ?,
        trusted_wallet_destinations = ?, trusted_x402_hosts = ?, updated_at = ?
    WHERE id = 1
  `).run(settings.displayName, settings.displayCurrency, settings.timeZone, settings.perPaymentUsdLimit,
    settings.dailyUsdLimit, JSON.stringify(settings.trustedWalletDestinations), JSON.stringify(settings.trustedX402Hosts), updatedAt);
  return getAgentPaySettings();
}

export function resetSettingsStoreForTests() {
  database?.close();
  database = undefined;
  databaseFile = "";
}
