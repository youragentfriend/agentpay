import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_OPENCLAW_BIN = "/home/ubuntu/.npm-global/bin/openclaw";
const DEFAULT_AGENT = "agentpay-bridge";
const DEFAULT_MODEL = "deepseek-v4-flash";
const MAX_BRIDGE_OUTPUT_BYTES = 512_000;

export type DeepSeekStatus = { configured: boolean; provider: "deepseek"; model: string; liveSearch: false; bridge: "openclaw" };
type BridgeResult = { stdout: string; stderr: string };
type BridgeRunner = (input: string, timeoutMs: number) => Promise<BridgeResult>;
type DeepSeekOptions = {
  timeoutMs?: number;
  webSearch?: boolean;
  schema?: Record<string, unknown>;
  schemaName?: string;
  maxTextChars?: number;
  runner?: BridgeRunner;
};
let testRunner: BridgeRunner | undefined;

/** Test seam; production callers leave this unset and always use the OpenClaw CLI bridge. */
export function setDeepSeekBridgeRunnerForTests(runner?: BridgeRunner) { testRunner = runner; }

export function deepSeekStatus(): DeepSeekStatus {
  const model = (process.env.AGENTPAY_DEEPSEEK_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  return {
    configured: process.env.AGENTPAY_DEEPSEEK_BRIDGE_ENABLED !== "false",
    provider: "deepseek",
    model,
    liveSearch: false,
    bridge: "openclaw",
  };
}

function bridgeEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of [
    "DEEPSEEK_API_KEY", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy",
    "NODE_USE_ENV_PROXY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "CURL_CA_BUNDLE", "REQUESTS_CA_BUNDLE",
  ]) delete environment[key];
  return environment;
}

async function runOpenClaw(input: string, timeoutMs: number): Promise<BridgeResult> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agentpay-deepseek-"));
  const promptFile = path.join(directory, "request.txt");
  await writeFile(promptFile, input, { encoding: "utf8", mode: 0o600 });
  const executable = process.env.AGENTPAY_OPENCLAW_BIN || DEFAULT_OPENCLAW_BIN;
  const agent = process.env.AGENTPAY_OPENCLAW_AGENT || DEFAULT_AGENT;
  const model = (process.env.AGENTPAY_DEEPSEEK_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const modelRef = model.includes("/") ? model : `deepseek/${model}`;
  const args = [
    "agent", "--agent", agent, "--session-key", `agentpay-${randomUUID()}`,
    "--model", modelRef, "--message-file", promptFile, "--thinking", "off",
    "--timeout", String(Math.max(1, Math.ceil(timeoutMs / 1_000))), "--json",
  ];
  try {
    return await new Promise<BridgeResult>((resolve, reject) => {
      execFile(/* turbopackIgnore: true */ executable, args, {
        cwd: process.cwd(), env: bridgeEnvironment(), timeout: timeoutMs + 5_000,
        killSignal: "SIGTERM", maxBuffer: MAX_BRIDGE_OUTPUT_BYTES,
      }, (error, stdout, stderr) => {
        if (error) reject(Object.assign(error, { stdout: String(stdout), stderr: String(stderr) }));
        else resolve({ stdout: String(stdout), stderr: String(stderr) });
      });
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function bridgeFailureText(error: unknown): string {
  if (!error || typeof error !== "object") return String(error || "");
  const row = error as Record<string, unknown>;
  return `${typeof row.message === "string" ? row.message : ""}\n${typeof row.stdout === "string" ? row.stdout : ""}\n${typeof row.stderr === "string" ? row.stderr : ""}`;
}

function mapBridgeError(error: unknown): Error {
  const text = bridgeFailureText(error);
  if (/timed out|timeout|SIGTERM/i.test(text)) return new Error("DeepSeek did not respond before the AgentPay timeout.");
  if (/401|403|authentication failed|invalid api key|unauthorized|forbidden/i.test(text)) return new Error("DeepSeek rejected the protected AgentPay credential.");
  if (/402|insufficient (?:balance|credit)|payment required|billing/i.test(text)) return new Error("DeepSeek API balance is insufficient. Add only the budget you intend to spend.");
  if (/429|rate.?limit|quota|too many requests/i.test(text)) return new Error("DeepSeek is temporarily rate limited. AgentPay did not fall back to another provider.");
  if (/credential|api key|secretref|not configured|unavailable.*provider/i.test(text)) return new Error("The protected DeepSeek API key is not configured for the OpenClaw AgentPay bridge.");
  return new Error("The OpenClaw DeepSeek bridge is unavailable. AgentPay did not fall back to another provider.");
}

function extractBridgeText(stdout: string, expectedModel: string): string {
  const envelope = JSON.parse(stdout) as Record<string, unknown>;
  if (envelope.status !== "ok") throw new Error(JSON.stringify(envelope));
  const result = envelope.result as Record<string, unknown> | undefined;
  const payloads = result?.payloads;
  const meta = result?.meta as Record<string, unknown> | undefined;
  const agentMeta = meta?.agentMeta as Record<string, unknown> | undefined;
  const executionTrace = result?.executionTrace as Record<string, unknown> | undefined;
  const provider = agentMeta?.provider ?? executionTrace?.winnerProvider;
  const model = agentMeta?.model ?? executionTrace?.winnerModel;
  if (provider !== "deepseek" || model !== expectedModel || executionTrace?.fallbackUsed === true) {
    throw new Error("OpenClaw returned a non-DeepSeek or fallback bridge result.");
  }
  if (!Array.isArray(payloads)) return "";
  const first = payloads[0];
  return first && typeof first === "object" && typeof (first as Record<string, unknown>).text === "string"
    ? String((first as Record<string, unknown>).text)
    : "";
}

function parseJsonText(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed);
}

export async function callDeepSeekJson(input: string, options: DeepSeekOptions = {}): Promise<unknown> {
  const status = deepSeekStatus();
  if (!status.configured) throw new Error("The OpenClaw DeepSeek bridge is disabled for AgentPay.");
  if (options.webSearch) {
    throw new Error("Live x402 discovery is unavailable: the official OpenClaw DeepSeek provider does not expose native web search, and AgentPay will not substitute another provider or an unverified search path.");
  }
  const timeoutMs = options.timeoutMs ?? 30_000;
  try {
    const request = [
      input,
      options.schema ? `\nRequired JSON Schema (${options.schemaName || "agentpay_response"}):\n${JSON.stringify(options.schema)}` : "",
      "\nReturn valid JSON only.",
    ].join("");
    const { stdout } = await (options.runner || testRunner || runOpenClaw)(request, timeoutMs);
    const expectedModel = status.model.includes("/") ? status.model.slice(status.model.indexOf("/") + 1) : status.model;
    const text = extractBridgeText(stdout, expectedModel);
    if (!text || text.length > (options.maxTextChars ?? 20_000)) throw new Error("DeepSeek returned no usable response.");
    try { return parseJsonText(text); }
    catch { throw new Error("DeepSeek returned no usable response."); }
  } catch (error) {
    if (error instanceof Error && /no usable|non-DeepSeek|fallback bridge result/.test(error.message)) throw error;
    throw mapBridgeError(error);
  }
}
