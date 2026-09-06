import { readFileSync } from "node:fs";
import path from "node:path";
import { EnvHttpProxyAgent, fetch as proxyFetch } from "undici";

export const OVERVIEW_SKILLS = [
  "agentic-wallet-operations",
  "binance-pay-orchestration",
  "binance-portfolio",
  "activity-reporting",
  "x402-payment-orchestration",
] as const;

export type OverviewSkill = (typeof OVERVIEW_SKILLS)[number];
export type OverviewAction = "payment" | "balance" | "binance-pay" | "payment-link" | "binance-balance" | "activity" | "x402";
export type OverviewAgentResult = { skill: OverviewSkill; action: OverviewAction; message: string };
export type OverviewMessage = { role: "user" | "assistant"; content: string };

const ACTIONS_BY_SKILL: Record<OverviewSkill, readonly OverviewAction[]> = {
  "agentic-wallet-operations": ["payment", "balance"],
  "binance-pay-orchestration": ["binance-pay", "payment-link"],
  "binance-portfolio": ["binance-balance"],
  "activity-reporting": ["activity"],
  "x402-payment-orchestration": ["x402"],
};
const proxyAgent = new EnvHttpProxyAgent();

function frontmatterValue(source: string, name: string): string {
  const match = source.match(new RegExp(`^${name}:\\s*["']?(.+?)["']?\\s*$`, "m"));
  return match?.[1]?.trim() ?? "";
}

export function loadOverviewSkillDescriptions(root = process.cwd()): Array<{ name: OverviewSkill; description: string }> {
  return OVERVIEW_SKILLS.map((name) => {
    const source = readFileSync(path.join(root, "skills", name, "SKILL.md"), "utf8");
    const declaredName = frontmatterValue(source, "name");
    const description = frontmatterValue(source, "description");
    if (declaredName !== name || !description) throw new Error(`AgentPay skill metadata is invalid for ${name}.`);
    return { name, description };
  });
}

export function overviewAgentStatus() {
  const provider = (process.env.AGENTPAY_LLM_PROVIDER || "gemini").trim().toLowerCase();
  const key = (process.env.AGENTPAY_LLM_API_KEY || process.env.GEMINI_API_KEY || "").trim();
  const model = (process.env.AGENTPAY_LLM_MODEL || "gemini-3.6-flash").trim();
  return { configured: provider === "gemini" && Boolean(key && model), provider: provider === "gemini" ? "gemini" as const : null, model };
}

function extractText(value: unknown): string {
  const found: string[] = [];
  function visit(item: unknown, depth: number) {
    if (depth > 8 || item === null || item === undefined) return;
    if (Array.isArray(item)) return void item.forEach((entry) => visit(entry, depth + 1));
    if (typeof item !== "object") return;
    for (const [key, entry] of Object.entries(item as Record<string, unknown>)) {
      if (["text", "output_text", "outputText", "content"].includes(key) && typeof entry === "string" && entry.trim()) found.push(entry);
      else visit(entry, depth + 1);
    }
  }
  visit(value, 0);
  return [...new Set(found)].join("\n");
}

function parseJsonText(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed);
}

export function validateOverviewAgentResult(value: unknown): OverviewAgentResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The Overview agent returned an invalid response.");
  const row = value as Record<string, unknown>;
  if (!OVERVIEW_SKILLS.includes(row.skill as OverviewSkill)) throw new Error("The Overview agent did not select an available skill.");
  const skill = row.skill as OverviewSkill;
  const action = row.action as OverviewAction;
  if (!ACTIONS_BY_SKILL[skill].includes(action)) throw new Error(`The Overview agent selected an invalid action for ${skill}.`);
  const message = typeof row.message === "string" ? row.message.trim().slice(0, 1_000) : "";
  if (!message) throw new Error("The Overview agent returned no response message.");
  return { skill, action, message };
}

function instructions(root: string): string {
  const skills = loadOverviewSkillDescriptions(root).map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");
  return [
    "You are AgentPay's Overview skill-selection agent. Select exactly one available skill from its name and description. Do not use keyword routing and do not invent skills.",
    "Available skills:", skills,
    "Allowed actions by skill:",
    "- agentic-wallet-operations: payment for sending tokens; balance for connection, receiving address, chains, on-chain balances, or wallet transactions.",
    "- binance-pay-orchestration: binance-pay for merchant QR/payment requests; payment-link for creating a receive link.",
    "- binance-portfolio: binance-balance.",
    "- activity-reporting: activity.",
    "- x402-payment-orchestration: x402.",
    "Important distinction: Agentic Wallet is an on-chain wallet. Binance Portfolio is the read-only Binance exchange account across Spot, Funding, Futures, Earn, and Margin.",
    "Return JSON only: {\"skill\":\"exact skill name\",\"action\":\"allowed action\",\"message\":\"one brief helpful sentence introducing the selected workflow\"}.",
    "Never claim a payment executed, never request credentials, and never authorize an operation. Existing deterministic AgentPay workflows perform validation, confirmation, policy, execution, and persistence.",
  ].join("\n");
}

async function providerFetch(url: string, key: string, init: RequestInit) {
  if (key.startsWith("oc-sent-v2.")) return proxyFetch(url, { ...init, dispatcher: proxyAgent } as Parameters<typeof proxyFetch>[1]);
  return fetch(url, init);
}

export async function runOverviewAgent(messages: OverviewMessage[], root = process.cwd()): Promise<OverviewAgentResult> {
  const status = overviewAgentStatus();
  if (!status.configured || !status.provider) throw new Error("The protected Gemini free-tier key is not configured for AgentPay Overview.");
  const key = (process.env.AGENTPAY_LLM_API_KEY || process.env.GEMINI_API_KEY || "").trim();
  const transcript = messages.slice(-10).map((message) => `${message.role.toUpperCase()}: ${message.content.slice(0, 2_000)}`).join("\n").slice(-10_000);
  const base = (process.env.AGENTPAY_LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await providerFetch(`${base}/interactions`, key, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ model: status.model, input: `${instructions(root)}\n\nConversation:\n${transcript}` }),
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 429) throw new Error("Gemini free-tier quota is currently unavailable. AgentPay did not fall back to another provider.");
      throw new Error(`The Gemini Overview agent is unavailable (HTTP ${response.status}).`);
    }
    const text = extractText(await response.json());
    if (!text || text.length > 10_000) throw new Error("The Overview agent returned no usable response.");
    return validateOverviewAgentResult(parseJsonText(text));
  } finally {
    clearTimeout(timer);
  }
}
