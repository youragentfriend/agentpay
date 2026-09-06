import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { OverviewMessage, OverviewSkill } from "@/lib/server/overview-agent";

export const SKILL_OPERATIONS = {
  "agentic-wallet-operations": ["wallet-overview", "wallet-transfer"],
  "binance-pay-orchestration": ["binance-pay-inspect", "binance-pay-receive"],
  "binance-portfolio": ["binance-portfolio"],
  "activity-reporting": ["activity-report"],
  "x402-payment-orchestration": ["x402-service"],
} as const satisfies Record<OverviewSkill, readonly string[]>;

export type SkillOperation = (typeof SKILL_OPERATIONS)[OverviewSkill][number];
export type OverviewUiAction = "payment" | "balance" | "binance-pay" | "payment-link" | "binance-balance" | "activity" | "x402";
export type WorkflowDescriptor = {
  type: "deterministic-workflow";
  operation: SkillOperation;
  action: OverviewUiAction;
  method: "GET" | "POST";
  path: string;
  input: Record<string, string>;
};
export type SkillExecution = {
  operation: SkillOperation;
  message: string;
  parameters: Record<string, string>;
  missingFields: string[];
};
export type OverviewConversation = {
  id: string;
  selectedSkill?: OverviewSkill;
  messages: OverviewMessage[];
  createdAt: string;
  updatedAt: string;
};

type Row = { id: string; selected_skill: string | null; messages_json: string; created_at: string; updated_at: string };
let database: DatabaseSync | undefined;
let databaseFile = "";
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 2_000;

function db(): DatabaseSync {
  const file = process.env.AGENTPAY_DB_PATH || path.join(process.cwd(), "data", "agentpay.sqlite");
  if (database && databaseFile === file) return database;
  database?.close();
  mkdirSync(path.dirname(file), { recursive: true });
  database = new DatabaseSync(file);
  databaseFile = file;
  database.exec(`CREATE TABLE IF NOT EXISTS overview_skill_sessions (
    id TEXT PRIMARY KEY,
    selected_skill TEXT,
    messages_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  return database;
}

function toConversation(row: Row): OverviewConversation {
  const messages = JSON.parse(row.messages_json) as OverviewMessage[];
  return {
    id: row.id,
    selectedSkill: row.selected_skill as OverviewSkill | undefined,
    messages: messages.slice(-MAX_MESSAGES),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createOverviewConversation(): OverviewConversation {
  const id = randomUUID();
  const now = new Date().toISOString();
  db().prepare("INSERT INTO overview_skill_sessions VALUES (?,?,?,?,?)").run(id, null, "[]", now, now);
  return getOverviewConversation(id);
}

export function getOverviewConversation(id: string): OverviewConversation {
  const row = db().prepare("SELECT * FROM overview_skill_sessions WHERE id = ?").get(id) as unknown as Row | undefined;
  if (!row) throw new Error("Overview conversation was not found. Start a new conversation.");
  return toConversation(row);
}

export function updateOverviewConversation(id: string, values: { selectedSkill?: OverviewSkill; messages?: OverviewMessage[] }): OverviewConversation {
  const current = getOverviewConversation(id);
  const messages = (values.messages ?? current.messages)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({ role: message.role, content: message.content.trim().slice(0, MAX_MESSAGE_CHARS) }))
    .filter((message) => message.content)
    .slice(-MAX_MESSAGES);
  const now = new Date().toISOString();
  db().prepare("UPDATE overview_skill_sessions SET selected_skill = ?, messages_json = ?, updated_at = ? WHERE id = ?")
    .run(values.selectedSkill ?? current.selectedSkill ?? null, JSON.stringify(messages), now, id);
  return getOverviewConversation(id);
}

export function appendOverviewMessages(id: string, messages: OverviewMessage[], selectedSkill?: OverviewSkill): OverviewConversation {
  const current = getOverviewConversation(id);
  return updateOverviewConversation(id, { selectedSkill, messages: [...current.messages, ...messages] });
}

function exactObject(value: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const row = value as Record<string, unknown>;
  const extra = Object.keys(row).filter((key) => !allowed.includes(key));
  if (extra.length) throw new Error(`${label} contains unsupported fields.`);
  return row;
}

function boundedString(value: unknown, name: string, max = 1_000): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`The skill runtime returned an invalid ${name}.`);
  if (value.trim().length > max) throw new Error(`The skill runtime returned an oversized ${name}.`);
  return value.trim();
}

const PARAMETER_FIELDS: Record<SkillOperation, readonly string[]> = {
  "wallet-overview": ["asset", "network"],
  "wallet-transfer": ["asset", "amount", "recipient", "network", "gasPriority"],
  "binance-pay-inspect": ["rawQr"],
  "binance-pay-receive": ["currency", "amount", "note"],
  "binance-portfolio": ["source", "asset"],
  "activity-report": ["source", "statusGroup", "activityType", "asset", "from", "to", "search", "sort", "page", "limit"],
  "x402-service": ["url", "method", "request"],
};

export function validateSkillExecution(skill: OverviewSkill, value: unknown): SkillExecution {
  const row = exactObject(value, ["operation", "message", "parameters", "missingFields"], "Skill execution");
  if (typeof row.operation !== "string" || !SKILL_OPERATIONS[skill].includes(row.operation as never)) {
    throw new Error(`The skill runtime selected an invalid operation for ${skill}.`);
  }
  const operation = row.operation as SkillOperation;
  const rawParameters = exactObject(row.parameters ?? {}, PARAMETER_FIELDS[operation], "Skill parameters");
  const parameters: Record<string, string> = {};
  for (const [name, value] of Object.entries(rawParameters)) {
    if (typeof value !== "string" || value.trim().length > 2_000) throw new Error(`The skill runtime returned an invalid ${name}.`);
    if (value.trim()) parameters[name] = value.trim();
  }
  if (!Array.isArray(row.missingFields) || row.missingFields.length > 8) throw new Error("The skill runtime returned invalid missing fields.");
  const missingFields = row.missingFields.map((field) => boundedString(field, "missing field", 50));
  if (missingFields.some((field) => !PARAMETER_FIELDS[operation].includes(field))) throw new Error("The skill runtime requested an unsupported field.");
  const required: Partial<Record<SkillOperation, string[]>> = {
    "wallet-transfer": ["asset", "amount", "recipient", "network"],
    "binance-pay-inspect": ["rawQr"],
    "binance-pay-receive": ["currency"],
  };
  for (const field of required[operation] ?? []) if (!parameters[field]) missingFields.push(field);
  if (operation === "x402-service" && !parameters.url && !parameters.request) missingFields.push("request");
  return { operation, message: boundedString(row.message, "message"), parameters, missingFields: [...new Set(missingFields)] };
}

const WORKFLOWS: Record<SkillOperation, Omit<WorkflowDescriptor, "input">> = {
  "wallet-overview": { type: "deterministic-workflow", operation: "wallet-overview", action: "balance", method: "GET", path: "/api/wallet/overview" },
  "wallet-transfer": { type: "deterministic-workflow", operation: "wallet-transfer", action: "payment", method: "POST", path: "/api/payments/prepare" },
  "binance-pay-inspect": { type: "deterministic-workflow", operation: "binance-pay-inspect", action: "binance-pay", method: "POST", path: "/api/binance-pay/prepare" },
  "binance-pay-receive": { type: "deterministic-workflow", operation: "binance-pay-receive", action: "payment-link", method: "POST", path: "/api/binance-pay/receive" },
  "binance-portfolio": { type: "deterministic-workflow", operation: "binance-portfolio", action: "binance-balance", method: "GET", path: "/api/binance-account/portfolio" },
  "activity-report": { type: "deterministic-workflow", operation: "activity-report", action: "activity", method: "GET", path: "/api/payments/activity" },
  "x402-service": { type: "deterministic-workflow", operation: "x402-service", action: "x402", method: "POST", path: "/api/x402/chat" },
};

export function workflowForExecution(execution: SkillExecution): WorkflowDescriptor | undefined {
  if (execution.missingFields.length) return undefined;
  const workflow = WORKFLOWS[execution.operation];
  return { ...workflow, input: { ...execution.parameters } };
}

function safeReference(skill: OverviewSkill, reference: string, root: string): string {
  if (!/^references\/[a-z0-9][a-z0-9-]*\.md$/.test(reference)) throw new Error(`Unsafe reference path in ${skill}.`);
  const skillRoot = path.resolve(root, "skills", skill);
  const filename = path.resolve(skillRoot, reference);
  if (!filename.startsWith(`${skillRoot}${path.sep}`) || !existsSync(filename)) throw new Error(`Missing reference ${reference} in ${skill}.`);
  return readFileSync(filename, "utf8");
}

export function relevantSkillReferences(skill: OverviewSkill, message: string): string[] {
  const text = message.toLowerCase();
  if (skill === "agentic-wallet-operations") {
    if (/\b(connect|sign[ -]?in|pair|verify|authentication)\b/.test(text)) return ["references/authentication.md"];
    if (/\b(send|transfer|recipient|approve|execute|track|transaction hash|gas)\b/.test(text)) return ["references/send-and-receive.md", "references/security-and-persistence.md"];
    return ["references/wallet-view.md"];
  }
  if (skill === "x402-payment-orchestration") {
    if (/\b(pay|buy|purchase|endpoint|https:\/\/|sign|replay|settlement)\b/.test(text)) {
      return ["references/binance-x402-payment.md", "references/security-contract.md", "references/result-validation.md", "references/wallet-capabilities.md"];
    }
    return ["references/security-contract.md"];
  }
  return [];
}

export function loadSkillRuntimeContext(skill: OverviewSkill, message: string, root = process.cwd()): { skill: string; references: Array<{ path: string; content: string }> } {
  const skillPath = path.join(root, "skills", skill, "SKILL.md");
  const source = readFileSync(skillPath, "utf8");
  if (!source.includes(`name: "${skill}"`) && !source.includes(`name: ${skill}`)) throw new Error(`AgentPay skill metadata is invalid for ${skill}.`);
  return {
    skill: source,
    references: relevantSkillReferences(skill, message).map((reference) => ({ path: reference, content: safeReference(skill, reference, root) })),
  };
}

export function isAmbiguousBalanceRequest(message: string): boolean {
  return /\b(usdt|usdc|token|crypto)\b/i.test(message)
    && /\b(balance|holdings?|how much|available)\b/i.test(message)
    && !/\b(on[- ]?chain|agentic wallet|wallet address|binance (account|exchange|spot|funding|futures|earn|margin)|spot|funding|futures|earn|margin)\b/i.test(message);
}

export function resetOverviewSkillRuntimeForTests() {
  database?.close();
  database = undefined;
  databaseFile = "";
}
