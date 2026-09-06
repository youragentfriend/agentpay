import assert from "node:assert/strict";
import test from "node:test";
import { loadOverviewSkillDescriptions, runOverviewAgent, validateOverviewAgentResult } from "../lib/server/overview-agent";

test("loads five deliberately distinct Overview skills", () => {
  const skills = loadOverviewSkillDescriptions();
  assert.equal(skills.length, 5);
  const descriptions = new Map(skills.map((skill) => [skill.name, skill.description]));
  assert.match(descriptions.get("agentic-wallet-operations") || "", /on-chain/i);
  assert.match(descriptions.get("binance-portfolio") || "", /exchange account/i);
  assert.match(descriptions.get("binance-pay-orchestration") || "", /merchant QR/i);
  assert.match(descriptions.get("activity-reporting") || "", /transaction history/i);
  assert.match(descriptions.get("x402-payment-orchestration") || "", /HTTP 402/i);
  assert.equal(new Set(descriptions.values()).size, 5);
});

test("accepts actions only for the selected skill", () => {
  assert.deepEqual(validateOverviewAgentResult({ skill: "agentic-wallet-operations", action: "balance", message: "Loading your on-chain wallet." }), {
    skill: "agentic-wallet-operations", action: "balance", message: "Loading your on-chain wallet.",
  });
  assert.throws(() => validateOverviewAgentResult({ skill: "binance-portfolio", action: "balance", message: "Wrong balance source." }), /invalid action/);
  assert.throws(() => validateOverviewAgentResult({ skill: "activity-reporting", action: "payment", message: "Wrong operation." }), /invalid action/);
});

test("asks Gemini to select from skill descriptions without provider fallback", async () => {
  const previous = {
    provider: process.env.AGENTPAY_LLM_PROVIDER,
    key: process.env.AGENTPAY_LLM_API_KEY,
    model: process.env.AGENTPAY_LLM_MODEL,
  };
  const originalFetch = globalThis.fetch;
  process.env.AGENTPAY_LLM_PROVIDER = "gemini";
  process.env.AGENTPAY_LLM_API_KEY = "test-key";
  process.env.AGENTPAY_LLM_MODEL = "gemini-test";
  let requestBody = "";
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body || "");
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ skill: "binance-portfolio", action: "binance-balance", message: "Loading your read-only Binance exchange portfolio." }) }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await runOverviewAgent([{ role: "user", content: "Show my Spot and Earn holdings" }]);
    assert.equal(result.skill, "binance-portfolio");
    assert.equal(result.action, "binance-balance");
    assert.match(requestBody, /Agentic Wallet is an on-chain wallet/);
    assert.match(requestBody, /Binance Portfolio is the read-only Binance exchange account/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous.provider === undefined) delete process.env.AGENTPAY_LLM_PROVIDER; else process.env.AGENTPAY_LLM_PROVIDER = previous.provider;
    if (previous.key === undefined) delete process.env.AGENTPAY_LLM_API_KEY; else process.env.AGENTPAY_LLM_API_KEY = previous.key;
    if (previous.model === undefined) delete process.env.AGENTPAY_LLM_MODEL; else process.env.AGENTPAY_LLM_MODEL = previous.model;
  }
});
