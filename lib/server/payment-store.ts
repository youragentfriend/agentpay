import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { PreparedTransfer } from "@/lib/payment-workflow";
import { PaymentIntentError } from "@/lib/server/payment-intents";

type PaymentDraft = Omit<PreparedTransfer, "id">;

interface PaymentRow {
  id: string; status: PreparedTransfer["status"]; instruction: string | null; amount: string; asset: string;
  available_balance: string; recipient: string; token_address: string; chain_id: string; chain_name: string;
  gas_level: PreparedTransfer["gasLevel"]; created_at: string; expires_at: string; approved_at: string | null;
  submitted_at: string | null; confirmed_at: string | null; tx_hash: string | null; error_code: string | null;
  error_message: string | null; warnings: string;
}

let database: DatabaseSync | undefined;

function getDatabase(): DatabaseSync {
  if (database) return database;
  const filename = process.env.AGENTPAY_DB_PATH || path.join(process.cwd(), "data", "agentpay.sqlite");
  mkdirSync(path.dirname(filename), { recursive: true });
  database = new DatabaseSync(filename);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS payment_intents (
      id TEXT PRIMARY KEY, status TEXT NOT NULL, instruction TEXT, amount TEXT NOT NULL, asset TEXT NOT NULL,
      available_balance TEXT NOT NULL, recipient TEXT NOT NULL, token_address TEXT NOT NULL, chain_id TEXT NOT NULL,
      chain_name TEXT NOT NULL, gas_level TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      approved_at TEXT, submitted_at TEXT, confirmed_at TEXT, tx_hash TEXT UNIQUE, error_code TEXT,
      error_message TEXT, warnings TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS payment_intents_created_at ON payment_intents(created_at DESC);
  `);
  return database;
}

function toPayment(row: PaymentRow): PreparedTransfer {
  return {
    id: row.id, status: row.status, instruction: row.instruction ?? undefined, amount: row.amount, asset: row.asset,
    availableBalance: row.available_balance, recipient: row.recipient, tokenAddress: row.token_address,
    binanceChainId: row.chain_id, chainName: row.chain_name, gasLevel: row.gas_level,
    createdAt: row.created_at, expiresAt: row.expires_at, approvedAt: row.approved_at ?? undefined,
    submittedAt: row.submitted_at ?? undefined, confirmedAt: row.confirmed_at ?? undefined,
    txHash: row.tx_hash ?? undefined, errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined, warnings: JSON.parse(row.warnings) as string[],
  };
}

export function createPaymentIntent(draft: PaymentDraft): PreparedTransfer {
  const id = randomUUID();
  getDatabase().prepare(`INSERT INTO payment_intents
    (id,status,instruction,amount,asset,available_balance,recipient,token_address,chain_id,chain_name,gas_level,created_at,expires_at,warnings)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, draft.status, draft.instruction ?? null, draft.amount, draft.asset, draft.availableBalance, draft.recipient,
      draft.tokenAddress, draft.binanceChainId, draft.chainName, draft.gasLevel, draft.createdAt, draft.expiresAt,
      JSON.stringify(draft.warnings),
    );
  return getPaymentIntent(id);
}

export function getPaymentIntent(id: string): PreparedTransfer {
  const row = getDatabase().prepare("SELECT * FROM payment_intents WHERE id = ?").get(id) as unknown as PaymentRow | undefined;
  if (!row) throw new PaymentIntentError("Payment intent was not found.", "PAYMENT_INTENT_NOT_FOUND");
  return toPayment(row);
}

export function listPaymentIntents(): PreparedTransfer[] {
  return (getDatabase().prepare("SELECT * FROM payment_intents ORDER BY created_at DESC LIMIT 100").all() as unknown as PaymentRow[]).map(toPayment);
}

export function approvePaymentIntent(id: string): PreparedTransfer {
  const intent = getPaymentIntent(id);
  if (Date.parse(intent.expiresAt) <= Date.now()) throw new PaymentIntentError("Payment intent expired. Prepare it again.", "PAYMENT_INTENT_EXPIRED");
  if (intent.status !== "awaiting-approval") throw new PaymentIntentError("Only a pending intent can be approved.", "INVALID_PAYMENT_STATUS");
  getDatabase().prepare("UPDATE payment_intents SET status = 'approved', approved_at = ? WHERE id = ? AND status = 'awaiting-approval'").run(new Date().toISOString(), id);
  return getPaymentIntent(id);
}

export function markPaymentSubmitting(id: string): PreparedTransfer {
  const result = getDatabase().prepare("UPDATE payment_intents SET status = 'submitting', error_code = NULL, error_message = NULL WHERE id = ? AND status = 'approved'").run(id);
  if (Number(result.changes) !== 1) throw new PaymentIntentError("This intent is not approved or is already being processed.", "INVALID_PAYMENT_STATUS");
  return getPaymentIntent(id);
}

export function markPaymentSubmitted(id: string, txHash: string): PreparedTransfer {
  getDatabase().prepare("UPDATE payment_intents SET status = 'submitted', submitted_at = ?, tx_hash = ? WHERE id = ? AND status = 'submitting'").run(new Date().toISOString(), txHash, id);
  return getPaymentIntent(id);
}

export function markPaymentConfirmed(id: string): PreparedTransfer {
  getDatabase().prepare("UPDATE payment_intents SET status = 'confirmed', confirmed_at = ? WHERE id = ? AND status IN ('submitted','submitting')").run(new Date().toISOString(), id);
  return getPaymentIntent(id);
}

export function markPaymentFailed(id: string, code: string, message: string): PreparedTransfer {
  getDatabase().prepare("UPDATE payment_intents SET status = 'failed', error_code = ?, error_message = ? WHERE id = ?").run(code, message, id);
  return getPaymentIntent(id);
}

export function walletSendEnabled(): boolean {
  return process.env.AGENTPAY_ENABLE_WALLET_SEND === "true";
}
