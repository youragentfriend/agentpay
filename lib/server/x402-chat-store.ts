import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { X402ChatMessage, X402ChatSession } from "@/lib/x402-types";

type Row = Record<string, unknown>;
let database: DatabaseSync | undefined;
let databaseFile = "";
function db(): DatabaseSync {
  const file = process.env.AGENTPAY_DB_PATH || path.join(process.cwd(), "data", "agentpay.sqlite");
  if (database && databaseFile === file) return database;
  database?.close(); mkdirSync(path.dirname(file), { recursive: true });
  database = new DatabaseSync(file); databaseFile = file;
  database.exec("CREATE TABLE IF NOT EXISTS x402_chat_sessions (id TEXT PRIMARY KEY,status TEXT NOT NULL,messages_json TEXT NOT NULL,intent_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)");
  return database;
}
function map(row: Row): X402ChatSession {
  return { id: String(row.id), status: String(row.status) as X402ChatSession["status"], messages: JSON.parse(String(row.messages_json)) as X402ChatMessage[], intentId: row.intent_id ? String(row.intent_id) : undefined, updatedAt: String(row.updated_at) };
}
export function createX402Chat(): X402ChatSession {
  const now = new Date().toISOString(), id = randomUUID();
  db().prepare("INSERT INTO x402_chat_sessions VALUES(?,?,?,?,?,?)").run(id, "active", "[]", null, now, now);
  return getX402Chat(id);
}
export function getX402Chat(id: string): X402ChatSession {
  const row = db().prepare("SELECT * FROM x402_chat_sessions WHERE id=?").get(id) as Row | undefined;
  if (!row) throw new Error("x402 chat session not found.");
  return map(row);
}
export function updateX402Chat(id: string, values: { status?: X402ChatSession["status"]; message?: Omit<X402ChatMessage, "id" | "createdAt">; intentId?: string }): X402ChatSession {
  const current = getX402Chat(id), now = new Date().toISOString();
  const messages = values.message ? [...current.messages, { ...values.message, id: randomUUID(), createdAt: now }] : current.messages;
  db().prepare("UPDATE x402_chat_sessions SET status=?,messages_json=?,intent_id=?,updated_at=? WHERE id=?").run(values.status ?? current.status, JSON.stringify(messages), values.intentId ?? current.intentId ?? null, now, id);
  return getX402Chat(id);
}
export function resetX402ChatStoreForTests() { database?.close(); database = undefined; databaseFile = ""; }
