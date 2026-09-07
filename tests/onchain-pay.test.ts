import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { approveOnchainPayOrder, createOnchainPayOrderLink, getOnchainPayCapability, getOnchainPayCatalog, OnchainPayError, prepareOnchainPayOrder, processOnchainPayWebhook } from "../lib/server/onchain-pay";
import { resetOnchainPayStoreForTests } from "../lib/server/onchain-pay-store";
import { resetPaymentPolicyStoreForTests } from "../lib/server/payment-policy";
import { resetSettingsStoreForTests, updateAgentPaySettings } from "../lib/server/settings-store";
import { queryActivityEvents } from "../lib/server/activity-store";

const ENV_KEYS = ["AGENTPAY_DB_PATH", "AGENTPAY_ENABLE_ONCHAIN_PAY", "ONCHAIN_PAY_BASE_URL", "ONCHAIN_PAY_CLIENT_ID", "ONCHAIN_PAY_SIGN_ACCESS_TOKEN", "ONCHAIN_PAY_PRIVATE_KEY_PATH", "ONCHAIN_PAY_WEBHOOK_PUBLIC_KEY_PATH"] as const;
function setup() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agentpay-onchain-")); const previous = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  process.env.AGENTPAY_DB_PATH = path.join(directory, "agentpay.sqlite"); for (const key of ENV_KEYS.slice(1)) delete process.env[key];
  resetOnchainPayStoreForTests(); resetPaymentPolicyStoreForTests(); resetSettingsStoreForTests();
  updateAgentPaySettings({ displayName: "Mark", profileImageDataUrl: null, displayCurrency: "USD", timeZone: "UTC", spendingLimits: { "binance-pay": { perPaymentUsdLimit: "50", dailyUsdLimit: "100" }, "binance-onchain": { perPaymentUsdLimit: "500", dailyUsdLimit: "1000" }, x402: { perPaymentUsdLimit: "20", dailyUsdLimit: "20" }, "agentic-wallet": { perPaymentUsdLimit: "50", dailyUsdLimit: "100" } }, trustedWalletDestinations: [], trustedX402Hosts: [], trustedX402Endpoints: [] });
  return () => { resetOnchainPayStoreForTests(); resetPaymentPolicyStoreForTests(); resetSettingsStoreForTests(); for (const key of ENV_KEYS) { const value = previous[key]; if (value === undefined) delete process.env[key]; else process.env[key] = value; } rmSync(directory, { recursive: true, force: true }); };
}

test("preview catalog includes BNB and multiple non-stablecoin assets", async () => {
  const cleanup = setup();
  try { const capability = await getOnchainPayCapability(); const catalog = await getOnchainPayCatalog(); assert.equal(capability.mode, "preview"); assert.equal(capability.executionEnabled, false); assert.equal(catalog.source, "documented-preview"); assert.ok(catalog.assets.some(item => item.asset === "BNB")); assert.ok(catalog.assets.some(item => item.asset === "BTC")); assert.ok(catalog.assets.some(item => item.asset === "ETH")); assert.ok(catalog.assets.some(item => item.asset === "SOL")); }
  finally { cleanup(); }
});

test("prepares a fixed BNB quantity without restricting the rail to stablecoins", async () => {
  const cleanup = setup(); const originalFetch = global.fetch;
  global.fetch = (async () => new Response(JSON.stringify({ price: "600" }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  try { const order = await prepareOnchainPayOrder({ asset: "BNB", network: "BSC", address: "0x1111111111111111111111111111111111111111", amount: "0.25" }); assert.equal(order.asset, "BNB"); assert.equal(order.amount, "0.25"); assert.equal(order.expectedReceive, "0.2495"); assert.equal(order.amountUsd, "150"); assert.equal(order.status, "prepared"); }
  finally { global.fetch = originalFetch; cleanup(); }
});

test("validates routes and blocks duplicate active payment preparation", async () => {
  const cleanup = setup();
  try {
    await assert.rejects(() => prepareOnchainPayOrder({ asset: "BNB", network: "BSC", address: "not-an-address", amount: "0.25" }), (error) => error instanceof OnchainPayError && error.code === "INVALID_ONCHAIN_PAY_ADDRESS");
    const input = { asset: "USDT", network: "BSC", address: "0x2222222222222222222222222222222222222222", amount: "25" };
    await prepareOnchainPayOrder(input);
    await assert.rejects(() => prepareOnchainPayOrder(input), (error) => error instanceof OnchainPayError && error.code === "DUPLICATE_ONCHAIN_PAY_ORDER");
  } finally { cleanup(); }
});

test("requires explicit approval and keeps live order creation disabled", async () => {
  const cleanup = setup();
  try { const prepared = await prepareOnchainPayOrder({ asset: "USDT", network: "BSC", address: "0x3333333333333333333333333333333333333333", amount: "25", netReceive: true }); const approved = approveOnchainPayOrder(prepared.id); assert.equal(approved.status, "approved"); await assert.rejects(() => createOnchainPayOrderLink(approved.id), (error) => error instanceof OnchainPayError && error.code === "ONCHAIN_PAY_EXECUTION_DISABLED"); }
  finally { cleanup(); }
});

test("projects Onchain Pay orders into Activity", async () => {
  const cleanup = setup();
  try { const prepared = await prepareOnchainPayOrder({ asset: "USDC", network: "BSC", address: "0x4444444444444444444444444444444444444444", amount: "10" }); approveOnchainPayOrder(prepared.id); const page = queryActivityEvents({ source: "binance-onchain" }); assert.equal(page.events.length, 1); assert.equal(page.events[0].source, "binance-onchain"); assert.equal(page.events[0].activityType, "onchain-pay"); assert.equal(page.events[0].asset, "USDC"); }
  finally { cleanup(); }
});

test("verifies signed webhooks and records completed withdrawal proof", async () => {
  const cleanup = setup();
  try {
    const order = await prepareOnchainPayOrder({ asset: "USDT", network: "BSC", address: "0x5555555555555555555555555555555555555555", amount: "12" });
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
    const publicPath = path.join(path.dirname(process.env.AGENTPAY_DB_PATH as string), "webhook-public.pem"); writeFileSync(publicPath, publicKey, { mode: 0o600 }); process.env.ONCHAIN_PAY_WEBHOOK_PUBLIC_KEY_PATH = publicPath; process.env.ONCHAIN_PAY_CLIENT_ID = "agentpay-client";
    const body = JSON.stringify({ webhookEventType: "connect_order_event", externalOrderId: order.externalOrderId, status: 20, cryptoAmount: "12", networkFee: "0.1", withdrawTxHash: "0xabcdef" }); const timestamp = String(Date.now()); const signer = createSign("RSA-SHA256"); signer.update(`${body}${timestamp}`); signer.end(); const signature = signer.sign(privateKey, "base64");
    const completed = await processOnchainPayWebhook(body, new Headers({ "X-BN-Connect-Timestamp": timestamp, "X-BN-Connect-Signature": signature, "X-BN-Connect-For": "agentpay-client" }));
    assert.equal(completed.status, "completed"); assert.equal(completed.txHash, "0xabcdef"); assert.equal(completed.withdrawFee, "0.1");
  } finally { cleanup(); }
});
