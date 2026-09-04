import assert from "node:assert/strict";
import test from "node:test";
import { validateX402Resource, X402Error } from "../lib/server/x402";

test("accepts only explicitly allowlisted public HTTPS hosts", () => {
  process.env.AGENTPAY_X402_ALLOWED_HOSTS = "api.example.com";
  assert.equal(validateX402Resource("https://api.example.com/resource"), "https://api.example.com/resource");
  for (const value of ["http://api.example.com/resource", "https://localhost/resource", "https://127.0.0.1/resource", "https://evil.example/resource"]) {
    assert.throws(() => validateX402Resource(value), X402Error);
  }
});
