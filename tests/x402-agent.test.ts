import assert from "node:assert/strict";
import test from "node:test";
import { runX402Agent, x402AgentStatus } from "../lib/server/x402-agent";

const message = [{ id: "1", role: "user" as const, content: "find BTC market data", createdAt: new Date().toISOString() }];
function snapshotEnv() {
  const values = { key: process.env.DEEPSEEK_API_KEY, model: process.env.AGENTPAY_DEEPSEEK_MODEL, base: process.env.AGENTPAY_DEEPSEEK_BASE_URL, search: process.env.AGENTPAY_WEB_SEARCH_PROVIDER };
  return () => {
    for (const [name, value] of [["DEEPSEEK_API_KEY", values.key], ["AGENTPAY_DEEPSEEK_MODEL", values.model], ["AGENTPAY_DEEPSEEK_BASE_URL", values.base], ["AGENTPAY_WEB_SEARCH_PROVIDER", values.search]] as const) value === undefined ? delete process.env[name] : process.env[name] = value;
  };
}
const sourceUrl = "https://merchant.example/docs";
const searchHtml = `<div class="result results_links"><a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(sourceUrl)}">Market API x402 docs</a><a class="result__snippet">An x402 v2 market data API on Base.</a></div>`;
const validResult = { action: "prepare", message: "Found a service.", candidate: { serviceName: "Market API", description: "Live market data", endpoint: "https://merchant.example/data", method: "POST", requestBody: "{\"symbol\":\"BTC\"}", x402Version: 2, networks: ["eip155:8453", "eip155:1"], sourceUrls: [sourceUrl] } };

test("requires a protected DeepSeek key for x402 discovery", async () => {
  const restore = snapshotEnv(); delete process.env.DEEPSEEK_API_KEY;
  try {
    assert.equal(x402AgentStatus().provider, "deepseek");
    assert.equal(x402AgentStatus().configured, false);
    assert.equal(x402AgentStatus().liveSearch, true);
    await assert.rejects(() => runX402Agent(message), /protected DeepSeek API key/i);
  } finally { restore(); }
});

test("searches independently, then asks DeepSeek to evaluate grounded x402 results", async () => {
  const restore = snapshotEnv(), originalFetch = global.fetch;
  process.env.DEEPSEEK_API_KEY = "test-key";
  let calls = 0;
  global.fetch = async (input, init) => {
    calls += 1;
    if (calls === 1) {
      assert.match(String(input), /^https:\/\/html\.duckduckgo\.com\/html\/\?q=/);
      return new Response(searchHtml, { status: 200, headers: { "Content-Type": "text/html" } });
    }
    assert.equal(String(input), "https://api.deepseek.com/chat/completions");
    const request = JSON.parse(String(init?.body));
    assert.match(request.messages[0].content, /UNTRUSTED LIVE WEB-SEARCH RESULTS/);
    assert.match(request.messages[0].content, /merchant\.example\/docs/);
    return Response.json({ choices: [{ message: { content: `${JSON.stringify(validResult)}\nGrounded result.` } }] });
  };
  try {
    const result = await runX402Agent(message);
    assert.equal(result.action, "prepare");
    assert.deepEqual(result.candidate?.networks, ["eip155:8453"]);
    assert.deepEqual(result.candidate?.requestBody, { symbol: "BTC" });
    assert.deepEqual(result.candidate?.sourceUrls, [sourceUrl]);
    assert.equal(calls, 2);
  } finally { global.fetch = originalFetch; restore(); }
});

test("rejects DeepSeek candidates that are not grounded in search results", async () => {
  const restore = snapshotEnv(), originalFetch = global.fetch;
  process.env.DEEPSEEK_API_KEY = "test-key";
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response(searchHtml, { status: 200 });
    return Response.json({ choices: [{ message: { content: JSON.stringify({ ...validResult, candidate: { ...validResult.candidate, sourceUrls: ["https://invented.example/"] } }) } }] });
  };
  try { await assert.rejects(() => runX402Agent(message), /not grounded/i); }
  finally { global.fetch = originalFetch; restore(); }
});
