import { execFile } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { BinancePayCapability, BinancePayCurrencies, BinancePayOrder, BinancePayReceiveLink } from "@/lib/binance-pay-types";
import { saveBinancePayOrder } from "@/lib/server/binance-pay-store";
import { enforcePaymentPolicy, PaymentPolicyError, usdAmountForCurrency } from "@/lib/server/payment-policy";
import { directChildEnvironment } from "@/lib/server/direct-network";
import { assertPaymentExecutionAllowed, isPaymentRailEffectivelyEnabled, PaymentExecutionError } from "@/lib/server/payment-execution";

const execFileAsync = promisify(execFile);
const SKILL_DIR = path.join(process.cwd(), "vendor", "binance", "payment");
const SCRIPT = path.join(SKILL_DIR, "payment_skill.py");
const CONFIG = path.join(SKILL_DIR, "config.json");
const STATE = path.join(SKILL_DIR, ".payment_state.json");
const VENV_PYTHON = process.env.AGENTPAY_PAYMENT_PYTHON
  || path.join(os.homedir(), ".local", "share", "agentpay", "payment-venv", "bin", "python");
const MAX_OUTPUT = 2 * 1024 * 1024;
// Curated from Binance's current market-cap list; stablecoins are intentionally
// grouped first for faster receive-link selection. The server whitelist remains
// the authority for symbols accepted by this workflow.
const RECEIVE_CURRENCIES = [
  "USDT", "USDC", "DAI", "FDUSD", "USD1",
  "BTC", "ETH", "BNB", "XRP", "SOL", "TRX", "ARB", "DOGE", "LINK", "ATOM",
  "ADA", "XLM", "AVAX", "LTC", "POL",
];
let queue = Promise.resolve();

export class BinancePayError extends Error {
  constructor(message: string, public readonly code = "BINANCE_PAY_ERROR") {
    super(message);
    this.name = "BinancePayError";
  }
}

export function binancePayErrorResponse(error: unknown): Response {
  const paymentError = error instanceof BinancePayError
    ? error
    : new BinancePayError("Binance Pay operation failed.");
  const status = paymentError.code === "PAYMENT_CONFIG_REQUIRED" || paymentError.code === "QR_DECODER_NOT_READY" ? 503
    : ["PAYMENT_EXECUTION_DISABLED", "PAYMENT_SERVER_DISABLED", "PAYMENTS_EMERGENCY_STOPPED", "PAYMENT_RAIL_DISABLED"].includes(paymentError.code) ? 403 : 400;
  return Response.json({ error: paymentError.message, code: paymentError.code }, { status });
}

export function parseLastJson(stdout: string): Record<string, unknown> {
  const cleaned = stdout.replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, "");
  const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index]) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* provider logs may surround the JSON result */ }
  }

  // Some skill/provider versions emit pretty-printed JSON or prefix the JSON
  // with a log label. Extract balanced objects without trusting log content.
  let candidate: Record<string, unknown> | undefined;
  for (let start = 0; start < cleaned.length; start += 1) {
    if (cleaned[start] !== "{") continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < cleaned.length; index += 1) {
      const character = cleaned[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') { quoted = true; continue; }
      if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(cleaned.slice(start, index + 1)) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) candidate = parsed as Record<string, unknown>;
          } catch { /* this brace pair was not a JSON object */ }
          break;
        }
      }
    }
  }
  if (candidate) return candidate;
  throw new BinancePayError("Binance Payment skill returned no structured response.", "INVALID_PAYMENT_RESPONSE");
}

async function pythonBinary(): Promise<string> {
  try { await access(VENV_PYTHON); return VENV_PYTHON; } catch { return "python3"; }
}

async function runUnlocked(args: string[], timeout = 45_000, structured = true): Promise<Record<string, unknown>> {
  try {
    const { stdout, stderr } = await execFileAsync(await pythonBinary(), [SCRIPT, ...args], {
      cwd: SKILL_DIR,
      timeout,
      maxBuffer: MAX_OUTPUT,
      env: directChildEnvironment(),
      windowsHide: true,
    });
    return structured ? parseLastJson([stdout, stderr].filter(Boolean).join("\n")) : {};
  } catch (error) {
    if (error instanceof BinancePayError) throw error;
    const commandError = error as { stdout?: string | Buffer };
    const stdout = typeof commandError.stdout === "string" ? commandError.stdout : commandError.stdout?.toString("utf8");
    const stderr = typeof (error as { stderr?: string | Buffer }).stderr === "string"
      ? (error as { stderr?: string }).stderr
      : (error as { stderr?: string | Buffer }).stderr?.toString("utf8");
    const output = [stdout, stderr].filter(Boolean).join("\n");
    if (output) return parseLastJson(output);
    throw new BinancePayError("Binance Payment command failed.", "PAYMENT_COMMAND_FAILED");
  }
}

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation, operation);
  queue = result.then(() => undefined, () => undefined);
  return result;
}

function asPaymentOrder(result: Record<string, unknown>): BinancePayOrder {
  if (typeof result.status !== "string") throw new BinancePayError("Binance Payment skill returned no order status.", "INVALID_PAYMENT_RESPONSE");
  return result as unknown as BinancePayOrder;
}

export function enforceBinancePaymentPolicy(order: BinancePayOrder): void {
  try {
    enforcePaymentPolicy({
      rail: "binance-pay",
      amountUsd: usdAmountForCurrency(order.amount_sent ?? order.amount, order.currency),
    });
  } catch (error) {
    if (error instanceof PaymentPolicyError) throw new BinancePayError(error.message, error.code);
    throw error;
  }
}

async function enrichAndPersistOrder(order: BinancePayOrder): Promise<BinancePayOrder> {
  let state: Record<string, unknown> = {};
  try { state = JSON.parse(await readFile(STATE, "utf8")) as Record<string, unknown>; } catch { /* no active state */ }
  const checkoutId = order.checkout_id || (typeof state.checkout_id === "string" ? state.checkout_id : undefined);
  if (!checkoutId) return order;
  const stateAmount = state.amount ?? state.suggested_amount ?? state.preset_amount;
  return saveBinancePayOrder({
    ...order,
    checkout_id: checkoutId,
    pay_order_id: order.pay_order_id || (typeof state.pay_order_id === "string" ? state.pay_order_id : undefined),
    payment_type: order.payment_type || (state.payment_type === "C2C" || state.payment_type === "PIX" ? state.payment_type : undefined),
    payee: order.payee || (typeof state.nickname === "string" ? state.nickname : undefined),
    amount: order.amount ?? order.amount_sent ?? (typeof stateAmount === "string" || typeof stateAmount === "number" ? stateAmount : undefined),
    currency: order.currency || (typeof state.currency === "string" ? state.currency : undefined),
  });
}

export function validateBinancePayInput(rawQr: string): string {
  const value = rawQr.trim();
  if (!value || value.length > 4096) throw new BinancePayError("Enter a valid Binance payment link or PIX QR payload.", "INVALID_QR_INPUT");
  if (value.includes("br.gov.bcb.pix")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname === "app.binance.com" && (url.pathname.startsWith("/uni-qr/") || url.pathname.startsWith("/qr/"))) return value;
  } catch { /* handled below */ }
  throw new BinancePayError("Enter a valid Binance Pay URL beginning with https://app.binance.com/ or a PIX QR payload. Plain text and numbers are not supported.", "UNSUPPORTED_QR_FORMAT");
}

export function getCompatibleBinancePayLink(rawQr: string): string | undefined {
  try {
    const value = validateBinancePayInput(rawQr);
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    if (url.hostname !== "app.binance.com" || url.search || url.hash) return undefined;
    if (segments[0] === "uni-qr" && segments.length === 2 && segments[1] !== "request-to-pay") return value;
    if (segments[0] === "qr" && segments.length >= 2) return value;
  } catch { return undefined; }
  return undefined;
}

export function addBinancePayInputHint(rawQr: string, order: BinancePayOrder): BinancePayOrder {
  if (order.status !== "INVALID_QR_FORMAT") return order;
  try {
    const url = new URL(rawQr);
    if (url.hostname === "app.binance.com" && url.pathname === "/uni-qr/request-to-pay") {
      return {
        ...order,
        hint: "Binance Agent Payout rejected this Request-to-Pay share-link subtype. Try the recipient’s standard Binance Pay receive QR image instead.",
      };
    }
  } catch { /* input validation handles malformed URLs */ }
  return order;
}

export async function getBinancePayCapability(): Promise<BinancePayCapability> {
  const missing: string[] = [];
  let fileKey = false;
  let fileSecret = false;
  try {
    const config = JSON.parse(await readFile(CONFIG, "utf8")) as Record<string, unknown>;
    fileKey = config.configured === true && typeof config.api_key === "string" && config.api_key.length > 0;
    fileSecret = config.configured === true && typeof config.api_secret === "string" && config.api_secret.length > 0;
  } catch { /* configuration has not been completed */ }
  if (!process.env.PAYMENT_API_KEY && !fileKey) missing.push("PAYMENT_API_KEY");
  if (!process.env.PAYMENT_API_SECRET && !fileSecret) missing.push("PAYMENT_API_SECRET");
  let imageDecodeReady = false;
  try {
    await execFileAsync(await pythonBinary(), ["-c", "from PIL import Image; from pyzbar.pyzbar import decode"], { timeout: 10_000 });
    imageDecodeReady = true;
  } catch {
    try {
      await execFileAsync(await pythonBinary(), ["-c", "import cv2"], { timeout: 10_000 });
      imageDecodeReady = true;
    } catch { imageDecodeReady = false; }
  }
  return { configured: missing.length === 0, executionEnabled: isPaymentRailEffectivelyEnabled("binance-pay"), imageDecodeReady, missing };
}

export function getBinancePayReceiveCurrencies(): BinancePayCurrencies {
  return { currencies: RECEIVE_CURRENCIES, source: "agent-payout-supported-set" };
}

export async function prepareBinancePayment(rawQr: string): Promise<BinancePayOrder> {
  const capability = await getBinancePayCapability();
  if (!capability.configured) throw new BinancePayError("Binance Pay credentials are not configured.", "PAYMENT_CONFIG_REQUIRED");
  return serialized(async () => {
    await runUnlocked(["--action", "reset"], 45_000, false);
    const validated = validateBinancePayInput(rawQr);
    const order = await enrichAndPersistOrder(addBinancePayInputHint(validated, asPaymentOrder(await runUnlocked(["--action", "purchase", "--raw_qr", validated]))));
    enforceBinancePaymentPolicy(order);
    return order;
  });
}

export async function setBinancePaymentAmount(amount: string, currency?: string): Promise<BinancePayOrder> {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(amount) || Number(amount) <= 0) throw new BinancePayError("Enter a positive payment amount.", "INVALID_PAYMENT_AMOUNT");
  return serialized(async () => {
    const order = await enrichAndPersistOrder(asPaymentOrder(await runUnlocked(["--action", "set_amount", "--amount", amount, ...(currency ? ["--currency", currency.toUpperCase()] : [])])));
    enforceBinancePaymentPolicy(order);
    return order;
  });
}

export async function confirmBinancePayment(): Promise<BinancePayOrder> {
  try { assertPaymentExecutionAllowed("binance-pay"); }
  catch (error) { if (error instanceof PaymentExecutionError) throw new BinancePayError(error.message, error.code); throw error; }
  return serialized(async () => {
    // Before confirmation the vendored skill has only a local checkout state;
    // its provider `query` action correctly reports no active payment order.
    // Read the local status instead, then let pay_confirm create the provider
    // order exactly once after AgentPay's policy checks pass.
    const current = await enrichAndPersistOrder(asPaymentOrder(await runUnlocked(["--action", "status"], 45_000)));
    enforceBinancePaymentPolicy(current);
    return enrichAndPersistOrder(asPaymentOrder(await runUnlocked(["--action", "pay_confirm"], 90_000)));
  });
}

export async function pollBinancePayment(): Promise<BinancePayOrder> {
  return serialized(async () => enrichAndPersistOrder(asPaymentOrder(await runUnlocked(["--action", "query"], 45_000))));
}

/** Clears the provider-side checkout state when a chat review is declined. */
export async function resetBinancePayment(): Promise<void> {
  await serialized(() => runUnlocked(["--action", "reset"], 45_000, false).then(() => undefined));
}

export async function createBinancePayReceiveLink(currency?: string, amount?: string, note?: string): Promise<BinancePayReceiveLink> {
  const capability = await getBinancePayCapability();
  if (!capability.configured) throw new BinancePayError("Binance Pay credentials are not configured.", "PAYMENT_CONFIG_REQUIRED");
  const normalizedCurrency = currency?.trim().toUpperCase();
  const normalizedAmount = amount?.trim();
  const normalizedNote = note?.trim();
  if ((normalizedAmount || normalizedNote) && !normalizedCurrency) throw new BinancePayError("Currency is required when amount or note is set.", "CURRENCY_REQUIRED");
  if (normalizedCurrency && !/^[A-Z0-9]{2,12}$/.test(normalizedCurrency)) throw new BinancePayError("Enter a valid currency symbol.", "INVALID_CURRENCY");
  if (normalizedCurrency && !RECEIVE_CURRENCIES.includes(normalizedCurrency)) throw new BinancePayError("Choose a supported Binance Pay receive currency.", "UNSUPPORTED_RECEIVE_CURRENCY");
  if (normalizedAmount && (!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(normalizedAmount) || Number(normalizedAmount) <= 0)) throw new BinancePayError("Enter a positive receive amount.", "INVALID_PAYMENT_AMOUNT");
  if (normalizedNote && normalizedNote.length > 120) throw new BinancePayError("Receive note must be 120 characters or fewer.", "NOTE_TOO_LONG");
  const result = await serialized(() => runUnlocked([
    "--action", "receive",
    ...(normalizedCurrency ? ["--currency", normalizedCurrency] : []),
    ...(normalizedAmount ? ["--amount", normalizedAmount] : []),
    ...(normalizedNote ? ["--note", normalizedNote] : []),
  ]));
  if (result.success !== true || typeof result.shareLink !== "string") {
    throw new BinancePayError(typeof result.message === "string" ? result.message : "Unable to generate a Binance Pay receive link.", "RECEIVE_LINK_FAILED");
  }
  return {
    success: true,
    shareLink: validateBinancePayInput(result.shareLink),
    qrImageUrl: typeof result.qrImageUrl === "string" ? result.qrImageUrl : undefined,
    currency: typeof result.currency === "string" ? result.currency : undefined,
    amount: typeof result.amount === "string" || typeof result.amount === "number" ? String(result.amount) : undefined,
  };
}

export async function decodeBinanceQr(file: File): Promise<{ qr_data?: string; source_type?: string; status?: string; message?: string }> {
  const capability = await getBinancePayCapability();
  if (!capability.imageDecodeReady) throw new BinancePayError("QR image decoding dependencies are not installed on this host.", "QR_DECODER_NOT_READY");
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) throw new BinancePayError("QR image must be between 1 byte and 5 MB.", "INVALID_QR_IMAGE_SIZE");
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new BinancePayError("Upload a PNG, JPEG, or WebP QR image.", "INVALID_QR_IMAGE_TYPE");
  const directory = path.join(process.cwd(), "data", "qr-uploads");
  await mkdir(directory, { recursive: true });
  const filename = path.join(directory, `${crypto.randomUUID()}.${file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"}`);
  try {
    await writeFile(filename, Buffer.from(await file.arrayBuffer()), { mode: 0o600 });
    return await serialized(() => runUnlocked(["--action", "decode_qr", "--image", filename])) as { qr_data?: string; source_type?: string; status?: string; message?: string };
  } finally {
    await rm(filename, { force: true });
  }
}
