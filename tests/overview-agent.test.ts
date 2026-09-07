import assert from "node:assert/strict";
import test from "node:test";
import { loadOverviewSkillDescriptions, runOverviewAgent, validateOverviewAgentResult } from "../lib/server/overview-agent";
import { setDeepSeekBridgeRunnerForTests } from "../lib/server/deepseek";

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

test("asks the OpenClaw DeepSeek bridge to select from skill descriptions without fallback", async () => {
  const previousModel = process.env.AGENTPAY_DEEPSEEK_MODEL;
  process.env.AGENTPAY_DEEPSEEK_MODEL = "deepseek-test";
  let prompt = "";
  setDeepSeekBridgeRunnerForTests(async (input) => {
    prompt = input;
    return { stdout: JSON.stringify({ status: "ok", result: { payloads: [{ text: JSON.stringify({ skill: "binance-portfolio", action: "binance-balance", message: "Loading your read-only Binance exchange portfolio." }) }], meta: { agentMeta: { provider: "deepseek", model: "deepseek-test" } }, executionTrace: { winnerProvider: "deepseek", winnerModel: "deepseek-test", fallbackUsed: false } } }), stderr: "" };
  });
  try {
    const result = await runOverviewAgent([{ role: "user", content: "Show my Spot and Earn holdings" }]);
    assert.equal(result.skill, "binance-portfolio");
    assert.equal(result.action, "binance-balance");
    assert.match(prompt, /Agentic Wallet is an on-chain wallet/);
    assert.match(prompt, /Binance Portfolio is the read-only Binance exchange account/);
  } finally {
    setDeepSeekBridgeRunnerForTests();
    if (previousModel === undefined) delete process.env.AGENTPAY_DEEPSEEK_MODEL; else process.env.AGENTPAY_DEEPSEEK_MODEL = previousModel;
  }
});
