import assert from "node:assert/strict";
import test from "node:test";
import { runX402Agent, x402AgentStatus } from "../lib/server/x402-agent";

const message = [{ id: "1", role: "user" as const, content: "find BTC market data", createdAt: new Date().toISOString() }];
function snapshotEnv() {
  const values = { key: process.env.DEEPSEEK_API_KEY, model: process.env.AGENTPAY_DEEPSEEK_MODEL, base: process.env.AGENTPAY_DEEPSEEK_BASE_URL };
  return () => {
    for (const [name, value] of [["DEEPSEEK_API_KEY", values.key], ["AGENTPAY_DEEPSEEK_MODEL", values.model], ["AGENTPAY_DEEPSEEK_BASE_URL", values.base]] as const) value === undefined ? delete process.env[name] : process.env[name] = value;
  };
}
const validResult = { action: "prepare", message: "Found a service.", candidate: { serviceName: "Market API", description: "Live market data", endpoint: "https://merchant.example/data", method: "POST", requestBody: "{\"symbol\":\"BTC\"}", x402Version: 2, networks: ["eip155:8453", "eip155:1"], sourceUrls: ["https://merchant.example/docs"] } };

test("requires a protected DeepSeek key for live x402 web search", async () => {
  const restore = snapshotEnv(); delete process.env.DEEPSEEK_API_KEY;
  try {
    assert.equal(x402AgentStatus().provider, "deepseek");
    assert.equal(x402AgentStatus().configured, false);
    await assert.rejects(() => runX402Agent(message), /protected DeepSeek API key/i);
  } finally { restore(); }
});

test("uses DeepSeek web search and validates the returned x402 candidate", async () => {
  const restore = snapshotEnv(), originalFetch = global.fetch;
  process.env.DEEPSEEK_API_KEY = "test-key"; delete process.env.AGENTPAY_DEEPSEEK_MODEL;
  global.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.deepseek.com/responses");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-key");
    const request = JSON.parse(String(init?.body));
    assert.equal(request.model, "deepseek-v4-flash");
    assert.deepEqual(request.tools, [{ type: "web_search" }]);
    assert.equal(request.text.format.type, "json_schema");
    return Response.json({ output_text: JSON.stringify(validResult) });
  };
  try {
    const result = await runX402Agent(message);
    assert.equal(result.action, "prepare");
    assert.deepEqual(result.candidate?.networks, ["eip155:8453"]);
    assert.deepEqual(result.candidate?.requestBody, { symbol: "BTC" });
  } finally { global.fetch = originalFetch; restore(); }
});

test("fails closed on DeepSeek rate limits without provider fallback", async () => {
  const restore = snapshotEnv(), originalFetch = global.fetch;
  process.env.DEEPSEEK_API_KEY = "test-key";
  let calls = 0;
  global.fetch = async () => { calls += 1; return new Response("rate limited", { status: 429 }); };
  try {
    await assert.rejects(() => runX402Agent(message), /rate limited.*did not fall back/i);
    assert.equal(calls, 1);
  } finally { global.fetch = originalFetch; restore(); }
});

test("rejects unsupported live-search payment candidates", async () => {
  const restore = snapshotEnv(), originalFetch = global.fetch;
  process.env.DEEPSEEK_API_KEY = "test-key";
  global.fetch = async () => Response.json({ output_text: JSON.stringify({ action: "prepare", message: "Found one.", candidate: { serviceName: "Wrong chain", description: "Unsupported", endpoint: "https://merchant.example/data", method: "GET", requestBody: null, x402Version: 2, networks: ["eip155:1"], sourceUrls: [] } }) });
  try { await assert.rejects(() => runX402Agent(message), /supported BSC, Base, or Solana/i); }
  finally { global.fetch = originalFetch; restore(); }
});
