import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertPaymentExecutionAllowed, getPaymentExecutionState, PaymentExecutionError } from "../lib/server/payment-execution";
import { resetSettingsStoreForTests, updatePaymentExecutionControls } from "../lib/server/settings-store";
import { POST as approveWalletTransfer } from "../app/api/payments/approve/route";
import { confirmBinancePayment, BinancePayError } from "../lib/server/binance-pay";
import { approveX402, X402Error } from "../lib/server/x402";

async function withEnvironment(run: () => Promise<void> | void) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agentpay-execution-"));
  const previousDatabase = process.env.AGENTPAY_DB_PATH;
  const previous = { wallet: process.env.AGENTPAY_ENABLE_WALLET_SEND, binance: process.env.AGENTPAY_ENABLE_BINANCE_PAY, x402: process.env.AGENTPAY_ENABLE_X402 };
  process.env.AGENTPAY_DB_PATH = path.join(directory, "agentpay.sqlite");
  process.env.AGENTPAY_ENABLE_WALLET_SEND = "true";
  process.env.AGENTPAY_ENABLE_BINANCE_PAY = "true";
  process.env.AGENTPAY_ENABLE_X402 = "true";
  resetSettingsStoreForTests();
  try { await run(); }
  finally {
    resetSettingsStoreForTests();
    if (previousDatabase === undefined) delete process.env.AGENTPAY_DB_PATH; else process.env.AGENTPAY_DB_PATH = previousDatabase;
    if (previous.wallet === undefined) delete process.env.AGENTPAY_ENABLE_WALLET_SEND; else process.env.AGENTPAY_ENABLE_WALLET_SEND = previous.wallet;
    if (previous.binance === undefined) delete process.env.AGENTPAY_ENABLE_BINANCE_PAY; else process.env.AGENTPAY_ENABLE_BINANCE_PAY = previous.binance;
    if (previous.x402 === undefined) delete process.env.AGENTPAY_ENABLE_X402; else process.env.AGENTPAY_ENABLE_X402 = previous.x402;
    rmSync(directory, { recursive: true, force: true });
  }
}

test("defaults every payment rail to a fail-closed emergency stop", () => withEnvironment(() => {
  const state = getPaymentExecutionState();
  assert.equal(state.masterEnabled, false);
  assert.equal(state.rails["agentic-wallet"].effectiveEnabled, false);
  assert.throws(() => assertPaymentExecutionAllowed("agentic-wallet"), (error) => error instanceof PaymentExecutionError && error.code === "PAYMENTS_EMERGENCY_STOPPED");
}));

test("requires server, master, and individual rail controls to all be enabled", () => withEnvironment(() => {
  updatePaymentExecutionControls({ masterEnabled: true, rails: { "binance-pay": false, x402: true, "agentic-wallet": true }, confirmEnable: true });
  assert.doesNotThrow(() => assertPaymentExecutionAllowed("agentic-wallet"));
  assert.doesNotThrow(() => assertPaymentExecutionAllowed("x402"));
  assert.throws(() => assertPaymentExecutionAllowed("binance-pay"), (error) => error instanceof PaymentExecutionError && error.code === "PAYMENT_RAIL_DISABLED");
  process.env.AGENTPAY_ENABLE_X402 = "false";
  assert.throws(() => assertPaymentExecutionAllowed("x402"), (error) => error instanceof PaymentExecutionError && error.code === "PAYMENT_SERVER_DISABLED");
}));

test("master emergency stop overrides enabled rail choices without erasing them", () => withEnvironment(() => {
  const rails = { "binance-pay": true, x402: true, "agentic-wallet": true };
  updatePaymentExecutionControls({ masterEnabled: true, rails, confirmEnable: true });
  updatePaymentExecutionControls({ masterEnabled: false, rails });
  const state = getPaymentExecutionState();
  assert.deepEqual(Object.fromEntries(Object.entries(state.rails).map(([rail, value]) => [rail, value.userEnabled])), rails);
  assert.equal(Object.values(state.rails).some(value => value.effectiveEnabled), false);
}));

test("blocks every outgoing approval or confirmation path while the emergency stop is active", () => withEnvironment(async () => {
  const walletResponse = await approveWalletTransfer(new Request("http://agentpay.local/api/payments/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "blocked" }) }));
  assert.equal(walletResponse.status, 403);
  assert.equal((await walletResponse.json()).code, "PAYMENTS_EMERGENCY_STOPPED");
  await assert.rejects(() => confirmBinancePayment(), (error) => error instanceof BinancePayError && error.code === "PAYMENTS_EMERGENCY_STOPPED");
  assert.throws(() => approveX402("blocked"), (error) => error instanceof X402Error && error.code === "PAYMENTS_EMERGENCY_STOPPED");
}));
