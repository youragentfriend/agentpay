import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const ACTIVITY_SOURCES = ["agentic-wallet", "binance-pay", "x402"] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];
export const ACTIVITY_TYPES = ["transfer", "binance-pay", "x402"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export type ActivityStatusGroup = "awaiting-approval" | "in-progress" | "successful" | "failed";
export type ActivityStatusCategory = "yellow" | "blue" | "green" | "red";

export interface ActivityEvent {
  id: string;
  source: ActivitySource;
  activityType: ActivityType;
  status: string;
  statusGroup: ActivityStatusGroup;
  statusCategory: ActivityStatusCategory;
  amount?: string;
  asset?: string;
  title: string;
  summary: string;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  /** A deliberately shortened provider reference, when one is useful to a user. */
  reference?: string;
}

export interface ActivityQuery {
  statusGroup?: string;
  status?: string;
  source?: string;
  activityType?: string;
  type?: string;
  search?: string;
  asset?: string;
  from?: string;
  to?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  limit?: number;
  page?: number;
}

export interface ActivityPage {
  events: ActivityEvent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

interface ActivityRow {
  id: string;
  source: ActivitySource;
  source_id: string;
  activity_type: ActivityType;
  raw_status: string;
  status_group: ActivityStatusGroup;
  status_category: ActivityStatusCategory;
  amount: string | null;
  asset: string | null;
  title: string;
  summary: string;
  safe_reference: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  search_text: string;
}

interface Projection {
  id: string;
  source: ActivitySource;
  sourceId: string;
  activityType: ActivityType;
  status: string;
  statusGroup: ActivityStatusGroup;
  statusCategory: ActivityStatusCategory;
  amount?: string;
  asset?: string;
  title: string;
  summary: string;
  reference?: string;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  searchText: string;
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
    CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      raw_status TEXT NOT NULL,
      status_group TEXT NOT NULL,
      status_category TEXT NOT NULL,
      amount TEXT,
      asset TEXT,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      safe_reference TEXT,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      search_text TEXT NOT NULL,
      UNIQUE(source, source_id)
    );
    CREATE INDEX IF NOT EXISTS activity_events_occurred_at ON activity_events(occurred_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS activity_events_status_group ON activity_events(status_group);
    CREATE INDEX IF NOT EXISTS activity_events_source ON activity_events(source);
    CREATE INDEX IF NOT EXISTS activity_events_activity_type ON activity_events(activity_type);
    CREATE INDEX IF NOT EXISTS activity_events_asset ON activity_events(asset);
  `);
  return database;
}

function tableExists(name: string): boolean {
  return Boolean(getDatabase().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function maskReference(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  if (value.length <= 8) return `•••${value.slice(-4)}`;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function statusMapping(status: string): { group: ActivityStatusGroup; category: ActivityStatusCategory } {
  const normalized = status.trim().toLowerCase().replaceAll("_", "-");
  if (["failed", "failure", "error", "expired", "rejected", "cancelled", "canceled"].includes(normalized)) {
    return { group: "failed", category: "red" };
  }
  if (["success", "succeeded", "successful", "completed", "confirmed"].includes(normalized)) {
    return { group: "successful", category: "green" };
  }
  if (["awaiting-approval", "awaiting-confirmation", "awaiting-amount", "amount-set", "amount-locked"].includes(normalized)) {
    return { group: "awaiting-approval", category: "yellow" };
  }
  return { group: "in-progress", category: "blue" };
}

/** Public for clients that need to apply the same grouping to provider statuses. */
export function mapActivityStatus(status: string): { statusGroup: ActivityStatusGroup; statusCategory: ActivityStatusCategory } {
  const mapped = statusMapping(status);
  return { statusGroup: mapped.group, statusCategory: mapped.category };
}

function projectionId(source: ActivitySource, sourceId: string): string {
  return createHash("sha256").update(`${source}:${sourceId}`).digest("hex").slice(0, 32);
}

function makeProjection(values: Omit<Projection, "id">): Projection {
  return { ...values, id: projectionId(values.source, values.sourceId) };
}

function stringValue(value: unknown): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function paymentProjection(row: Record<string, unknown>): Projection {
  const status = stringValue(row.status) || "unknown";
  const amount = stringValue(row.amount);
  const asset = stringValue(row.asset);
  const createdAt = stringValue(row.created_at) || new Date(0).toISOString();
  const updatedAt = stringValue(row.confirmed_at) || stringValue(row.submitted_at) || stringValue(row.approved_at) || createdAt;
  const mapped = statusMapping(status);
  const title = [amount, asset].filter(Boolean).join(" ") || "Wallet transfer";
  const summary = `${stringValue(row.chain_name) || "Wallet"} transfer`;
  const reference = maskReference(row.tx_hash);
  return makeProjection({ source: "agentic-wallet", sourceId: String(row.id), activityType: "transfer", status, statusGroup: mapped.group, statusCategory: mapped.category, amount, asset, title, summary, reference, occurredAt: updatedAt, createdAt, updatedAt, searchText: [title, summary, status, asset, stringValue(row.chain_name)].filter(Boolean).join(" ") });
}

function binanceProjection(row: Record<string, unknown>): Projection {
  const status = stringValue(row.status) || "unknown";
  const amount = stringValue(row.amount);
  const asset = stringValue(row.currency);
  const createdAt = stringValue(row.created_at) || new Date(0).toISOString();
  const updatedAt = stringValue(row.updated_at) || createdAt;
  const mapped = statusMapping(status);
  const title = [amount, asset].filter(Boolean).join(" ") || "Binance Pay order";
  const summary = "Binance Pay order";
  const reference = maskReference(row.pay_order_id || row.checkout_id);
  return makeProjection({ source: "binance-pay", sourceId: String(row.id), activityType: "binance-pay", status, statusGroup: mapped.group, statusCategory: mapped.category, amount, asset, title, summary, reference, occurredAt: updatedAt, createdAt, updatedAt, searchText: [title, summary, status, asset].filter(Boolean).join(" ") });
}

function x402Projection(row: Record<string, unknown>): Projection {
  const status = stringValue(row.status) || "unknown";
  const createdAt = stringValue(row.created_at) || new Date(0).toISOString();
  const updatedAt = stringValue(row.updated_at) || createdAt;
  const mapped = statusMapping(status);
  const host = stringValue(row.resource_host) || "x402 resource";
  return makeProjection({ source: "x402", sourceId: String(row.id), activityType: "x402", status, statusGroup: mapped.group, statusCategory: mapped.category, title: `x402 · ${host}`, summary: "x402 payment", occurredAt: updatedAt, createdAt, updatedAt, searchText: [host, status, "x402"].join(" ") });
}

function sourceProjections(): Projection[] {
  const result: Projection[] = [];
  if (tableExists("payment_intents")) {
    for (const row of getDatabase().prepare("SELECT * FROM payment_intents").all() as unknown as Record<string, unknown>[]) result.push(paymentProjection(row));
  }
  if (tableExists("binance_pay_orders")) {
    for (const row of getDatabase().prepare("SELECT * FROM binance_pay_orders").all() as unknown as Record<string, unknown>[]) result.push(binanceProjection(row));
  }
  if (tableExists("x402_intents")) {
    for (const row of getDatabase().prepare("SELECT * FROM x402_intents").all() as unknown as Record<string, unknown>[]) result.push(x402Projection(row));
  }
  return result;
}

/** Upsert the projection. Re-running this is safe and does not duplicate events. */
export function syncActivityEvents(): { inserted: number; updated: number; unchanged: number; total: number } {
  const db = getDatabase();
  const projections = sourceProjections();
  const existing = new Map<string, ActivityRow>();
  for (const row of db.prepare("SELECT * FROM activity_events").all() as unknown as ActivityRow[]) existing.set(`${row.source}:${row.source_id}`, row);
  const upsert = db.prepare(`INSERT INTO activity_events
    (id,source,source_id,activity_type,raw_status,status_group,status_category,amount,asset,title,summary,safe_reference,occurred_at,created_at,updated_at,search_text)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(source,source_id) DO UPDATE SET
      id=excluded.id, activity_type=excluded.activity_type, raw_status=excluded.raw_status,
      status_group=excluded.status_group, status_category=excluded.status_category, amount=excluded.amount,
      asset=excluded.asset, title=excluded.title, summary=excluded.summary, safe_reference=excluded.safe_reference,
      occurred_at=excluded.occurred_at, created_at=excluded.created_at, updated_at=excluded.updated_at,
      search_text=excluded.search_text`);
  let inserted = 0; let updated = 0; let unchanged = 0;
  for (const event of projections) {
    const previous = existing.get(`${event.source}:${event.sourceId}`);
    const next = [event.id, event.source, event.sourceId, event.activityType, event.status, event.statusGroup, event.statusCategory, event.amount ?? null, event.asset ?? null, event.title, event.summary, event.reference ?? null, event.occurredAt, event.createdAt, event.updatedAt, event.searchText];
    if (!previous) inserted += 1;
    else if ([previous.id, previous.source, previous.source_id, previous.activity_type, previous.raw_status, previous.status_group, previous.status_category, previous.amount, previous.asset, previous.title, previous.summary, previous.safe_reference, previous.occurred_at, previous.created_at, previous.updated_at, previous.search_text].every((value, index) => value === next[index])) unchanged += 1;
    else updated += 1;
    upsert.run(...next);
  }
  return { inserted, updated, unchanged, total: projections.length };
}

function toEvent(row: ActivityRow): ActivityEvent {
  return { id: row.id, source: row.source, activityType: row.activity_type, status: row.raw_status, statusGroup: row.status_group, statusCategory: row.status_category, amount: row.amount ?? undefined, asset: row.asset ?? undefined, title: row.title, summary: row.summary, occurredAt: row.occurred_at, createdAt: row.created_at, updatedAt: row.updated_at, reference: row.safe_reference ?? undefined };
}

const sourceAliases: Record<string, ActivitySource> = { "agentic-wallet": "agentic-wallet", "agentic_wallet": "agentic-wallet", wallet: "agentic-wallet", payment: "agentic-wallet", "payment-intent": "agentic-wallet", "payment-intents": "agentic-wallet", payment_intents: "agentic-wallet", "binance-pay": "binance-pay", binance: "binance-pay", "binance_pay": "binance-pay", binance_pay_orders: "binance-pay", x402: "x402", x402_intents: "x402" };
const typeAliases: Record<string, ActivityType> = { transfer: "transfer", payment: "transfer", "payment-intent": "transfer", "payment_intent": "transfer", "binance-pay": "binance-pay", "binance-pay-order": "binance-pay", "binance_pay_order": "binance-pay", x402: "x402", "x402-intent": "x402", "x402_intent": "x402" };

function oneOf<T extends string>(value: string, aliases: Record<string, T>, label: string): T {
  const normalized = value.trim().toLowerCase();
  const result = aliases[normalized];
  if (!result) throw new ActivityQueryError(`Invalid activity ${label}.`);
  return result;
}

function statusGroup(value: string): ActivityStatusGroup {
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  if (["awaiting-approval", "awaiting-approvals", "pending", "awaiting-confirmation", "awaiting-amount"].includes(normalized)) return "awaiting-approval";
  if (["successful", "success", "succeeded", "completed", "confirmed", "green"].includes(normalized)) return "successful";
  if (["failed", "failure", "error", "expired", "red"].includes(normalized)) return "failed";
  if (["in-progress", "processing", "pending-processing", "blue"].includes(normalized)) return "in-progress";
  throw new ActivityQueryError("Invalid activity status group.");
}

function boundedText(value: string, name: string): string {
  const text = value.trim();
  if (!text || text.length > 100) throw new ActivityQueryError(`Invalid activity ${name}.`);
  return text;
}

function dateValue(value: string, name: string, endOfDay = false): string {
  const text = boundedText(value, name);
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) throw new ActivityQueryError(`Invalid activity ${name}.`);
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T23:59:59.999Z`;
  return new Date(parsed).toISOString();
}

export class ActivityQueryError extends Error {
  constructor(message: string) { super(message); this.name = "ActivityQueryError"; }
}

export function normalizeActivityQuery(input: ActivityQuery = {}): Required<Pick<ActivityQuery, "limit" | "page" | "sort">> & Omit<ActivityQuery, "limit" | "page" | "sort"> & { statusGroup?: ActivityStatusGroup; source?: ActivitySource; activityType?: ActivityType; sort: "newest" | "oldest" } {
  const limit = input.limit === undefined ? 25 : Number(input.limit);
  const page = input.page === undefined ? 1 : Number(input.page);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ActivityQueryError("Activity limit must be an integer from 1 to 100.");
  if (!Number.isInteger(page) || page < 1 || page > 10_000) throw new ActivityQueryError("Activity page must be an integer from 1 to 10000.");
  const sortValue = (input.sort || "newest").trim().toLowerCase();
  if (!["newest", "oldest", "asc", "desc", "date-asc", "date-desc", "updated-asc", "updated-desc"].includes(sortValue)) throw new ActivityQueryError("Activity sort must be newest or oldest.");
  const sort = ["oldest", "asc", "date-asc", "updated-asc"].includes(sortValue) ? "oldest" : "newest";
  const rawStatusGroup = input.statusGroup ?? input.status;
  const rawActivityType = input.activityType ?? input.type;
  const rawFrom = input.from ?? input.dateFrom;
  const rawTo = input.to ?? input.dateTo;
  return { ...input, statusGroup: rawStatusGroup ? statusGroup(rawStatusGroup) : undefined, source: input.source ? oneOf(input.source, sourceAliases, "source") : undefined, activityType: rawActivityType ? oneOf(rawActivityType, typeAliases, "type") : undefined, search: input.search === undefined ? undefined : boundedText(input.search, "search"), asset: input.asset === undefined ? undefined : boundedText(input.asset, "asset").toUpperCase(), from: rawFrom === undefined ? undefined : dateValue(rawFrom, "from"), to: rawTo === undefined ? undefined : dateValue(rawTo, "to", true), limit, page, sort } as ReturnType<typeof normalizeActivityQuery>;
}

export function queryActivityEvents(input: ActivityQuery = {}): ActivityPage {
  const query = normalizeActivityQuery(input);
  syncActivityEvents();
  const db = getDatabase();
  const clauses: string[] = []; const args: Array<string | number> = [];
  if (query.statusGroup) { clauses.push("status_group = ?"); args.push(query.statusGroup); }
  if (query.source) { clauses.push("source = ?"); args.push(query.source); }
  if (query.activityType) { clauses.push("activity_type = ?"); args.push(query.activityType); }
  if (query.search) { clauses.push("search_text LIKE ? COLLATE NOCASE"); args.push(`%${query.search}%`); }
  if (query.asset) { clauses.push("UPPER(asset) = ?"); args.push(query.asset); }
  if (query.from) { clauses.push("occurred_at >= ?"); args.push(query.from); }
  if (query.to) { clauses.push("occurred_at <= ?"); args.push(query.to); }
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM activity_events${where}`).get(...args) as unknown as { count: number }).count);
  const offset = (query.page - 1) * query.limit;
  const order = query.sort === "oldest" ? "ASC" : "DESC";
  const rows = db.prepare(`SELECT * FROM activity_events${where} ORDER BY occurred_at ${order}, id ${order} LIMIT ? OFFSET ?`).all(...args, query.limit, offset) as unknown as ActivityRow[];
  const totalPages = total ? Math.ceil(total / query.limit) : 0;
  return { events: rows.map(toEvent), pagination: { page: query.page, limit: query.limit, total, totalPages, hasNextPage: query.page < totalPages, hasPreviousPage: query.page > 1 && totalPages > 0 } };
}

export const listActivityEvents = queryActivityEvents;
export const getActivityEvents = queryActivityEvents;
export const backfillActivityEvents = syncActivityEvents;
