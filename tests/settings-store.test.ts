import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  SettingsValidationError,
  getAgentPaySettings,
  resetSettingsStoreForTests,
  updateAgentPaySettings,
  validateSettingsUpdate,
} from "../lib/server/settings-store";

const policyFields = {
  perPaymentUsdLimit: null,
  dailyUsdLimit: null,
  trustedWalletDestinations: [] as string[],
  trustedX402Hosts: [] as string[],
};

function withDatabase(run: (filename: string) => void) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agentpay-settings-"));
  const filename = path.join(directory, "agentpay.sqlite");
  const previous = process.env.AGENTPAY_DB_PATH;
  process.env.AGENTPAY_DB_PATH = filename;
  resetSettingsStoreForTests();
  try { run(filename); }
  finally {
    resetSettingsStoreForTests();
    if (previous === undefined) delete process.env.AGENTPAY_DB_PATH;
    else process.env.AGENTPAY_DB_PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
}

test("creates persistent default AgentPay settings with mandatory approval", () => withDatabase(() => {
  const settings = getAgentPaySettings();
  assert.equal(settings.displayName, "Mark");
  assert.equal(settings.displayCurrency, "USD");
  assert.equal(settings.timeZone, "UTC");
  assert.equal(settings.requireApproval, true);
  assert.equal(settings.perPaymentUsdLimit, null);
  assert.deepEqual(settings.trustedWalletDestinations, []);
  assert.ok(Date.parse(settings.updatedAt));
}));

test("updates rules and persists them in SQLite", () => withDatabase(() => {
  const address = "0x1111111111111111111111111111111111111111";
  const saved = updateAgentPaySettings({
    displayName: "Mark Agent", displayCurrency: "USD", timeZone: "Asia/Manila",
    perPaymentUsdLimit: "25.50", dailyUsdLimit: "100", trustedWalletDestinations: [address.toUpperCase().replace("0X", "0x")], trustedX402Hosts: ["API.Example.com"],
  });
  assert.equal(saved.displayName, "Mark Agent");
  assert.equal(saved.perPaymentUsdLimit, "25.50");
  assert.deepEqual(saved.trustedWalletDestinations, [address]);
  assert.deepEqual(saved.trustedX402Hosts, ["api.example.com"]);
  resetSettingsStoreForTests();
  assert.equal(getAgentPaySettings().dailyUsdLimit, "100");
}));

test("migrates a Priority 1 settings database without losing profile values", () => withDatabase((filename) => {
  const database = new DatabaseSync(filename);
  database.exec("CREATE TABLE app_settings (id INTEGER PRIMARY KEY, display_name TEXT NOT NULL, display_currency TEXT NOT NULL, time_zone TEXT NOT NULL, updated_at TEXT NOT NULL)");
  database.prepare("INSERT INTO app_settings VALUES (1, ?, 'USD', 'Europe/London', ?)").run("Existing Mark", new Date().toISOString());
  database.close();
  const settings = getAgentPaySettings();
  assert.equal(settings.displayName, "Existing Mark");
  assert.equal(settings.timeZone, "Europe/London");
  assert.equal(settings.requireApproval, true);
  assert.deepEqual(settings.trustedX402Hosts, []);
}));

test("normalizes fields and validates unsupported values", () => {
  assert.deepEqual(validateSettingsUpdate({ displayName: "  Mark   Agent  ", displayCurrency: "USD", timeZone: "UTC", ...policyFields }), {
    displayName: "Mark Agent", displayCurrency: "USD", timeZone: "UTC", ...policyFields,
  });
  assert.throws(() => validateSettingsUpdate({ displayName: "Mark", displayCurrency: "EUR", timeZone: "UTC", ...policyFields }), SettingsValidationError);
  assert.throws(() => validateSettingsUpdate({ displayName: "Mark", displayCurrency: "USD", timeZone: "UTC", ...policyFields, perPaymentUsdLimit: "0" }), SettingsValidationError);
  assert.throws(() => validateSettingsUpdate({ displayName: "Mark", displayCurrency: "USD", timeZone: "UTC", ...policyFields, trustedX402Hosts: ["https://api.example.com/path"] }), SettingsValidationError);
  assert.throws(() => validateSettingsUpdate({ displayName: "Mark", displayCurrency: "USD", timeZone: "UTC", ...policyFields, trustedWalletDestinations: ["not-an-address"] }), SettingsValidationError);
});
