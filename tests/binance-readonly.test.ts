import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateRawBalances,
  canonicalQuery,
  combineSourceResults,
  estimateAssetPrice,
  normalizeEarn,
  normalizeFunding,
  normalizeFutures,
  normalizeMargin,
  normalizeSpot,
  sanitizeBinanceMessage,
  signCanonicalQuery,
  valueBalances,
  type BinanceSourceLoad,
} from "../lib/server/binance-readonly";
import type { BinancePortfolioSource } from "../lib/binance-portfolio-types";

test("canonicalizes encoded Binance parameters before signing", () => {
  const query = canonicalQuery({ timestamp: 1499827319559, recvWindow: 5000, note: "read only" });
  assert.equal(query, "note=read%20only&recvWindow=5000&timestamp=1499827319559");
  assert.equal(signCanonicalQuery(query, "secret"), "8a12da6b84882765c2747a2c305dcaac25ebcf329376ade8c262ca9c77e5e93f");
});

test("normalizes Spot, Funding, Futures, Earn, and Margin balances", () => {
  assert.deepEqual(normalizeSpot({ balances: [{ asset: "BTC", free: "1", locked: "0.2" }, { asset: "ETH", free: "0", locked: "0" }] }), [
    { source: "spot", asset: "BTC", available: 1, total: 1.2 },
  ]);
  assert.deepEqual(normalizeFunding([{ asset: "USDT", free: "3", locked: "1", freeze: "2", withdrawing: "1" }]), [
    { source: "funding", asset: "USDT", available: 3, total: 7 },
  ]);
  assert.deepEqual(normalizeFutures([{ asset: "USDT", availableBalance: "8", balance: "10" }]), [
    { source: "futures", asset: "USDT", available: 8, total: 10 },
  ]);
  assert.deepEqual(normalizeEarn({ rows: [{ asset: "BNB", totalAmount: "2", canRedeem: true }] }), [
    { source: "earn", asset: "BNB", available: 2, total: 2 },
  ]);
  assert.deepEqual(normalizeMargin({ userAssets: [{ asset: "ETH", free: "0.5", netAsset: "0.4" }] }), [
    { source: "margin", asset: "ETH", available: 0.5, total: 0.4 },
  ]);
});

test("aggregates duplicate source assets without merging account sources", () => {
  const rows = aggregateRawBalances([
    { source: "earn", asset: "USDT", available: 1, total: 1 },
    { source: "earn", asset: "USDT", available: 2, total: 3 },
    { source: "spot", asset: "USDT", available: 4, total: 4 },
  ]);
  assert.deepEqual(rows, [
    { source: "earn", asset: "USDT", available: 3, total: 4 },
    { source: "spot", asset: "USDT", available: 4, total: 4 },
  ]);
});

test("values stablecoins, direct pairs, derived pairs, and retains unpriced assets", () => {
  const prices = new Map([["BTCUSDT", 60_000], ["ETHBTC", 0.05], ["BNBUSDT", 500]]);
  assert.deepEqual(estimateAssetPrice("USDT", prices), { price: 1, valuation: "stablecoin" });
  assert.deepEqual(estimateAssetPrice("BTC", prices), { price: 60_000, valuation: "direct" });
  assert.deepEqual(estimateAssetPrice("ETH", prices), { price: 3_000, valuation: "derived" });
  assert.deepEqual(estimateAssetPrice("UNKNOWN", prices), { price: null, valuation: "unavailable" });

  const balances = valueBalances([
    { source: "spot", asset: "BTC", available: 0.001, total: 0.001 },
    { source: "spot", asset: "BNB", available: 0.0001, total: 0.0001 },
    { source: "spot", asset: "UNKNOWN", available: 2, total: 2 },
  ], prices, 0.1);
  assert.equal(balances.length, 2);
  assert.equal(balances[0].asset, "BTC");
  assert.equal(balances[0].usdValue, 60);
  assert.equal(balances[1].asset, "UNKNOWN");
  assert.equal(balances[1].usdValue, null);
});

test("isolates a denied source while preserving successful balances", () => {
  const sources: BinancePortfolioSource[] = ["spot", "funding"];
  const results: PromiseSettledResult<BinanceSourceLoad>[] = [
    { status: "fulfilled", value: { balances: [{ source: "spot", asset: "USDT", available: 5, total: 5 }] } },
    { status: "rejected", reason: new Error("permission denied") },
  ];
  const combined = combineSourceResults(sources, results);
  assert.equal(combined.rawBalances.length, 1);
  assert.equal(combined.sources[0].state, "available");
  assert.equal(combined.sources[1].state, "unavailable");
  assert.match(combined.sources[1].message || "", /temporarily unavailable/i);
});

test("redacts signatures, API keys, and environment secret values from errors", () => {
  const sanitized = sanitizeBinanceMessage("signature=abc123 X-MBX-APIKEY: key123 BINANCE_READONLY_API_SECRET=secret123");
  assert.equal(sanitized.includes("abc123"), false);
  assert.equal(sanitized.includes("key123"), false);
  assert.equal(sanitized.includes("secret123"), false);
  assert.match(sanitized, /\[redacted\]/);
});
