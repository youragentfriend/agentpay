import assert from "node:assert/strict";
import test from "node:test";
import { parseX402SettlementHash, validateX402Resource, X402Error } from "../lib/server/x402";

test("accepts only explicitly allowlisted public HTTPS hosts", () => {
  process.env.AGENTPAY_X402_ALLOWED_HOSTS = "api.example.com";
  assert.equal(validateX402Resource("https://api.example.com/resource"), "https://api.example.com/resource");
  for (const value of ["http://api.example.com/resource", "https://localhost/resource", "https://127.0.0.1/resource", "https://evil.example/resource"]) {
    assert.throws(() => validateX402Resource(value), X402Error);
  }
});

test("parses the x402 v2 settlement transaction field", () => {
  const header = Buffer.from(JSON.stringify({ success: true, transaction: "0xsettlement", network: "eip155:56" })).toString("base64");
  assert.equal(parseX402SettlementHash(header), "0xsettlement");
});
