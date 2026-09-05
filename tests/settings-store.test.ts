import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  SettingsValidationError,
  getAgentPaySettings,
  resetSettingsStoreForTests,
  updateAgentPaySettings,
  validateSettingsUpdate,
} from "../lib/server/settings-store";

function withDatabase(run: () => void) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agentpay-settings-"));
  const previous = process.env.AGENTPAY_DB_PATH;
  process.env.AGENTPAY_DB_PATH = path.join(directory, "agentpay.sqlite");
  resetSettingsStoreForTests();
  try { run(); }
  finally {
    resetSettingsStoreForTests();
    if (previous === undefined) delete process.env.AGENTPAY_DB_PATH;
    else process.env.AGENTPAY_DB_PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
}

test("creates persistent default AgentPay settings", () => withDatabase(() => {
  const settings = getAgentPaySettings();
  assert.equal(settings.displayName, "Mark");
  assert.equal(settings.displayCurrency, "USD");
  assert.equal(settings.timeZone, "UTC");
  assert.ok(Date.parse(settings.updatedAt));
}));

test("updates profile settings and persists them in SQLite", () => withDatabase(() => {
  const saved = updateAgentPaySettings({ displayName: "Mark Agent", displayCurrency: "USD", timeZone: "Asia/Manila" });
  assert.equal(saved.displayName, "Mark Agent");
  assert.equal(saved.timeZone, "Asia/Manila");
  resetSettingsStoreForTests();
  assert.equal(getAgentPaySettings().displayName, "Mark Agent");
}));

test("normalizes whitespace and validates supported values", () => {
  assert.deepEqual(validateSettingsUpdate({ displayName: "  Mark   Agent  ", displayCurrency: "USD", timeZone: "UTC" }), {
    displayName: "Mark Agent",
    displayCurrency: "USD",
    timeZone: "UTC",
  });
  assert.throws(() => validateSettingsUpdate({ displayName: "Mark", displayCurrency: "EUR", timeZone: "UTC" }), SettingsValidationError);
  assert.throws(() => validateSettingsUpdate({ displayName: "", displayCurrency: "USD", timeZone: "UTC" }), SettingsValidationError);
  assert.throws(() => validateSettingsUpdate({ displayName: "Mark", displayCurrency: "USD", timeZone: "Moon/Base" }), SettingsValidationError);
});
