import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { runOverviewSkillRuntime } from "../lib/server/overview-agent";
import { setDeepSeekBridgeRunnerForTests } from "../lib/server/deepseek";
import {
  createOverviewConversation,
  getOverviewConversation,
  isAmbiguousBalanceRequest,
  loadSkillRuntimeContext,
  resetOverviewSkillRuntimeForTests,
  updateOverviewConversation,
  validateSkillExecution,
  workflowForExecution,
} from "../lib/server/overview-skill-runtime";

let directory = "";
const previousEnv: Record<string, string | undefined> = {};

function bridgeEnvelope(value: unknown) {
  return JSON.stringify({ status: "ok", result: { payloads: [{ text: JSON.stringify(value) }], meta: { agentMeta: { provider: "deepseek", model: "deepseek-test" } }, executionTrace: { winnerProvider: "deepseek", winnerModel: "deepseek-test", fallbackUsed: false } } });
}

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "agentpay-overview-"));
  for (const name of ["AGENTPAY_DB_PATH", "AGENTPAY_DEEPSEEK_MODEL", "AGENTPAY_ENABLE_WALLET_SEND", "AGENTPAY_ENABLE_BINANCE_PAY", "AGENTPAY_ENABLE_X402"]) previousEnv[name] = process.env[name];
  process.env.AGENTPAY_DB_PATH = path.join(directory, "agentpay.sqlite");
  process.env.AGENTPAY_DEEPSEEK_MODEL = "deepseek-test";
  process.env.AGENTPAY_ENABLE_WALLET_SEND = "false";
  process.env.AGENTPAY_ENABLE_BINANCE_PAY = "false";
  process.env.AGENTPAY_ENABLE_X402 = "false";
});

afterEach(() => {
  setDeepSeekBridgeRunnerForTests();
  resetOverviewSkillRuntimeForTests();
  rmSync(directory, { recursive: true, force: true });
  for (const [name, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

function mockDeepSeek(values: unknown[], prompts: string[] = []) {
  setDeepSeekBridgeRunnerForTests(async (input) => {
    prompts.push(input);
    const value = values.shift();
    assert.notEqual(value, undefined, "unexpected DeepSeek call");
    return { stdout: bridgeEnvelope(value), stderr: "" };
  });
}

const cases = [
  { skill: "agentic-wallet-operations", request: "Send 2 USDT on BSC to 0x1111111111111111111111111111111111111111", operation: "wallet-transfer", action: "payment", path: "/api/payments/prepare", parameters: { asset: "USDT", amount: "2", network: "BSC", recipient: "0x1111111111111111111111111111111111111111", gasPriority: "MEDIUM" } },
  { skill: "binance-pay-orchestration", request: "Create a Binance Pay receive link for 8 USDT", operation: "binance-pay-receive", action: "payment-link", path: "/api/binance-pay/receive", parameters: { currency: "USDT", amount: "8" } },
  { skill: "binance-portfolio", request: "Show my Spot and Earn holdings", operation: "binance-portfolio", action: "binance-balance", path: "/api/binance-account/portfolio", parameters: { source: "Spot,Earn" } },
  { skill: "activity-reporting", request: "Show failed USDT activity this month", operation: "activity-report", action: "activity", path: "/api/payments/activity", parameters: { statusGroup: "failed", asset: "USDT", from: "2026-09-01", sort: "newest" } },
  { skill: "x402-payment-orchestration", request: "Inspect https://example.com/premium as an x402 service", operation: "x402-service", action: "x402", path: "/api/x402/chat", parameters: { url: "https://example.com/premium", method: "GET" } },
] as const;

for (const item of cases) {
  test(`routes and executes the ${item.skill} boundary`, async () => {
    const prompts: string[] = [];
    mockDeepSeek([
      { skill: item.skill, switchSkill: false },
      { operation: item.operation, message: "Prepared the deterministic workflow for review.", parameters: item.parameters, missingFields: [] },
    ], prompts);
    const result = await runOverviewSkillRuntime(item.request);
    assert.equal(result.skill, item.skill);
    assert.equal(result.action, item.action);
    assert.equal(result.workflow?.path, item.path);
    assert.equal(result.workflow?.type, "deterministic-workflow");
    assert.deepEqual(result.workflow?.input, item.parameters);
    assert.match(prompts[1], /--- COMPLETE SKILL\.md ---/);
    assert.match(prompts[1], new RegExp(`name: ["']?${item.skill}`));
    assert.equal(process.env.AGENTPAY_ENABLE_WALLET_SEND, "false");
    assert.equal(process.env.AGENTPAY_ENABLE_BINANCE_PAY, "false");
    assert.equal(process.env.AGENTPAY_ENABLE_X402, "false");
    assert.ok(!["/api/payments/approve", "/api/payments/execute", "/api/binance-pay/confirm", "/api/x402/execute"].includes(result.workflow?.path || ""));
  });
}

test("keeps the selected skill across a follow-up and collects missing transfer fields", async () => {
  mockDeepSeek([
    { skill: "agentic-wallet-operations", switchSkill: false },
    { operation: "wallet-transfer", message: "What amount and recipient should I use?", parameters: { asset: "USDT" }, missingFields: ["amount", "recipient", "network"] },
    { skill: "agentic-wallet-operations", switchSkill: false },
    { operation: "wallet-transfer", message: "The transfer is ready for deterministic review.", parameters: { asset: "USDT", amount: "4", recipient: "0x1111111111111111111111111111111111111111", network: "BSC" }, missingFields: [] },
  ]);
  const first = await runOverviewSkillRuntime("Send USDT");
  assert.equal(first.action, undefined);
  assert.deepEqual(first.missingFields, ["amount", "recipient", "network"]);
  const second = await runOverviewSkillRuntime("4 to 0x1111111111111111111111111111111111111111 on BSC", first.conversationId);
  assert.equal(second.skill, "agentic-wallet-operations");
  assert.equal(second.action, "payment");
  assert.equal(getOverviewConversation(first.conversationId).selectedSkill, "agentic-wallet-operations");
});

test("switches skills only on an explicit domain-change decision", async () => {
  mockDeepSeek([
    { skill: "binance-portfolio", switchSkill: false },
    { operation: "binance-portfolio", message: "Opening exchange holdings.", parameters: {}, missingFields: [] },
    { skill: "activity-reporting", switchSkill: true },
    { operation: "activity-report", message: "Opening payment history.", parameters: {}, missingFields: [] },
  ]);
  const first = await runOverviewSkillRuntime("Show my Binance Spot balance");
  const second = await runOverviewSkillRuntime("Instead show my payment history", first.conversationId);
  assert.equal(second.skill, "activity-reporting");
  assert.equal(second.action, "activity");
});

test("clarifies ambiguous USDT balance source before selecting a skill", async () => {
  let calls = 0;
  setDeepSeekBridgeRunnerForTests(async () => { calls += 1; throw new Error("should not call provider"); });
  assert.equal(isAmbiguousBalanceRequest("show my USDT balance"), true);
  const result = await runOverviewSkillRuntime("show my USDT balance");
  assert.equal(result.skill, undefined);
  assert.equal(result.action, undefined);
  assert.deepEqual(result.missingFields, ["balanceSource"]);
  assert.match(result.message, /Agentic Wallet on-chain USDT balance.*Binance exchange account/i);
  assert.equal(calls, 0);
});

test("loads only references relevant to the selected operation", () => {
  const wallet = loadSkillRuntimeContext("agentic-wallet-operations", "show my wallet balance");
  assert.deepEqual(wallet.references.map((reference) => reference.path), ["references/wallet-view.md"]);
  const transfer = loadSkillRuntimeContext("agentic-wallet-operations", "send a transfer and track it");
  assert.deepEqual(transfer.references.map((reference) => reference.path), ["references/send-and-receive.md", "references/security-and-persistence.md"]);
  const x402Info = loadSkillRuntimeContext("x402-payment-orchestration", "what is x402?");
  assert.deepEqual(x402Info.references.map((reference) => reference.path), ["references/security-contract.md"]);
});

test("rejects provider endpoint injection and cross-skill operations", () => {
  assert.throws(() => validateSkillExecution("activity-reporting", { operation: "wallet-transfer", message: "bad", parameters: {}, missingFields: [] }), /invalid operation/);
  assert.throws(() => validateSkillExecution("activity-reporting", { operation: "activity-report", message: "bad", parameters: { endpoint: "https://evil.example" }, missingFields: [] }), /unsupported fields/);
  assert.throws(() => validateSkillExecution("binance-pay-orchestration", { operation: "binance-pay-inspect", message: "bad", parameters: {}, missingFields: ["apiKey"] }), /unsupported field/);
});

test("bounds persisted conversation state", () => {
  const conversation = createOverviewConversation();
  updateOverviewConversation(conversation.id, { selectedSkill: "activity-reporting", messages: Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? "assistant" as const : "user" as const, content: `${index}-${"x".repeat(3_000)}` })) });
  const stored = getOverviewConversation(conversation.id);
  assert.equal(stored.messages.length, 12);
  assert.ok(stored.messages.every((message) => message.content.length <= 2_000));
});

test("safe workflow simulation never maps preparation to approval, signing, or execution", () => {
  const workflows = [
    workflowForExecution(validateSkillExecution("agentic-wallet-operations", { operation: "wallet-transfer", message: "review", parameters: { asset: "USDT", amount: "1", recipient: "0x1111111111111111111111111111111111111111", network: "BSC" }, missingFields: [] })),
    workflowForExecution(validateSkillExecution("binance-pay-orchestration", { operation: "binance-pay-inspect", message: "review", parameters: { rawQr: "https://app.binance.com/qr/mock" }, missingFields: [] })),
    workflowForExecution(validateSkillExecution("x402-payment-orchestration", { operation: "x402-service", message: "review", parameters: { url: "https://example.com/x402", method: "GET" }, missingFields: [] })),
  ];
  assert.deepEqual(workflows.map((workflow) => workflow?.path), ["/api/payments/prepare", "/api/binance-pay/prepare", "/api/x402/chat"]);
  assert.ok(workflows.every((workflow) => workflow?.type === "deterministic-workflow"));
});
