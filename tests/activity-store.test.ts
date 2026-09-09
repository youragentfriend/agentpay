import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { queryActivityEvents, syncActivityEvents } from "../lib/server/activity-store";

const databasePath = path.join(mkdtempSync(path.join(tmpdir(), "agentpay-activity-")), "activity.sqlite");
process.env.AGENTPAY_DB_PATH = databasePath;
const db = new DatabaseSync(databasePath);
db.exec(`
  CREATE TABLE payment_intents (
    id TEXT PRIMARY KEY, status TEXT NOT NULL, instruction TEXT, amount TEXT NOT NULL, asset TEXT NOT NULL,
    available_balance TEXT NOT NULL, recipient TEXT NOT NULL, token_address TEXT NOT NULL, chain_id TEXT NOT NULL,
    chain_name TEXT NOT NULL, gas_level TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
    approved_at TEXT, submitted_at TEXT, confirmed_at TEXT, tx_hash TEXT, error_code TEXT, error_message TEXT, warnings TEXT NOT NULL
  );
  CREATE TABLE binance_pay_orders (
    id TEXT PRIMARY KEY, checkout_id TEXT NOT NULL, pay_order_id TEXT, status TEXT NOT NULL, payment_type TEXT,
    payee TEXT, amount TEXT, currency TEXT, paid_with TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
  );
  CREATE TABLE x402_intents (
    id TEXT PRIMARY KEY, resource_url TEXT NOT NULL, resource_host TEXT NOT NULL, request_method TEXT NOT NULL,
    request_body TEXT, status TEXT NOT NULL, payment_id TEXT NOT NULL, options_json TEXT NOT NULL, selected_index INTEGER,
    response_status INTEGER, response_content_type TEXT, response_body TEXT, settlement_tx_hash TEXT,
    approval_tx_hash TEXT, error_message TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
  );
`);
const time = "2026-09-04T00:00:00.000Z";
db.prepare(`INSERT INTO payment_intents (id,status,amount,asset,available_balance,recipient,token_address,chain_id,chain_name,gas_level,created_at,expires_at,warnings,error_code,error_message) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run("payment-failed", "failed", "1", "USDT", "1", "0xrecipient", "0xtoken", "56", "BSC", "HIGH", time, time, "[]", "FAILED", "failed");
db.prepare(`INSERT INTO payment_intents (id,status,amount,asset,available_balance,recipient,token_address,chain_id,chain_name,gas_level,created_at,expires_at,warnings,confirmed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run("payment-confirmed", "confirmed", "2", "USDT", "2", "0xrecipient", "0xtoken", "56", "BSC", "HIGH", time, time, "[]", "2026-09-04T01:00:00.000Z");
db.prepare(`INSERT INTO payment_intents (id,status,amount,asset,available_balance,recipient,token_address,chain_id,chain_name,gas_level,created_at,expires_at,warnings) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run("payment-awaiting", "awaiting-approval", "3", "BNB", "3", "0xrecipient", "0xtoken", "56", "BSC", "HIGH", time, time, "[]");
db.prepare(`INSERT INTO payment_intents (id,status,amount,asset,available_balance,recipient,token_address,chain_id,chain_name,gas_level,created_at,expires_at,warnings,submitted_at,tx_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run("payment-submitted", "submitted", "6", "USDT", "6", "0xrecipient", "0xtoken", "56", "BSC", "HIGH", time, time, "[]", "2026-09-04T01:30:00.000Z", `0x${"ab".repeat(32)}`);
db.prepare(`INSERT INTO binance_pay_orders (id,checkout_id,status,amount,currency,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`).run("binance-success", "checkout-success", "SUCCESS", "4", "USDT", time, "2026-09-04T02:00:00.000Z");
db.prepare(`INSERT INTO binance_pay_orders (id,checkout_id,status,amount,currency,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`).run("binance-failed", "checkout-failed", "FAILED", "5", "USDT", time, "2026-09-04T03:00:00.000Z");
db.prepare(`INSERT INTO binance_pay_orders (id,checkout_id,status,amount,currency,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`).run("binance-review", "checkout-review", "AWAITING_CONFIRMATION", "7", "USDT", time, "2026-09-04T03:30:00.000Z");
db.prepare(`INSERT INTO x402_intents (id,resource_url,resource_host,request_method,status,payment_id,options_json,selected_index,settlement_tx_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run("x402-completed", "https://api.example.com/a", "api.example.com", "GET", "completed", "p1", JSON.stringify([{index:1,amount:"0.5",amountUsd:"0.50",tokenSymbol:"USDC",network:"eip155:8453"}]), 1, "0xsettlement", time, "2026-09-04T04:00:00.000Z");

test("maps failed, successful provider statuses, and approval statuses", () => {
  const events = queryActivityEvents({ limit: 100 }).events;
  assert.equal(events.length, 6);
  assert.equal(events.find((event) => event.id === events.find((item) => item.title === "1 USDT")?.id)?.statusGroup, "failed");
  assert.equal(events.find((event) => event.title === "2 USDT")?.statusGroup, "successful");
  assert.equal(events.find((event) => event.title === "2 USDT")?.statusCategory, "green");
  assert.equal(events.find((event) => event.title === "3 BNB"), undefined);
  assert.equal(events.find((event) => event.title === "6 USDT")?.statusGroup, "in-progress");
  assert.equal(events.find((event) => event.title === "4 USDT")?.statusGroup, "successful");
  assert.equal(events.find((event) => event.title === "5 USDT")?.statusCategory, "red");
  assert.equal(events.find((event) => event.title === "7 USDT"), undefined);
  const x402 = events.find((event) => event.source === "x402");
  assert.equal(x402?.title, "0.5 USDC");
  assert.match(x402?.summary || "", /GET api\.example\.com · eip155:8453/);
  assert.equal(x402?.reference, "0xse…ment");
});

test("filters by source, activity type, and search", () => {
  assert.equal(queryActivityEvents({ source: "binance-pay", limit: 100 }).pagination.total, 2);
  assert.equal(queryActivityEvents({ activityType: "x402-intent", limit: 100 }).pagination.total, 1);
  assert.equal(queryActivityEvents({ search: "api.example.com", limit: 100 }).events[0]?.source, "x402");
});

test("paginates with a bounded, deterministic sort", () => {
  const page = queryActivityEvents({ sort: "oldest", limit: 2, page: 2 });
  assert.equal(page.pagination.total, 6);
  assert.equal(page.pagination.totalPages, 3);
  assert.equal(page.events.length, 2);
  assert.equal(page.events[0]?.title, "6 USDT");
  assert.equal(page.pagination.hasPreviousPage, true);
});

test("sync is idempotent and does not duplicate source rows", () => {
  const first = syncActivityEvents();
  const second = syncActivityEvents();
  assert.equal(first.total, 6);
  assert.equal(second.inserted, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.unchanged, 6);
  assert.equal(Number((db.prepare("SELECT COUNT(*) AS count FROM activity_events").get() as { count: number }).count), 6);
});

test("updates one submitted wallet activity row to successful after confirmation", () => {
  const before = queryActivityEvents({ source: "agentic-wallet", search: "6 USDT", limit: 100 }).events;
  assert.equal(before.length, 1);
  assert.equal(before[0]?.statusGroup, "in-progress");
  db.prepare("UPDATE payment_intents SET status = 'confirmed', confirmed_at = ? WHERE id = ?").run("2026-09-04T02:00:00.000Z", "payment-submitted");
  const after = queryActivityEvents({ source: "agentic-wallet", search: "6 USDT", limit: 100 }).events;
  assert.equal(after.length, 1);
  assert.equal(after[0]?.id, before[0]?.id);
  assert.equal(after[0]?.statusGroup, "successful");
  assert.equal(after[0]?.spendState, "settled");
});
