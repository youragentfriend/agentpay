import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { OnchainPayCatalog, OnchainPayOrder, OnchainPayOrderStatus } from "@/lib/onchain-pay-types";

interface Row {
  id: string; external_order_id: string; fingerprint: string; status: OnchainPayOrderStatus; provider_status: number | null;
  asset: string; network: string; address: string; memo: string | null; amount: string; withdraw_fee: string;
  net_receive: number; expected_receive: string; catalog_source: OnchainPayCatalog["source"]; order_link: string | null;
  link_expire_time: string | null; tx_hash: string | null; provider_order_detail_link: string | null; amount_usd: string | null;
  error_message: string | null; created_at: string; updated_at: string; completed_at: string | null;
}

let database: DatabaseSync | undefined;
let databaseFile = "";
function db(): DatabaseSync {
  const filename = process.env.AGENTPAY_DB_PATH || path.join(process.cwd(), "data", "agentpay.sqlite");
  if (database && databaseFile === filename) return database;
  database?.close();
  mkdirSync(path.dirname(filename), { recursive: true });
  database = new DatabaseSync(filename); databaseFile = filename;
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS onchain_pay_orders (
      id TEXT PRIMARY KEY, external_order_id TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
      status TEXT NOT NULL, provider_status INTEGER, asset TEXT NOT NULL, network TEXT NOT NULL,
      address TEXT NOT NULL, memo TEXT, amount TEXT NOT NULL, withdraw_fee TEXT NOT NULL,
      net_receive INTEGER NOT NULL DEFAULT 0, expected_receive TEXT NOT NULL, catalog_source TEXT NOT NULL,
      order_link TEXT, link_expire_time TEXT, tx_hash TEXT, provider_order_detail_link TEXT, amount_usd TEXT,
      error_message TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS onchain_pay_orders_updated_at ON onchain_pay_orders(updated_at DESC);
    CREATE INDEX IF NOT EXISTS onchain_pay_orders_fingerprint ON onchain_pay_orders(fingerprint, updated_at DESC);
  `);
  return database;
}

function map(row: Row): OnchainPayOrder {
  return {
    id: row.id, externalOrderId: row.external_order_id, fingerprint: row.fingerprint, status: row.status,
    providerStatus: row.provider_status ?? undefined, asset: row.asset, network: row.network, address: row.address,
    memo: row.memo ?? undefined, amount: row.amount, withdrawFee: row.withdraw_fee, netReceive: row.net_receive === 1,
    expectedReceive: row.expected_receive, catalogSource: row.catalog_source, orderLink: row.order_link ?? undefined,
    linkExpireTime: row.link_expire_time ?? undefined, txHash: row.tx_hash ?? undefined,
    providerOrderDetailLink: row.provider_order_detail_link ?? undefined, amountUsd: row.amount_usd ?? undefined,
    errorMessage: row.error_message ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export function createOnchainPayOrder(values: Omit<OnchainPayOrder, "id" | "createdAt" | "updatedAt">): OnchainPayOrder {
  const now = new Date().toISOString();
  db().prepare(`INSERT INTO onchain_pay_orders
    (id,external_order_id,fingerprint,status,provider_status,asset,network,address,memo,amount,withdraw_fee,net_receive,expected_receive,catalog_source,order_link,link_expire_time,tx_hash,provider_order_detail_link,amount_usd,error_message,created_at,updated_at,completed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      randomUUID(), values.externalOrderId, values.fingerprint, values.status, values.providerStatus ?? null,
      values.asset, values.network, values.address, values.memo ?? null, values.amount, values.withdrawFee,
      values.netReceive ? 1 : 0, values.expectedReceive, values.catalogSource, values.orderLink ?? null,
      values.linkExpireTime ?? null, values.txHash ?? null, values.providerOrderDetailLink ?? null,
      values.amountUsd ?? null, values.errorMessage ?? null, now, now, values.completedAt ?? null,
    );
  return getOnchainPayOrderByExternalId(values.externalOrderId);
}

export function getOnchainPayOrder(id: string): OnchainPayOrder {
  const row = db().prepare("SELECT * FROM onchain_pay_orders WHERE id = ?").get(id) as unknown as Row | undefined;
  if (!row) throw new Error("Onchain Pay order was not found.");
  return map(row);
}

export function getOnchainPayOrderByExternalId(externalOrderId: string): OnchainPayOrder {
  const row = db().prepare("SELECT * FROM onchain_pay_orders WHERE external_order_id = ?").get(externalOrderId) as unknown as Row | undefined;
  if (!row) throw new Error("Onchain Pay order was not found.");
  return map(row);
}

export function findRecentActiveOnchainPayOrder(fingerprint: string, since: string): OnchainPayOrder | undefined {
  const row = db().prepare(`SELECT * FROM onchain_pay_orders WHERE fingerprint = ? AND updated_at >= ?
    AND status NOT IN ('completed','failed','abandoned','expired') ORDER BY updated_at DESC LIMIT 1`).get(fingerprint, since) as unknown as Row | undefined;
  return row ? map(row) : undefined;
}

export function updateOnchainPayOrder(id: string, patch: Partial<Omit<OnchainPayOrder, "id" | "externalOrderId" | "fingerprint" | "createdAt">>): OnchainPayOrder {
  const current = getOnchainPayOrder(id); const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  db().prepare(`UPDATE onchain_pay_orders SET status=?,provider_status=?,asset=?,network=?,address=?,memo=?,amount=?,withdraw_fee=?,net_receive=?,expected_receive=?,catalog_source=?,order_link=?,link_expire_time=?,tx_hash=?,provider_order_detail_link=?,amount_usd=?,error_message=?,updated_at=?,completed_at=? WHERE id=?`).run(
    next.status, next.providerStatus ?? null, next.asset, next.network, next.address, next.memo ?? null, next.amount,
    next.withdrawFee, next.netReceive ? 1 : 0, next.expectedReceive, next.catalogSource, next.orderLink ?? null,
    next.linkExpireTime ?? null, next.txHash ?? null, next.providerOrderDetailLink ?? null, next.amountUsd ?? null,
    next.errorMessage ?? null, next.updatedAt, next.completedAt ?? null, id,
  );
  return getOnchainPayOrder(id);
}

export function listOnchainPayOrders(): OnchainPayOrder[] {
  return (db().prepare("SELECT * FROM onchain_pay_orders ORDER BY updated_at DESC LIMIT 100").all() as unknown as Row[]).map(map);
}

export function resetOnchainPayStoreForTests(): void {
  database?.close(); database = undefined; databaseFile = "";
}
