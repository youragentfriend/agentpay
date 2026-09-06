import assert from "node:assert/strict";
import test from "node:test";
import { runX402Agent, x402AgentStatus } from "../lib/server/x402-agent";

test("requires a protected key for live x402 web search", async () => {
  const key = process.env.AGENTPAY_LLM_API_KEY, openai = process.env.OPENAI_API_KEY;
  delete process.env.AGENTPAY_LLM_API_KEY; delete process.env.OPENAI_API_KEY;
  try {
    assert.equal(x402AgentStatus().configured, false);
    await assert.rejects(() => runX402Agent([{ id: "1", role: "user", content: "find market data", createdAt: new Date().toISOString() }]), /protected OpenAI API key/i);
  } finally {
    if (key === undefined) delete process.env.AGENTPAY_LLM_API_KEY; else process.env.AGENTPAY_LLM_API_KEY = key;
    if (openai === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = openai;
  }
});

test("accepts only a supported x402 v2 endpoint returned by the live-search agent", async () => {
  const key = process.env.AGENTPAY_LLM_API_KEY, originalFetch = global.fetch;
  process.env.AGENTPAY_LLM_API_KEY = "test-key";
  global.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body));
    assert.deepEqual(request.tools, [{ type: "web_search" }]);
    assert.equal(request.store, false);
    return Response.json({ output_text: JSON.stringify({ action: "prepare", message: "Found a service.", candidate: { serviceName: "Market API", description: "Live market data", endpoint: "https://merchant.example/data", method: "POST", requestBody: "{\"symbol\":\"BTC\"}", x402Version: 2, networks: ["eip155:8453", "eip155:1"], sourceUrls: ["https://merchant.example/docs"] } }) });
  };
  try {
    const result = await runX402Agent([{ id: "1", role: "user", content: "find BTC market data", createdAt: new Date().toISOString() }]);
    assert.equal(result.action, "prepare");
    assert.deepEqual(result.candidate?.networks, ["eip155:8453"]);
    assert.deepEqual(result.candidate?.requestBody, { symbol: "BTC" });
  } finally {
    global.fetch = originalFetch;
    if (key === undefined) delete process.env.AGENTPAY_LLM_API_KEY; else process.env.AGENTPAY_LLM_API_KEY = key;
  }
});

test("rejects unsupported live-search payment candidates", async () => {
  const key = process.env.AGENTPAY_LLM_API_KEY, originalFetch = global.fetch;
  process.env.AGENTPAY_LLM_API_KEY = "test-key";
  global.fetch = async () => Response.json({ output_text: JSON.stringify({ action: "prepare", message: "Found one.", candidate: { serviceName: "Wrong chain", description: "Unsupported", endpoint: "https://merchant.example/data", method: "GET", requestBody: null, x402Version: 2, networks: ["eip155:1"], sourceUrls: [] } }) });
  try {
    await assert.rejects(() => runX402Agent([{ id: "1", role: "user", content: "find data", createdAt: new Date().toISOString() }]), /supported BSC, Base, or Solana/i);
  } finally {
    global.fetch = originalFetch;
    if (key === undefined) delete process.env.AGENTPAY_LLM_API_KEY; else process.env.AGENTPAY_LLM_API_KEY = key;
  }
});
