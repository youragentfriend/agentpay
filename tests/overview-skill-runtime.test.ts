import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { isBinancePayConfirmation, isWalletTransferConfirmation, runOverviewSkillRuntime, type AssistantActivityReportingRuntime, type AssistantBinancePayRuntime, type AssistantBinancePortfolioRuntime, type AssistantWalletOverviewRuntime, type AssistantWalletTransferRuntime, type AssistantX402Runtime } from "../lib/server/overview-agent";
import type { BinancePayOrder } from "../lib/binance-pay-types";
import type { BinancePortfolio } from "../lib/binance-portfolio-types";
import type { PreparedTransfer } from "../lib/payment-workflow";
import type { WalletOverview } from "../lib/wallet-types";
import type { SpendingReport } from "../lib/report-types";
import type { ActivityPage } from "../lib/server/activity-store";
import type { X402ChatSession, X402Intent } from "../lib/x402-types";
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
let originalFetch: typeof globalThis.fetch;
const previousEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "agentpay-overview-"));
  for (const name of ["AGENTPAY_DB_PATH", "DEEPSEEK_API_KEY", "AGENTPAY_DEEPSEEK_MODEL", "AGENTPAY_ENABLE_WALLET_SEND", "AGENTPAY_ENABLE_BINANCE_PAY", "AGENTPAY_ENABLE_X402"]) previousEnv[name] = process.env[name];
  process.env.AGENTPAY_DB_PATH = path.join(directory, "agentpay.sqlite");
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.AGENTPAY_DEEPSEEK_MODEL = "deepseek-test";
  process.env.AGENTPAY_ENABLE_WALLET_SEND = "false";
  process.env.AGENTPAY_ENABLE_BINANCE_PAY = "false";
  process.env.AGENTPAY_ENABLE_X402 = "false";
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetOverviewSkillRuntimeForTests();
  rmSync(directory, { recursive: true, force: true });
  for (const [name, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

function mockDeepSeek(values: unknown[], prompts: string[] = []) {
  globalThis.fetch = async (_input, init) => {
    prompts.push(String(JSON.parse(String(init?.body)).messages?.[0]?.content));
    const value = values.shift();
    assert.notEqual(value, undefined, "unexpected DeepSeek call");
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

function transfer(values: Partial<PreparedTransfer> = {}): PreparedTransfer {
  return { id: "transfer-1", status: "awaiting-approval", amount: "0.01", amountUsd: "0.01", asset: "USDT", availableBalance: "5", recipient: "0x1111111111111111111111111111111111111111", tokenAddress: "0x2222222222222222222222222222222222222222", binanceChainId: "56", chainName: "BNB Smart Chain", gasLevel: "MEDIUM", createdAt: "2026-09-08T10:00:00.000Z", expiresAt: "2026-09-08T10:10:00.000Z", warnings: [], ...values };
}

function walletRuntime(overrides: Partial<AssistantWalletTransferRuntime> = {}): AssistantWalletTransferRuntime {
  let current = transfer();
  return {
    prepare: async () => current,
    confirm: async () => current = transfer({ status: "submitted", txHash: `0x${"ab".repeat(32)}`, submittedAt: "2026-09-08T10:01:00.000Z" }),
    cancel: () => current = transfer({ status: "failed", errorCode: "USER_CANCELLED", errorMessage: "Cancelled" }),
    get: () => current,
    ...overrides,
  };
}

function x402Runtime(): AssistantX402Runtime {
  return { run: async () => ({ session: { id: "x402-session", status: "awaiting_confirmation", messages: [{ id: "m1", role: "assistant", content: "I prepared an x402 review.", createdAt: new Date().toISOString() }], updatedAt: new Date().toISOString() } }) };
}

function x402Intent(status: X402Intent["status"]): X402Intent {
  const option = { index: 0, status: "READY_TO_SIGN" as const, reasons: [], network: "eip155:8453", amount: "0.01", amountUsd: "0.01", tokenSymbol: "USDC", payTo: "0x1111111111111111111111111111111111111111" };
  return { id: "x402-intent", resourceUrl: "https://service.example/data", resourceHost: "service.example", requestMethod: "GET", source: "agent", status, paymentId: "payment-1", options: [option], selectedIndex: 0, selectedOption: option, createdAt: "2026-09-08T10:00:00.000Z", updatedAt: "2026-09-08T10:00:00.000Z", ...(status === "completed" ? { responseStatus: 200, responseKind: "json" as const, responseBody: "{\"ok\":true}" } : {}) };
}

function binanceOrder(values: Partial<BinancePayOrder> = {}): BinancePayOrder {
  return { status: "AWAITING_CONFIRMATION", checkout_id: "checkout-1", pay_order_id: "order-1", payee: "Demo merchant", amount: "0.01", currency: "USDT", payment_type: "C2C", ...values };
}

function binanceRuntime(overrides: Partial<AssistantBinancePayRuntime> = {}): AssistantBinancePayRuntime {
  return { prepare: async () => binanceOrder(), amount: async () => binanceOrder(), confirm: async () => binanceOrder({ status: "SUCCESS", amount_sent: "0.01" }), poll: async () => binanceOrder({ status: "SUCCESS", amount_sent: "0.01" }), reset: async () => undefined, receive: async () => ({ success: true, shareLink: "https://app.binance.com/uni-qr/demo", currency: "USDT" }), ...overrides };
}

function portfolioRuntime(): AssistantBinancePortfolioRuntime {
  return { load: async (): Promise<BinancePortfolio> => ({ configured: true, connection: "connected", readOnly: true, refreshedAt: "2026-09-08T10:00:00.000Z", estimatedTotalUsd: 5, pricedAssetCount: 1, unpricedAssetCount: 0, dustThresholdUsd: 0.1, balances: [{ id: "spot:USDT", source: "spot", sourceLabel: "Spot", asset: "USDT", available: "5", total: "5", usdValue: 5, priceUsd: 1, valuation: "stablecoin" }], sources: [{ source: "spot", label: "Spot", state: "available", itemCount: 1 }] }) };
}

function walletOverviewRuntime(): AssistantWalletOverviewRuntime {
  const overview: WalletOverview = {
    status: "CONNECTED",
    addresses: [],
    chains: [
      { binanceChainId: "56", name: "BNB Smart Chain", simpleName: "BNB" },
      { binanceChainId: "8453", name: "Base", simpleName: "Base" },
    ],
    balances: [
      { symbol: "USDT", address: "0xtoken", binanceChainId: "56", balance: "5.25", price: "1", value: "5.25" },
      { symbol: "USDT", address: "0xtoken2", binanceChainId: "8453", balance: "2", price: "1", value: "2" },
    ],
    transactions: [],
  };
  return { load: async () => overview };
}

function activityReportingRuntime(): AssistantActivityReportingRuntime {
  const page: ActivityPage = {
    events: [{ id: "activity-1", source: "agentic-wallet", activityType: "transfer", status: "FAILED", statusGroup: "failed", statusCategory: "red", amount: "0.01", asset: "USDT", amountUsd: "0.01", direction: "outgoing", spendState: "none", title: "Agentic Wallet transfer", summary: "Transfer failed", occurredAt: "2026-09-08T10:00:00.000Z", createdAt: "2026-09-08T10:00:00.000Z", updatedAt: "2026-09-08T10:00:00.000Z" }],
    pagination: { page: 1, limit: 8, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
  };
  const report = { generatedAt: "2026-09-08T10:00:00.000Z", timezone: "UTC", range: { preset: "month", from: "2026-09-01", to: "2026-09-08", label: "September 2026" }, filters: { sources: ["agentic-wallet", "binance-pay", "x402"], includePending: false }, summary: { settledTotalUsd: "0.50", pendingTotalUsd: "0.00", transactionCount: 2, pendingCount: 0, averageUsd: "0.25", largestUsd: "0.30", unvaluedCount: 0 }, bySource: [{ key: "agentic-wallet", label: "Agentic Wallet", totalUsd: "0.50", count: 2, percentage: 100 }], byAsset: [], trend: [], calendar: { month: "2026-09", label: "September 2026", days: [] }, transactions: [] } as unknown as SpendingReport;
  return { activity: () => page, report: () => report };
}

const cases = [
  { skill: "agentic-wallet-operations", request: "Send 2 USDT on BSC to 0x1111111111111111111111111111111111111111", operation: "wallet-transfer", action: undefined, path: undefined, parameters: { asset: "USDT", amount: "2", network: "BSC", recipient: "0x1111111111111111111111111111111111111111", gasPriority: "MEDIUM" } },
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
    const result = item.skill === "agentic-wallet-operations"
      ? await runOverviewSkillRuntime(item.request, undefined, process.cwd(), walletRuntime())
      : item.skill === "x402-payment-orchestration"
        ? await runOverviewSkillRuntime(item.request, undefined, process.cwd(), undefined, x402Runtime())
        : item.skill === "binance-pay-orchestration"
          ? await runOverviewSkillRuntime(item.request, undefined, process.cwd(), undefined, undefined, binanceRuntime())
          : item.skill === "binance-portfolio"
            ? await runOverviewSkillRuntime(item.request, undefined, process.cwd(), undefined, undefined, undefined, portfolioRuntime())
          : await runOverviewSkillRuntime(item.request);
    assert.equal(result.skill, item.skill);
    if (item.skill !== "binance-portfolio" && item.skill !== "activity-reporting") assert.equal(result.action, item.action);
    if (item.skill === "agentic-wallet-operations") {
      assert.equal(result.workflow, undefined);
      assert.equal(result.transferPhase, "awaiting-confirmation");
      assert.equal(result.transfer?.chainName, "BNB Smart Chain");
      assert.match(result.message, /reply yes, confirm, or approve/i);
    } else if (item.skill === "x402-payment-orchestration") {
      assert.equal(result.workflow, undefined);
      assert.equal(result.x402Phase, "awaiting-confirmation");
      assert.match(result.message, /x402 review/i);
    } else if (item.skill === "binance-pay-orchestration") {
      assert.equal(result.workflow, undefined);
      assert.equal((result.binancePay as { shareLink?: string } | undefined)?.shareLink, "https://app.binance.com/uni-qr/demo");
    } else if (item.skill === "binance-portfolio") {
      assert.equal(result.workflow, undefined);
      assert.equal(result.action, undefined);
      assert.match(result.message, /USDT/);
    } else if (item.skill === "activity-reporting") {
      assert.equal(result.workflow, undefined);
      assert.equal(result.action, undefined);
      assert.match(result.message, /no matching payment activity/i);
    }
    assert.match(prompts[1], /--- COMPLETE SKILL\.md ---/);
    assert.match(prompts[1], new RegExp(`name: ["']?${item.skill}`));
    assert.equal(process.env.AGENTPAY_ENABLE_WALLET_SEND, "false");
    assert.equal(process.env.AGENTPAY_ENABLE_BINANCE_PAY, "false");
    assert.equal(process.env.AGENTPAY_ENABLE_X402, "false");
  });
}

test("keeps the selected skill across a follow-up and collects missing transfer fields", async () => {
  mockDeepSeek([
    { skill: "agentic-wallet-operations", switchSkill: false },
    { operation: "wallet-transfer", message: "What amount and recipient should I use?", parameters: { asset: "USDT" }, missingFields: ["amount", "recipient", "network"] },
    { skill: "agentic-wallet-operations", switchSkill: false },
    { operation: "wallet-transfer", message: "The transfer is ready for deterministic review.", parameters: { asset: "USDT", amount: "4", recipient: "0x1111111111111111111111111111111111111111", network: "BSC" }, missingFields: [] },
  ]);
  const runtime = walletRuntime();
  const first = await runOverviewSkillRuntime("Send USDT", undefined, process.cwd(), runtime);
  assert.equal(first.action, undefined);
  assert.deepEqual(first.missingFields, ["amount", "recipient", "network"]);
  const second = await runOverviewSkillRuntime("4 to 0x1111111111111111111111111111111111111111 on BSC", first.conversationId, process.cwd(), runtime);
  assert.equal(second.skill, "agentic-wallet-operations");
  assert.equal(second.action, undefined);
  assert.equal(second.transferPhase, "awaiting-confirmation");
  assert.equal(getOverviewConversation(first.conversationId).selectedSkill, "agentic-wallet-operations");
});

test("continues an x402 review from chat confirmation and clears the pending session after delivery", async () => {
  const calls: Array<{ sessionId?: string; message?: string; action?: "cancel" }> = [];
  const session = (status: X402ChatSession["status"]): X402ChatSession => ({ id: "x402-session", status, messages: [{ id: "m1", role: "assistant", content: status === "completed" ? "Payment completed." : "Confirm this x402 purchase.", createdAt: new Date().toISOString() }], updatedAt: new Date().toISOString() });
  const runtime: AssistantX402Runtime = { run: async (input) => { calls.push(input); return input.sessionId ? { session: session("completed"), intent: x402Intent("completed") } : { session: session("awaiting_confirmation"), intent: x402Intent("reviewed") }; } };
  mockDeepSeek([
    { skill: "x402-payment-orchestration", switchSkill: false },
    { operation: "x402-service", message: "I found a service.", parameters: { request: "Bitcoin price" }, missingFields: [] },
  ]);
  const first = await runOverviewSkillRuntime("Find a Bitcoin price service", undefined, process.cwd(), undefined, runtime);
  assert.equal(first.x402Phase, "awaiting-confirmation");
  assert.equal(getOverviewConversation(first.conversationId).pendingX402SessionId, "x402-session");
  const second = await runOverviewSkillRuntime("Confirm", first.conversationId, process.cwd(), undefined, runtime);
  assert.equal(second.x402Phase, "completed");
  assert.equal(second.x402?.status, "completed");
  assert.equal(getOverviewConversation(first.conversationId).pendingX402SessionId, undefined);
  assert.deepEqual(calls, [{ message: "Find a Bitcoin price service" }, { sessionId: "x402-session", message: "Confirm" }]);
});

test("prepares and automatically confirms a Binance Pay link from chat", async () => {
  const calls: string[] = [];
  const runtime = binanceRuntime({
    prepare: async () => { calls.push("prepare"); return binanceOrder(); },
    confirm: async () => { calls.push("confirm"); return binanceOrder({ status: "SUCCESS", amount_sent: "0.01" }); },
  });
  const review = await runOverviewSkillRuntime("Pay this Binance Pay request: https://app.binance.com/qr/demo", undefined, process.cwd(), undefined, undefined, runtime);
  assert.equal(review.binancePayPhase, "review");
  assert.match(review.message, /reply confirm/i);
  assert.equal(getOverviewConversation(review.conversationId).pendingBinancePay, true);
  const success = await runOverviewSkillRuntime("Confirm", review.conversationId, process.cwd(), undefined, undefined, runtime);
  assert.equal(success.binancePayPhase, "success");
  assert.match(success.message, /payment successful/i);
  assert.equal(getOverviewConversation(review.conversationId).pendingBinancePay, false);
  assert.deepEqual(calls, ["prepare", "confirm"]);
});

test("accepts only clear Binance Pay confirmations", () => {
  for (const value of ["yes", "confirm", "approved", "go ahead", "yes, pay it"]) assert.equal(isBinancePayConfirmation(value), true);
  for (const value of ["can you confirm?", "yes but change the amount", "not yet", "no", "cancel"]) assert.equal(isBinancePayConfirmation(value), false);
});

test("prepares from collected chat fields and automatically broadcasts after explicit confirmation", async () => {
  const calls: Array<{ type: string; value?: Record<string, string> }> = [];
  const runtime = walletRuntime({
    prepare: async (parameters) => { calls.push({ type: "prepare", value: parameters }); return transfer({ recipient: parameters.recipient, amount: parameters.amount }); },
    confirm: async () => { calls.push({ type: "confirm" }); return transfer({ status: "submitted", txHash: `0x${"cd".repeat(32)}`, submittedAt: "2026-09-08T10:02:00.000Z" }); },
  });
  mockDeepSeek([
    { skill: "agentic-wallet-operations", switchSkill: false },
    { operation: "wallet-transfer", message: "Need a network.", parameters: { asset: "USDT", amount: "0.01", recipient: "0x1111111111111111111111111111111111111111" }, missingFields: ["network"], title: "Send USDT Wallet Transfer" },
    { skill: "agentic-wallet-operations", switchSkill: false },
    { operation: "wallet-transfer", message: "Ready.", parameters: { network: "bnb" }, missingFields: [] },
  ]);
  const first = await runOverviewSkillRuntime("USDT 0.01 to 0x1111111111111111111111111111111111111111", undefined, process.cwd(), runtime);
  assert.deepEqual(first.missingFields, ["network"]);
  assert.match(first.message, /which network/i);
  const review = await runOverviewSkillRuntime("bnb", first.conversationId, process.cwd(), runtime);
  assert.equal(review.workflow, undefined);
  assert.equal(review.action, undefined);
  assert.equal(review.transferPhase, "awaiting-confirmation");
  assert.deepEqual(calls[0]?.value, { asset: "USDT", amount: "0.01", recipient: "0x1111111111111111111111111111111111111111", network: "bnb" });
  const submitted = await runOverviewSkillRuntime("approved", first.conversationId, process.cwd(), runtime);
  assert.equal(submitted.transferPhase, "submitted");
  assert.equal(calls.at(-1)?.type, "confirm");
  assert.match(submitted.message, /transaction was broadcast/i);
  assert.match(submitted.message, /transaction hash:/i);
  assert.equal(getOverviewConversation(first.conversationId).pendingTransferId, undefined);
});

test("returns a natural-language Agentic Wallet balance without rendering a workflow", async () => {
  mockDeepSeek([
    { skill: "agentic-wallet-operations", switchSkill: false },
    { operation: "wallet-overview", message: "Reading the wallet.", parameters: { asset: "USDT", network: "BNB" }, missingFields: [] },
  ]);
  const result = await runOverviewSkillRuntime("What is my Agentic Wallet USDT balance on BNB Chain?", undefined, process.cwd(), undefined, undefined, undefined, undefined, walletOverviewRuntime());
  assert.equal(result.action, undefined);
  assert.equal(result.workflow, undefined);
  assert.match(result.message, /5\.25 USDT on BNB/i);
  assert.match(result.message, /read-only/i);
});

test("summarizes Activity and Reports in natural language without rendering layouts", async () => {
  mockDeepSeek([
    { skill: "activity-reporting", switchSkill: false },
    { operation: "activity-report", message: "Reading activity.", parameters: { statusGroup: "failed", asset: "USDT" }, missingFields: [] },
    { skill: "activity-reporting", switchSkill: false },
    { operation: "activity-report", message: "Building a report.", parameters: {}, missingFields: [] },
  ]);
  const runtime = activityReportingRuntime();
  const activity = await runOverviewSkillRuntime("Show my failed USDT activity this month", undefined, process.cwd(), undefined, undefined, undefined, undefined, undefined, runtime);
  assert.equal(activity.action, undefined);
  assert.match(activity.message, /1 matching payment record/i);
  assert.match(activity.message, /failed/i);
  const report = await runOverviewSkillRuntime("How much did I spend this month?", undefined, process.cwd(), undefined, undefined, undefined, undefined, undefined, runtime);
  assert.equal(report.action, undefined);
  assert.match(report.message, /\$0\.50 in settled spending/i);
  assert.match(report.message, /Agentic Wallet: \$0\.50/i);
});

test("accepts only clear transfer confirmations", () => {
  for (const value of ["yes", "confirm", "approved", "go ahead", "yes, send it"]) assert.equal(isWalletTransferConfirmation(value), true);
  for (const value of ["can you confirm?", "yes but change the amount", "not yet", "no", "cancel"]) assert.equal(isWalletTransferConfirmation(value), false);
});

test("keeps the exact review pending when server payment controls block confirmation", async () => {
  const runtime = walletRuntime({ confirm: async () => { throw Object.assign(new Error("The emergency stop is active."), { code: "PAYMENTS_EMERGENCY_STOPPED" }); } });
  mockDeepSeek([
    { skill: "agentic-wallet-operations", switchSkill: false },
    { operation: "wallet-transfer", message: "Ready.", parameters: { asset: "USDT", amount: "0.01", recipient: "0x1111111111111111111111111111111111111111", network: "BNB" }, missingFields: [], title: "Send USDT Wallet Transfer" },
  ]);
  const review = await runOverviewSkillRuntime("Send 0.01 USDT on BNB", undefined, process.cwd(), runtime);
  const blocked = await runOverviewSkillRuntime("yes", review.conversationId, process.cwd(), runtime);
  assert.equal(blocked.transferPhase, "blocked");
  assert.match(blocked.message, /nothing was sent/i);
  assert.equal(getOverviewConversation(review.conversationId).pendingTransferId, "transfer-1");
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
  assert.equal(second.action, undefined);
});

test("clarifies ambiguous USDT balance source before selecting a skill", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("should not call provider"); };
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
  assert.deepEqual(validateSkillExecution("activity-reporting", { operation: "activity-report", message: "safe", parameters: { endpoint: "https://evil.example", asset: "USDT" }, missingFields: [] }).parameters, { asset: "USDT" });
  assert.deepEqual(validateSkillExecution("binance-pay-orchestration", { operation: "binance-pay-inspect", message: "safe", parameters: {}, missingFields: ["apiKey"] }).missingFields, ["rawQr"]);
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
