import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { captureBalanceSnapshots, listBalanceSnapshots, resetBalanceSnapshotStoreForTests } from "../lib/server/balance-snapshot-store";

function withDatabase(run: () => Promise<void>) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agentpay-snapshots-"));
  const previous = process.env.AGENTPAY_DB_PATH;
  process.env.AGENTPAY_DB_PATH = path.join(directory, "agentpay.sqlite");
  resetBalanceSnapshotStoreForTests();
  return run().finally(() => {
    resetBalanceSnapshotStoreForTests();
    if (previous === undefined) delete process.env.AGENTPAY_DB_PATH;
    else process.env.AGENTPAY_DB_PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  });
}

const wallet = {
  status: "CONNECTED" as const,
  addresses: [],
  chains: [],
  transactions: [],
  balances: [
    { symbol: "USDT", address: "hidden-address", binanceChainId: "56", balance: "5", price: "1", value: "5" },
  ],
};

const binance = {
  configured: true,
  connection: "partial" as const,
  readOnly: true as const,
  refreshedAt: "2026-09-05T00:00:00.000Z",
  estimatedTotalUsd: 12,
  pricedAssetCount: 1,
  unpricedAssetCount: 0,
  dustThresholdUsd: 0.1,
  balances: [{ id: "spot:BNB", source: "spot" as const, sourceLabel: "Spot", asset: "BNB", available: "0.02", total: "0.02", usdValue: 12, priceUsd: 600, valuation: "direct" as const }],
  sources: [],
};

test("persists isolated wallet and Binance balance snapshots without addresses", async () => withDatabase(async () => {
  const capture = await captureBalanceSnapshots({ wallet: async () => wallet, binance: async () => binance });
  assert.equal(capture.snapshots.length, 2);
  assert.equal(capture.snapshots[0].status, "captured");
  assert.equal(capture.snapshots[1].status, "captured");
  assert.equal(capture.snapshots[1].message, "Some Binance Account sources were unavailable.");
  const stored = listBalanceSnapshots(8);
  assert.equal(stored.length, 2);
  assert.equal(JSON.stringify(stored).includes("hidden-address"), false);
  assert.deepEqual(stored.flatMap((item) => item.balances.map((balance) => balance.asset)).sort(), ["BNB", "USDT"]);
}));

test("records one source as unavailable without losing the healthy source", async () => withDatabase(async () => {
  const capture = await captureBalanceSnapshots({
    wallet: async () => { throw new Error("provider details must not leak"); },
    binance: async () => binance,
  });
  assert.equal(capture.snapshots.find((item) => item.source === "agentic-wallet")?.status, "unavailable");
  assert.equal(capture.snapshots.find((item) => item.source === "agentic-wallet")?.message, "Agentic Wallet balances are unavailable.");
  assert.equal(capture.snapshots.find((item) => item.source === "binance-account")?.status, "captured");
  assert.equal(JSON.stringify(capture).includes("provider details"), false);
}));
