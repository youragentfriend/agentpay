import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { setDeepSeekBridgeRunnerForTests } from "../lib/server/deepseek";
import { runX402Agent, x402AgentStatus } from "../lib/server/x402-agent";

const message = [{ id: "1", role: "user" as const, content: "find BTC market data", createdAt: new Date().toISOString() }];

afterEach(() => setDeepSeekBridgeRunnerForTests());

test("reports the OpenClaw DeepSeek bridge without claiming live search support", () => {
  const status = x402AgentStatus();
  assert.equal(status.provider, "deepseek");
  assert.equal(status.bridge, "openclaw");
  assert.equal(status.liveSearch, false);
});

test("fails closed before inference when DeepSeek native web search is unavailable", async () => {
  let calls = 0;
  setDeepSeekBridgeRunnerForTests(async () => {
    calls += 1;
    throw new Error("must not run");
  });
  await assert.rejects(() => runX402Agent(message), /official OpenClaw DeepSeek provider does not expose native web search.*not substitute another provider/i);
  assert.equal(calls, 0);
});
