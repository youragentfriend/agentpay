import { mkdirSync } from "node:fs";
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
      updated_at TEXT NOT NULL
    )
  `);
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

export function validateSettingsUpdate(value: unknown): UpdateAgentPaySettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SettingsValidationError("Settings must be a JSON object.");
  const input = value as Record<string, unknown>;
  return {
    displayName: validateDisplayName(input.displayName),
    displayCurrency: validateDisplayCurrency(input.displayCurrency),
    timeZone: validateTimeZone(input.timeZone),
  };
}

function mapSettings(row: Record<string, unknown>): AgentPaySettings {
  return {
    displayName: String(row.display_name),
    displayCurrency: "USD",
    timeZone: String(row.time_zone),
    updatedAt: String(row.updated_at),
  };
}

export function getAgentPaySettings(): AgentPaySettings {
  const row = db().prepare("SELECT display_name, display_currency, time_zone, updated_at FROM app_settings WHERE id = 1").get() as Record<string, unknown>;
  return mapSettings(row);
}

export function updateAgentPaySettings(value: unknown): AgentPaySettings {
  const settings = validateSettingsUpdate(value);
  const updatedAt = new Date().toISOString();
  db().prepare(`
    UPDATE app_settings
    SET display_name = ?, display_currency = ?, time_zone = ?, updated_at = ?
    WHERE id = 1
  `).run(settings.displayName, settings.displayCurrency, settings.timeZone, updatedAt);
  return getAgentPaySettings();
}

export function resetSettingsStoreForTests() {
  database?.close();
  database = undefined;
  databaseFile = "";
}
