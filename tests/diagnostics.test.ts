import assert from "node:assert/strict";
import test from "node:test";
import type { BinancePortfolio } from "../lib/binance-portfolio-types";
import { aggregateDiagnostics, type DiagnosticsDependencies } from "../lib/server/diagnostics";

const portfolio: BinancePortfolio = {
  configured: true,
  connection: "connected",
  readOnly: true,
  refreshedAt: "2026-09-05T09:00:00.000Z",
  estimatedTotalUsd: 123456,
  pricedAssetCount: 2,
  unpricedAssetCount: 0,
  dustThresholdUsd: 0.1,
  balances: [{ id: "secret-balance", source: "spot", sourceLabel: "Spot", asset: "BTC", available: "1", total: "1", usdValue: 123456, priceUsd: 123456, valuation: "direct" }],
  sources: [
    { source: "spot", label: "Spot", state: "available", itemCount: 1, message: "private provider detail" },
    { source: "funding", label: "Funding", state: "empty", itemCount: 0 },
  ],
};

function dependencies(overrides: Partial<DiagnosticsDependencies> = {}): DiagnosticsDependencies {
  return {
    now: () => new Date("2026-09-05T09:19:00.000Z"),
    uptime: () => 3661.9,
    databaseHealth: () => true,
    walletStatus: async () => "CONNECTED",
    binancePayCapability: async () => ({ configured: true, executionEnabled: false, imageDecodeReady: true }),
    onchainPayCapability: async () => ({ configured: false, executionEnabled: false, liveDiscoveryEnabled: false, webhookReady: false }),
    binanceAccountStatus: () => ({ configured: true, readOnly: true }),
    binancePortfolio: async () => portfolio,
    x402Capability: () => ({ executionEnabled: false, allowedHosts: ["private.example"] }),
    walletExecutionEnabled: () => false,
    buildVersion: "0.4.0",
    environment: "production",
    ...overrides,
  };
}

test("maps aggregate capabilities without treating disabled execution as a failure", async () => {
  const result = await aggregateDiagnostics(dependencies());
  assert.equal(result.generatedAt, "2026-09-05T09:19:00.000Z");
  assert.equal(result.state, "operational");
  assert.equal(result.system.uptimeSeconds, 3661);
  assert.equal(result.connections.agenticWallet.state, "connected");
  assert.equal(result.connections.binancePay.state, "configured");
  assert.equal(result.connections.onchainPay.state, "preview");
  assert.equal(result.connections.binanceAccount.state, "connected");
  assert.equal(result.connections.x402.state, "ready");
  assert.deepEqual(result.execution, { approvalRequired: true, agenticWallet: false, binancePay: false, onchainPay: false, x402: false });
});

test("isolates failed sources and returns partial diagnostics", async () => {
  const result = await aggregateDiagnostics(dependencies({
    walletStatus: async () => { throw new Error("raw wallet error /home/private secret=abc"); },
    binancePortfolio: async () => ({ ...portfolio, connection: "partial" }),
  }));
  assert.equal(result.state, "degraded");
  assert.equal(result.database.state, "available");
  assert.equal(result.connections.agenticWallet.state, "unavailable");
  assert.equal(result.connections.binancePay.state, "configured");
  assert.equal(result.connections.binanceAccount.state, "partial");
});

test("returns a secret-safe response shape", async () => {
  const result = await aggregateDiagnostics(dependencies());
  const serialized = JSON.stringify(result);
  for (const forbidden of ["private.example", "secret-balance", "private provider detail", "123456", "balances", "allowedHosts", "credentialSource", "missing", "configPath", "address", "apiKey", "apiSecret"]) {
    assert.equal(serialized.includes(forbidden), false, `response leaked ${forbidden}`);
  }
  assert.equal(result.connections.x402.allowedHostCount, 1);
  assert.deepEqual(result.connections.binanceAccount.sources, [
    { source: "spot", state: "available" },
    { source: "funding", state: "empty" },
  ]);
});

test("distinguishes not configured, unavailable, and intentional safe states", async () => {
  const result = await aggregateDiagnostics(dependencies({
    binancePayCapability: async () => ({ configured: false, executionEnabled: false, imageDecodeReady: false }),
    binanceAccountStatus: () => ({ configured: false, readOnly: true }),
    x402Capability: () => ({ executionEnabled: false, allowedHosts: [] }),
  }));
  assert.equal(result.state, "operational");
  assert.equal(result.connections.binancePay.state, "not_configured");
  assert.equal(result.connections.binanceAccount.state, "not_configured");
  assert.equal(result.connections.x402.state, "not_configured");
  assert.equal(result.execution.binancePay, false);
  assert.equal(result.execution.x402, false);
});
