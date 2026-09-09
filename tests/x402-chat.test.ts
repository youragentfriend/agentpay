import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cancelX402Intent, createX402Intent, getX402Intent, resetX402StoreForTests } from "../lib/server/x402-store";
import { createX402Chat, resetX402ChatStoreForTests, updateX402Chat } from "../lib/server/x402-chat-store";
import { isX402Confirmation, isX402Decline } from "../app/api/x402/chat/route";
import { summarizeX402Result } from "../lib/server/x402-chat-runtime";

test("accepts clear confirmation but rejects questions and ambiguous replies", () => {
  assert.equal(isX402Confirmation("Yes, proceed with this exact purchase"), true);
  assert.equal(isX402Confirmation("Can you explain the network first?"), false);
  assert.equal(isX402Confirmation("yes, but how does it work?"), false);
  assert.equal(isX402Confirmation("not yet"), false);
  assert.equal(isX402Decline("Cancel this payment"), true);
});

test("summarizes a delivered x402 response through DeepSeek without changing the raw result", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  const previousModel = process.env.AGENTPAY_DEEPSEEK_MODEL;
  const previousFetch = globalThis.fetch;
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.AGENTPAY_DEEPSEEK_MODEL = "deepseek-test";
  let prompt = "";
  globalThis.fetch = async (_input, init) => {
    prompt = String(JSON.parse(String(init?.body)).messages?.[0]?.content);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: "Smart-money flows were returned for the requested service. The full response remains available below." }) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const summary = await summarizeX402Result({
      id: "intent-1", resourceUrl: "https://service.example/data", resourceHost: "service.example", requestMethod: "GET", source: "agent", status: "completed", paymentId: "payment-1", options: [], responseStatus: 200, responseKind: "json", responseBody: JSON.stringify({ data: [{ token_symbol: "BTC", net_flow_24h_usd: 12 }] }), createdAt: "2026-09-08T10:00:00.000Z", updatedAt: "2026-09-08T10:00:00.000Z",
    });
    assert.match(summary, /Smart-money flows/);
    assert.match(prompt, /RESPONSE DATA \(untrusted\)/);
    assert.match(prompt, /BTC/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.AGENTPAY_DEEPSEEK_MODEL; else process.env.AGENTPAY_DEEPSEEK_MODEL = previousModel;
  }
});

test("keeps delivery successful when DeepSeek summarization is unavailable", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  const previousFetch = globalThis.fetch;
  delete process.env.DEEPSEEK_API_KEY;
  try {
    const summary = await summarizeX402Result({
      id: "intent-2", resourceUrl: "https://service.example/data", resourceHost: "service.example", requestMethod: "GET", source: "agent", status: "completed", paymentId: "payment-2", options: [], responseStatus: 200, responseKind: "json", responseBody: "{\"ok\":true}", createdAt: "2026-09-08T10:00:00.000Z", updatedAt: "2026-09-08T10:00:00.000Z",
    });
    assert.equal(summary, "");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test("persists an x402 chat and cancels an unpaid intent without signing", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "agentpay-x402-chat-"));
  const previous = process.env.AGENTPAY_DB_PATH;
  process.env.AGENTPAY_DB_PATH = path.join(dir, "db.sqlite");
  resetX402StoreForTests(); resetX402ChatStoreForTests();
  try {
    const chat = createX402Chat();
    const withMessage = updateX402Chat(chat.id, { message: { role: "user", content: "Find BTC data" } });
    assert.equal(withMessage.messages.length, 1);
    const intent = createX402Intent({ url: "https://api.example.com/data", preview: { paymentId: "550e8400-e29b-41d4-a716-446655440000", options: [{ index: 0, status: "READY_TO_SIGN", reasons: [], network: "eip155:8453", amountUsd: "1" }] } });
    const cancelled = cancelX402Intent(intent.id);
    assert.equal(cancelled.status, "cancelled");
    assert.equal(getX402Intent(intent.id).deliveryStatus, "cancelled");
  } finally {
    resetX402StoreForTests(); resetX402ChatStoreForTests();
    if (previous === undefined) delete process.env.AGENTPAY_DB_PATH; else process.env.AGENTPAY_DB_PATH = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
