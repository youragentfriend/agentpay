import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBazaarResource } from "../lib/server/x402-bazaar";

test("normalizes only BSC x402 v2 Bazaar resources", () => {
  const item = normalizeBazaarResource({
    x402Version: 2,
    resource: "https://merchant.example/api",
    description: "BSC data",
    extensions: { bazaar: { info: { input: { method: "POST", body: { chain: "bsc" } } } } },
    accepts: [{ scheme: "exact", network: "eip155:56", asset: "0xtoken", amount: "1000", payTo: "0xpayee" }],
  }, "api.cdp.coinbase.com", ["merchant.example"]);
  assert.equal(item?.resourceHost, "merchant.example");
  assert.equal(item?.bscOptions.length, 1);
  assert.equal(item?.allowlisted, true);
  assert.equal(item?.method, "POST");
  assert.deepEqual(item?.requestBody, { chain: "bsc" });
  assert.equal(normalizeBazaarResource({ x402Version: 2, resource: "https://base.example/api", accepts: [{ network: "eip155:8453" }] }, "source", []), undefined);
});
