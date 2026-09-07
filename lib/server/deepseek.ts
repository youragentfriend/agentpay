import { EnvHttpProxyAgent, fetch as proxyFetch } from "undici";

const proxyAgent = new EnvHttpProxyAgent();
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";

export type DeepSeekStatus = { configured: boolean; provider: "deepseek"; model: string; liveSearch: boolean };

export function deepSeekStatus(): DeepSeekStatus {
  const key = (process.env.DEEPSEEK_API_KEY || "").trim();
  const model = (process.env.AGENTPAY_DEEPSEEK_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  return { configured: Boolean(key), provider: "deepseek", model, liveSearch: Boolean(key) };
}

async function providerFetch(url: string, key: string, init: RequestInit) {
  if (key.startsWith("oc-sent-v2.")) return proxyFetch(url, { ...init, dispatcher: proxyAgent } as Parameters<typeof proxyFetch>[1]);
  return fetch(url, init);
}

export function extractDeepSeekText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  if (typeof row.output_text === "string") return row.output_text;
  if (Array.isArray(row.output)) {
    const parts: string[] = [];
    for (const item of row.output) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      if (Array.isArray(entry.content)) for (const content of entry.content) {
        if (content && typeof content === "object" && typeof (content as Record<string, unknown>).text === "string") parts.push(String((content as Record<string, unknown>).text));
      }
    }
    if (parts.length) return parts.join("\n");
  }
  if (Array.isArray(row.choices)) {
    const first = row.choices[0];
    if (first && typeof first === "object") {
      const message = (first as Record<string, unknown>).message;
      if (message && typeof message === "object" && typeof (message as Record<string, unknown>).content === "string") return String((message as Record<string, unknown>).content);
    }
  }
  return "";
}

function parseJsonText(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed);
}

export async function callDeepSeekJson(input: string, options: { timeoutMs?: number; webSearch?: boolean; schema?: Record<string, unknown>; schemaName?: string; maxTextChars?: number } = {}): Promise<unknown> {
  const status = deepSeekStatus();
  if (!status.configured) throw new Error("The protected DeepSeek API key is not configured for AgentPay.");
  const key = (process.env.DEEPSEEK_API_KEY || "").trim();
  const base = (process.env.AGENTPAY_DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  try {
    const format = options.schema
      ? { type: "json_schema", name: options.schemaName || "agentpay_response", schema: options.schema }
      : { type: "json_object" };
    const response = await providerFetch(`${base}/responses`, key, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: status.model,
        input: `${input}\n\nReturn valid JSON only.`,
        ...(options.webSearch ? { tools: [{ type: "web_search" }] } : {}),
        text: { format },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error("DeepSeek rejected the protected AgentPay credential.");
      if (response.status === 402) throw new Error("DeepSeek API balance is insufficient. Add only the budget you intend to spend.");
      if (response.status === 429) throw new Error("DeepSeek is temporarily rate limited. AgentPay did not fall back to another provider.");
      throw new Error(`The DeepSeek API is unavailable (HTTP ${response.status}).`);
    }
    const text = extractDeepSeekText(await response.json());
    if (!text || text.length > (options.maxTextChars ?? 20_000)) throw new Error("DeepSeek returned no usable response.");
    return parseJsonText(text);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("DeepSeek did not respond before the AgentPay timeout.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
