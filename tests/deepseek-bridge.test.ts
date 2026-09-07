import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { callDeepSeekJson, deepSeekStatus, setDeepSeekBridgeRunnerForTests } from "../lib/server/deepseek";

const previousModel = process.env.AGENTPAY_DEEPSEEK_MODEL;

afterEach(() => {
  setDeepSeekBridgeRunnerForTests();
  if (previousModel === undefined) delete process.env.AGENTPAY_DEEPSEEK_MODEL;
  else process.env.AGENTPAY_DEEPSEEK_MODEL = previousModel;
});

function envelope(text: string, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    status: "ok",
    result: {
      payloads: [{ text }],
      meta: { agentMeta: { provider: "deepseek", model: "deepseek-test" } },
      executionTrace: { winnerProvider: "deepseek", winnerModel: "deepseek-test", fallbackUsed: false, ...overrides },
    },
  });
}

test("accepts only an attested DeepSeek-only OpenClaw bridge result", async () => {
  process.env.AGENTPAY_DEEPSEEK_MODEL = "deepseek-test";
  let prompt = "";
  setDeepSeekBridgeRunnerForTests(async (input) => {
    prompt = input;
    return { stdout: envelope('{"ok":true}'), stderr: "" };
  });
  assert.deepEqual(await callDeepSeekJson("route this", { schema: { type: "object" }, schemaName: "route" }), { ok: true });
  assert.match(prompt, /Required JSON Schema \(route\)/);
  assert.deepEqual(deepSeekStatus(), { configured: true, provider: "deepseek", model: "deepseek-test", liveSearch: false, bridge: "openclaw" });
});

test("rejects fallback or non-DeepSeek bridge results", async () => {
  process.env.AGENTPAY_DEEPSEEK_MODEL = "deepseek-test";
  setDeepSeekBridgeRunnerForTests(async () => ({ stdout: envelope('{"ok":true}', { fallbackUsed: true }), stderr: "" }));
  await assert.rejects(() => callDeepSeekJson("route this"), /fallback bridge result/i);
});

for (const item of [
  { diagnostic: "provider credential not configured", expected: /protected DeepSeek API key is not configured/i },
  { diagnostic: "provider returned HTTP 401 unauthorized", expected: /rejected the protected AgentPay credential/i },
  { diagnostic: "provider returned HTTP 402 insufficient balance", expected: /balance is insufficient/i },
  { diagnostic: "provider returned HTTP 429 rate limit quota", expected: /rate limited.*did not fall back/i },
  { diagnostic: "command timed out and received SIGTERM", expected: /did not respond.*timeout/i },
] as const) {
  test(`maps ${item.diagnostic} without retrying or falling back`, async () => {
    let calls = 0;
    setDeepSeekBridgeRunnerForTests(async () => { calls += 1; throw new Error(item.diagnostic); });
    await assert.rejects(() => callDeepSeekJson("route this"), item.expected);
    assert.equal(calls, 1);
  });
}

test("refuses unsupported native web search before any provider call", async () => {
  let calls = 0;
  setDeepSeekBridgeRunnerForTests(async () => { calls += 1; return { stdout: envelope("{}"), stderr: "" }; });
  await assert.rejects(() => callDeepSeekJson("discover", { webSearch: true }), /does not expose native web search/i);
  assert.equal(calls, 0);
});
