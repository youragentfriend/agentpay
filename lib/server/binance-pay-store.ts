import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { BinancePayOrder, BinancePayReceipt } from "@/lib/binance-pay-types";

interface BinancePayRow {
  id: string; checkout_id: string; pay_order_id: string | null; status: string; payment_type: string | null;
  payee: string | null; amount: string | null; currency: string | null; paid_with: string | null;
  created_at: string; updated_at: string; completed_at: string | null;
}

let database: DatabaseSync | undefined;

function getDatabase(): DatabaseSync {
  if (database) return database;
  const filename = process.env.AGENTPAY_DB_PATH || path.join(process.cwd(), "data", "agentpay.sqlite");
  mkdirSync(path.dirname(filename), { recursive: true });
  database = new DatabaseSync(filename);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS binance_pay_orders (
      id TEXT PRIMARY KEY, checkout_id TEXT NOT NULL UNIQUE, pay_order_id TEXT UNIQUE, status TEXT NOT NULL,
      payment_type TEXT, payee TEXT, amount TEXT, currency TEXT, paid_with TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS binance_pay_orders_updated_at ON binance_pay_orders(updated_at DESC);
  `);
  return database;
}

function toReceipt(row: BinancePayRow): BinancePayReceipt {
  return {
    id: row.id,
    checkout_id: row.checkout_id,
    pay_order_id: row.pay_order_id ?? undefined,
    status: row.status as BinancePayReceipt["status"],
    payment_type: row.payment_type as BinancePayReceipt["payment_type"] ?? undefined,
    payee: row.payee ?? undefined,
    amount: row.amount ?? undefined,
    amount_sent: row.amount ?? undefined,
    currency: row.currency ?? undefined,
    paid_with: row.paid_with ? JSON.parse(row.paid_with) as BinancePayReceipt["paid_with"] : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export function saveBinancePayOrder(order: BinancePayOrder): BinancePayReceipt {
  if (!order.checkout_id) throw new Error("Binance Pay order has no checkout ID.");
  const now = new Date().toISOString();
  const existing = getDatabase().prepare("SELECT id, created_at FROM binance_pay_orders WHERE checkout_id = ?").get(order.checkout_id) as unknown as { id: string; created_at: string } | undefined;
  const completedAt = order.status === "SUCCESS" || order.status === "FAILED" ? now : null;
  getDatabase().prepare(`INSERT INTO binance_pay_orders
    (id,checkout_id,pay_order_id,status,payment_type,payee,amount,currency,paid_with,created_at,updated_at,completed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(checkout_id) DO UPDATE SET
      pay_order_id=COALESCE(excluded.pay_order_id,pay_order_id), status=excluded.status,
      payment_type=COALESCE(excluded.payment_type,payment_type), payee=COALESCE(excluded.payee,payee),
      amount=COALESCE(excluded.amount,amount), currency=COALESCE(excluded.currency,currency),
      paid_with=COALESCE(excluded.paid_with,paid_with), updated_at=excluded.updated_at,
      completed_at=COALESCE(excluded.completed_at,completed_at)`).run(
        existing?.id ?? randomUUID(), order.checkout_id, order.pay_order_id ?? null, order.status,
        order.payment_type ?? null, order.payee ?? null, String(order.amount_sent ?? order.amount ?? "") || null,
        order.currency ?? null, order.paid_with ? JSON.stringify(order.paid_with) : null,
        existing?.created_at ?? now, now, completedAt,
      );
  return getBinancePayReceipt(order.checkout_id);
}

export function getBinancePayReceipt(checkoutId: string): BinancePayReceipt {
  const row = getDatabase().prepare("SELECT * FROM binance_pay_orders WHERE checkout_id = ?").get(checkoutId) as unknown as BinancePayRow | undefined;
  if (!row) throw new Error("Binance Pay receipt was not found.");
  return toReceipt(row);
}

export function listBinancePayReceipts(): BinancePayReceipt[] {
  return (getDatabase().prepare("SELECT * FROM binance_pay_orders ORDER BY updated_at DESC LIMIT 100").all() as unknown as BinancePayRow[]).map(toReceipt);
}
