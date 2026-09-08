import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { DELETE, GET, POST as CREATE } from "../app/api/assistant/conversations/route";
import { POST as CHAT } from "../app/api/assistant/chat/route";
import { runOverviewSkillRuntime } from "../lib/server/overview-agent";
import {
  createOverviewConversation,
  getOverviewConversation,
  listOverviewConversations,
  resetOverviewSkillRuntimeForTests,
  updateOverviewConversation,
} from "../lib/server/overview-skill-runtime";

let directory = "";
let originalFetch: typeof globalThis.fetch;
const previousEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "agentpay-conversations-"));
  for (const name of ["AGENTPAY_DB_PATH", "DEEPSEEK_API_KEY", "AGENTPAY_DEEPSEEK_MODEL"]) previousEnv[name] = process.env[name];
  process.env.AGENTPAY_DB_PATH = path.join(directory, "agentpay.sqlite");
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.AGENTPAY_DEEPSEEK_MODEL = "deepseek-test";
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetOverviewSkillRuntimeForTests();
  rmSync(directory, { recursive: true, force: true });
  for (const [name, value] of Object.entries(previousEnv)) value === undefined ? delete process.env[name] : process.env[name] = value;
});

function mockDeepSeek(values: unknown[], prompts: string[] = []) {
  globalThis.fetch = async (_input, init) => {
    prompts.push(String(JSON.parse(String(init?.body)).messages?.[0]?.content));
    const value = values.shift();
    assert.notEqual(value, undefined, "unexpected DeepSeek call");
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });
  };
}

const activitySelection = { skill: "activity-reporting", switchSkill: false };
const activityExecution = { operation: "activity-report", message: "Here is your latest activity.", parameters: { sort: "newest" }, missingFields: [], title: "Review Recent Payment Activity" };

test("list/get APIs persist non-empty conversations and omit empty sessions", async () => {
  createOverviewConversation();
  const saved = createOverviewConversation();
  updateOverviewConversation(saved.id, { title: "Review Recent Payment Activity", messages: [{ role: "user", content: "show activity" }] });

  const listResponse = await GET(new Request("http://localhost/api/assistant/conversations?limit=20"));
  assert.equal(listResponse.status, 200);
  const listBody = await listResponse.json() as { conversations: Array<{ id: string }> };
  assert.deepEqual(listBody.conversations.map((conversation) => conversation.id), [saved.id]);

  const getResponse = await GET(new Request(`http://localhost/api/assistant/conversations?id=${saved.id}`));
  assert.equal(getResponse.status, 200);
  assert.equal((await getResponse.json() as { conversation: { title: string } }).conversation.title, "Review Recent Payment Activity");

  const createResponse = await CREATE(new Request("http://localhost/api/assistant/conversations", { method: "POST", body: "{}" }));
  assert.equal(createResponse.status, 201);
  assert.equal(listOverviewConversations().length, 1, "New conversation must not create an empty recent-chat entry");
});

test("paginates ten recent chats and deletes one conversation", async () => {
  const ids: string[] = [];
  for (let index = 0; index < 12; index += 1) {
    const conversation = createOverviewConversation();
    ids.push(conversation.id);
    updateOverviewConversation(conversation.id, { title: `Conversation ${index + 1}`, messages: [{ role: "user", content: `message ${index + 1}` }] });
  }

  const firstResponse = await GET(new Request("http://localhost/api/assistant/conversations?limit=10&page=1"));
  const first = await firstResponse.json() as { conversations: Array<{ id: string }>; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
  assert.equal(firstResponse.status, 200);
  assert.equal(first.conversations.length, 10);
  assert.deepEqual(first.pagination, { page: 1, pageSize: 10, total: 12, totalPages: 2 });

  const secondResponse = await GET(new Request("http://localhost/api/assistant/conversations?limit=10&page=2"));
  const second = await secondResponse.json() as { conversations: Array<{ id: string }>; pagination: { page: number; total: number; totalPages: number } };
  assert.equal(second.conversations.length, 2);
  const deletedId = second.conversations[0].id;
  const deleteResponse = await DELETE(new Request(`http://localhost/api/assistant/conversations?id=${deletedId}`, { method: "DELETE" }));
  assert.equal(deleteResponse.status, 200);
  assert.equal((await deleteResponse.json() as { deleted: boolean }).deleted, true);
  assert.throws(() => getOverviewConversation(deletedId), /not found/i);
  assert.equal(listOverviewConversations(20).length, 11);
  assert.ok(ids.includes(deletedId));
});

test("persists the user turn immediately while DeepSeek is in flight", async () => {
  let release!: (response: Response) => void;
  let calls = 0;
  globalThis.fetch = () => {
    calls += 1;
    if (calls === 1) return new Promise<Response>((resolve) => { release = resolve; });
    return Promise.resolve(new Response("{}", { status: 503 }));
  };
  const running = runOverviewSkillRuntime("Show my latest payment activity");
  const pending = listOverviewConversations()[0];
  assert.equal(pending.messages[0].content, "Show my latest payment activity");
  assert.equal(pending.pending, true);
  release(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(activitySelection) }] } }] }), { status: 200 }));
  await assert.rejects(running);
  const completed = getOverviewConversation(pending.id);
  assert.equal(completed.pending, false);
  assert.equal(completed.messages.at(-1)?.role, "assistant");
});

test("generates and persists a first-exchange title without a title-only call", async () => {
  const prompts: string[] = [];
  mockDeepSeek([activitySelection, activityExecution], prompts);
  const result = await runOverviewSkillRuntime("Show my latest payment activity");
  assert.equal(result.title, "Review Recent Payment Activity");
  assert.equal(getOverviewConversation(result.conversationId).title, result.title);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /first completed exchange/i);
});

test("uses a deterministic sanitized fallback for invalid or missing titles and redacts secrets", async () => {
  mockDeepSeek([activitySelection, { ...activityExecution, title: "too short" }]);
  const result = await runOverviewSkillRuntime("Show API_KEY=super-secret latest failed USDT transfers");
  assert.equal(result.title, "Show latest failed USDT transfers");
  const stored = getOverviewConversation(result.conversationId);
  assert.doesNotMatch(JSON.stringify(stored), /super-secret/);
  assert.match(stored.messages[0].content, /\[redacted\]/);
});

test("restores skill, collected fields, pending state, and latest workflow before continuing", async () => {
  mockDeepSeek([
    { skill: "agentic-wallet-operations", switchSkill: false },
    { operation: "wallet-transfer", message: "Ready for review.", parameters: { asset: "USDT", amount: "3", recipient: "0x1111111111111111111111111111111111111111", network: "BSC" }, missingFields: [], title: "Prepare USDT Wallet Transfer" },
    { skill: "agentic-wallet-operations", switchSkill: false },
    { operation: "wallet-transfer", message: "Updated for review.", parameters: { amount: "4", asset: "USDT", recipient: "0x1111111111111111111111111111111111111111", network: "BSC" }, missingFields: [] },
  ]);
  const first = await runOverviewSkillRuntime("Send 3 USDT on BSC to 0x1111111111111111111111111111111111111111");
  const restored = getOverviewConversation(first.conversationId);
  assert.equal(restored.selectedSkill, "agentic-wallet-operations");
  assert.equal(restored.latestAction, "payment");
  assert.equal(restored.latestWorkflow?.path, "/api/payments/prepare");
  assert.equal(restored.collectedFields.amount, "3");
  assert.equal(restored.pending, false);
  const continued = await runOverviewSkillRuntime("Change the amount to 4", restored.id);
  assert.equal(continued.conversationId, restored.id);
  assert.equal(getOverviewConversation(restored.id).collectedFields.amount, "4");
});

test("supports multiple concurrent conversations without mixing state", async () => {
  globalThis.fetch = async (_input, init) => {
    const prompt = String(JSON.parse(String(init?.body)).messages?.[0]?.content);
    const activity = prompt.includes("alpha activity request");
    const value = prompt.includes("You are AgentPay's skill selector")
      ? { skill: activity ? "activity-reporting" : "binance-portfolio", switchSkill: false }
      : activity
        ? { operation: "activity-report", message: "Alpha activity ready.", parameters: { sort: "newest" }, missingFields: [], title: "Alpha Payment Activity Review" }
        : { operation: "binance-portfolio", message: "Beta holdings ready.", parameters: { source: "Spot" }, missingFields: [], title: "Beta Exchange Holdings Review" };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });
  };
  const [first, second] = await Promise.all([
    runOverviewSkillRuntime("alpha activity request"),
    runOverviewSkillRuntime("beta exchange holdings request"),
  ]);
  assert.notEqual(first.conversationId, second.conversationId);
  assert.equal(getOverviewConversation(first.conversationId).selectedSkill, "activity-reporting");
  assert.equal(getOverviewConversation(second.conversationId).selectedSkill, "binance-portfolio");
  assert.equal(new Set(listOverviewConversations().map((conversation) => conversation.id)).size, 2);
});

test("all four quick actions use the assistant chat route and input bounds stay strict", async () => {
  const source = readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8");
  for (const label of ["Prepare a transfer", "Explore an x402 service", "Check wallet", "Create a payment link"]) {
    assert.match(source, new RegExp(`label: "${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
  assert.doesNotMatch(source, /const responses:/);
  assert.match(source, /onClick=\{\(\) => void sendMessage\(action\.label\)\}/);

  const oversized = await CHAT(new Request("http://localhost/api/assistant/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "x".repeat(4_001) }) }));
  assert.equal(oversized.status, 400);
  const badId = await CHAT(new Request("http://localhost/api/assistant/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "hello", conversationId: "x".repeat(101) }) }));
  assert.equal(badId.status, 400);
  const badLimit = await GET(new Request("http://localhost/api/assistant/conversations?limit=999"));
  assert.equal(badLimit.status, 400);
});
