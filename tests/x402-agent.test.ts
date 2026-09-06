import assert from "node:assert/strict";
import test from "node:test";
import { runX402Agent, x402AgentStatus } from "../lib/server/x402-agent";

const message = [{ id: "1", role: "user" as const, content: "find BTC market data", createdAt: new Date().toISOString() }];

function snapshotEnv() {
  const values = { provider: process.env.AGENTPAY_LLM_PROVIDER, shared: process.env.AGENTPAY_LLM_API_KEY, gemini: process.env.GEMINI_API_KEY, openai: process.env.OPENAI_API_KEY };
  return () => {
    for (const [name, value] of [["AGENTPAY_LLM_PROVIDER", values.provider], ["AGENTPAY_LLM_API_KEY", values.shared], ["GEMINI_API_KEY", values.gemini], ["OPENAI_API_KEY", values.openai]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  };
}

const validResult = { action: "prepare", message: "Found a service.", candidate: { serviceName: "Market API", description: "Live market data", endpoint: "https://merchant.example/data", method: "POST", requestBody: "{\"symbol\":\"BTC\"}", x402Version: 2, networks: ["eip155:8453", "eip155:1"], sourceUrls: ["https://merchant.example/docs"] } };

test("requires a protected key for live x402 web search", async () => {
  const restore = snapshotEnv();
  delete process.env.AGENTPAY_LLM_API_KEY; delete process.env.GEMINI_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.AGENTPAY_LLM_PROVIDER;
  try {
    assert.equal(x402AgentStatus().provider, "gemini");
    assert.equal(x402AgentStatus().configured, false);
    await assert.rejects(() => runX402Agent(message), /protected live-search LLM API key/i);
  } finally { restore(); }
});

test("uses Gemini Google Search by default and validates the returned x402 candidate", async () => {
  const restore = snapshotEnv(), originalFetch = global.fetch;
  process.env.AGENTPAY_LLM_PROVIDER = "gemini"; process.env.GEMINI_API_KEY = "test-key"; delete process.env.AGENTPAY_LLM_API_KEY;
  global.fetch = async (input, init) => {
    assert.match(String(input), /generativelanguage\.googleapis\.com\/v1beta\/interactions$/);
    assert.equal((init?.headers as Record<string, string>)["x-goog-api-key"], "test-key");
    const request = JSON.parse(String(init?.body));
    assert.equal(request.model, "gemini-3.6-flash");
    assert.deepEqual(request.tools, [{ type: "google_search" }]);
    return Response.json({ output_text: JSON.stringify(validResult) });
  };
  try {
    const result = await runX402Agent(message);
    assert.equal(result.action, "prepare");
    assert.deepEqual(result.candidate?.networks, ["eip155:8453"]);
    assert.deepEqual(result.candidate?.requestBody, { symbol: "BTC" });
  } finally { global.fetch = originalFetch; restore(); }
});

test("supports OpenAI web search as an optional provider", async () => {
  const restore = snapshotEnv(), originalFetch = global.fetch;
  process.env.AGENTPAY_LLM_PROVIDER = "openai"; process.env.OPENAI_API_KEY = "test-key"; delete process.env.AGENTPAY_LLM_API_KEY;
  global.fetch = async (input, init) => {
    assert.match(String(input), /api\.openai\.com\/v1\/responses$/);
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-key");
    const request = JSON.parse(String(init?.body));
    assert.deepEqual(request.tools, [{ type: "web_search" }]);
    assert.equal(request.store, false);
    return Response.json({ output_text: JSON.stringify(validResult) });
  };
  try { assert.equal((await runX402Agent(message)).candidate?.serviceName, "Market API"); }
  finally { global.fetch = originalFetch; restore(); }
});

test("rejects unsupported live-search payment candidates", async () => {
  const restore = snapshotEnv(), originalFetch = global.fetch;
  process.env.AGENTPAY_LLM_PROVIDER = "gemini"; process.env.GEMINI_API_KEY = "test-key"; delete process.env.AGENTPAY_LLM_API_KEY;
  global.fetch = async () => Response.json({ output_text: JSON.stringify({ action: "prepare", message: "Found one.", candidate: { serviceName: "Wrong chain", description: "Unsupported", endpoint: "https://merchant.example/data", method: "GET", requestBody: null, x402Version: 2, networks: ["eip155:1"], sourceUrls: [] } }) });
  try { await assert.rejects(() => runX402Agent(message), /supported BSC, Base, or Solana/i); }
  finally { global.fetch = originalFetch; restore(); }
});
