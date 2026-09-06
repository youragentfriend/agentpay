import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import type { AgentPaySettings } from "../lib/settings-types";
import {
  enforcePaymentPolicy,
  evaluatePaymentPolicy,
  getDailySpendUsd,
  multiplyDecimalStrings,
  PaymentPolicyError,
  resetPaymentPolicyStoreForTests,
} from "../lib/server/payment-policy";
import { resetSettingsStoreForTests, updateAgentPaySettings } from "../lib/server/settings-store";
import { enforceBinancePaymentPolicy } from "../lib/server/binance-pay";
import { enforceX402OptionPolicy, X402Error } from "../lib/server/x402";

const trusted = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const settings: AgentPaySettings = {
  displayName: "Mark", profileImageDataUrl: null, displayCurrency: "USD", timeZone: "UTC", updatedAt: new Date().toISOString(), requireApproval: true,
  spendingLimits: { "binance-pay": { perPaymentUsdLimit: "10", dailyUsdLimit: "20" }, x402: { perPaymentUsdLimit: "10", dailyUsdLimit: "20" }, "agentic-wallet": { perPaymentUsdLimit: "10", dailyUsdLimit: "20" } }, trustedWalletDestinations: [trusted], trustedX402Hosts: ["api.example.com"], trustedX402Endpoints: ["GET https://api.example.com/resource"],
};

test("computes wallet USD values without floating-point arithmetic", () => {
  assert.equal(multiplyDecimalStrings("0.1", "0.2"), "0.02");
  assert.equal(multiplyDecimalStrings("5", "1.005"), "5.025");
});

test("enforces per-payment and daily USD limits", () => {
  assert.doesNotThrow(() => evaluatePaymentPolicy({ rail: "agentic-wallet", amountUsd: "10", destination: trusted }, settings, "10"));
  assert.throws(() => evaluatePaymentPolicy({ rail: "agentic-wallet", amountUsd: "10.01", destination: trusted }, settings, "0"), (error) => error instanceof PaymentPolicyError && error.code === "POLICY_PER_PAYMENT_LIMIT_EXCEEDED");
  assert.throws(() => evaluatePaymentPolicy({ rail: "agentic-wallet", amountUsd: "6", destination: trusted }, settings, "15"), (error) => error instanceof PaymentPolicyError && error.code === "POLICY_DAILY_LIMIT_EXCEEDED");
});

test("keeps spending limits independent by payment rail", () => {
  const independent: AgentPaySettings = { ...settings, spendingLimits: {
    "binance-pay": { perPaymentUsdLimit: "5", dailyUsdLimit: "10" },
    x402: { perPaymentUsdLimit: "20", dailyUsdLimit: "40" },
    "agentic-wallet": { perPaymentUsdLimit: "100", dailyUsdLimit: "200" },
  } };
  assert.throws(() => evaluatePaymentPolicy({ rail: "binance-pay", amountUsd: "6" }, independent), /binance-pay per-payment limit/i);
  assert.doesNotThrow(() => evaluatePaymentPolicy({ rail: "x402", amountUsd: "6", x402Host: "api.example.com" }, independent));
  assert.doesNotThrow(() => evaluatePaymentPolicy({ rail: "agentic-wallet", amountUsd: "6", destination: trusted }, independent));
});

test("fails closed without USD valuation and rejects untrusted destinations and hosts", () => {
  assert.throws(() => evaluatePaymentPolicy({ rail: "binance-pay" }, settings), (error) => error instanceof PaymentPolicyError && error.code === "POLICY_AMOUNT_USD_REQUIRED");
  assert.throws(() => evaluatePaymentPolicy({ rail: "agentic-wallet", amountUsd: "1", destination: other }, settings), (error) => error instanceof PaymentPolicyError && error.code === "POLICY_DESTINATION_NOT_TRUSTED");
  assert.throws(() => evaluatePaymentPolicy({ rail: "x402", amountUsd: "1", x402Host: "evil.example" }, settings), (error) => error instanceof PaymentPolicyError && error.code === "POLICY_X402_HOST_NOT_TRUSTED");
});

test("aggregates persisted daily spend across all payment rails", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agentpay-daily-"));
  const filename = path.join(directory, "agentpay.sqlite");
  const previous = process.env.AGENTPAY_DB_PATH;
  process.env.AGENTPAY_DB_PATH = filename;
  resetPaymentPolicyStoreForTests();
  const database = new DatabaseSync(filename);
  const now = new Date().toISOString();
  database.exec(`
    CREATE TABLE payment_intents (amount_usd TEXT, status TEXT, submitted_at TEXT, approved_at TEXT, created_at TEXT);
    CREATE TABLE binance_pay_orders (amount TEXT, currency TEXT, status TEXT, updated_at TEXT);
    CREATE TABLE x402_intents (options_json TEXT, selected_index INTEGER, status TEXT, updated_at TEXT, paid_at TEXT, delivery_status TEXT);
  `);
  database.prepare("INSERT INTO payment_intents VALUES ('2.50','confirmed',?,NULL,?)").run(now, now);
  database.prepare("INSERT INTO binance_pay_orders VALUES ('3','USDT','SUCCESS',?)").run(now);
  database.prepare("INSERT INTO x402_intents VALUES (?,0,'completed',?,?,?)").run(JSON.stringify([{ index: 0, amountUsd: "4.25" }]), now, now, "delivered");
  database.prepare("INSERT INTO x402_intents VALUES (?,0,'failed',?,NULL,?)").run(JSON.stringify([{ index: 0, amountUsd: "99" }]), now, "failed_before_payment");
  database.prepare("INSERT INTO x402_intents VALUES (?,0,'failed',?,?,?)").run(JSON.stringify([{ index: 0, amountUsd: "1.25" }]), now, now, "paid_but_invalid");
  database.close();
  try { assert.equal(getDailySpendUsd("agentic-wallet"), "2.5"); assert.equal(getDailySpendUsd("binance-pay"), "3"); assert.equal(getDailySpendUsd("x402"), "5.5"); }
  finally {
    resetPaymentPolicyStoreForTests();
    if (previous === undefined) delete process.env.AGENTPAY_DB_PATH;
    else process.env.AGENTPAY_DB_PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("all execution-rail guards re-read persisted rules before execution", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agentpay-policy-"));
  const previous = process.env.AGENTPAY_DB_PATH;
  process.env.AGENTPAY_DB_PATH = path.join(directory, "agentpay.sqlite");
  resetSettingsStoreForTests();
  resetPaymentPolicyStoreForTests();
  try {
    updateAgentPaySettings({
      displayName: "Mark", profileImageDataUrl: null, displayCurrency: "USD", timeZone: "UTC", spendingLimits: { "binance-pay": { perPaymentUsdLimit: "1", dailyUsdLimit: "100" }, x402: { perPaymentUsdLimit: "1", dailyUsdLimit: "20" }, "agentic-wallet": { perPaymentUsdLimit: "1", dailyUsdLimit: "100" } },
      trustedWalletDestinations: [trusted], trustedX402Hosts: ["api.example.com"], trustedX402Endpoints: ["GET https://api.example.com/resource"],
    });
    assert.throws(() => enforcePaymentPolicy({ rail: "agentic-wallet", amountUsd: "2", destination: trusted }), (error) => error instanceof PaymentPolicyError && error.code === "POLICY_PER_PAYMENT_LIMIT_EXCEEDED");
    assert.throws(() => enforceBinancePaymentPolicy({ status: "AWAITING_CONFIRMATION", amount: "2", currency: "USDT" }), /per-payment limit/i);
    assert.throws(() => enforceX402OptionPolicy({ resourceUrl: "https://api.example.com/resource", requestMethod: "GET" }, { index: 0, status: "READY_TO_SIGN", reasons: [], amountUsd: "2", network: "eip155:56" }), (error) => error instanceof X402Error && error.code === "POLICY_PER_PAYMENT_LIMIT_EXCEEDED");
  } finally {
    resetSettingsStoreForTests();
    resetPaymentPolicyStoreForTests();
    if (previous === undefined) delete process.env.AGENTPAY_DB_PATH;
    else process.env.AGENTPAY_DB_PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
