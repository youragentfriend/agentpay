import { execFile } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { BinancePayCapability, BinancePayOrder } from "@/lib/binance-pay-types";

const execFileAsync = promisify(execFile);
const SKILL_DIR = path.join(process.cwd(), "vendor", "binance", "payment");
const SCRIPT = path.join(SKILL_DIR, "payment_skill.py");
const CONFIG = path.join(SKILL_DIR, "config.json");
const VENV_PYTHON = process.env.AGENTPAY_PAYMENT_PYTHON
  || path.join(os.homedir(), ".local", "share", "agentpay", "payment-venv", "bin", "python");
const MAX_OUTPUT = 2 * 1024 * 1024;
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
    : paymentError.code === "PAYMENT_EXECUTION_DISABLED" ? 403 : 400;
  return Response.json({ error: paymentError.message, code: paymentError.code }, { status });
}

function parseLastJson(stdout: string): Record<string, unknown> {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].startsWith("{")) continue;
    try { return JSON.parse(lines[index]) as Record<string, unknown>; } catch { continue; }
  }
  throw new BinancePayError("Binance Payment skill returned no structured response.", "INVALID_PAYMENT_RESPONSE");
}

async function pythonBinary(): Promise<string> {
  try { await access(VENV_PYTHON); return VENV_PYTHON; } catch { return "python3"; }
}

async function runUnlocked(args: string[], timeout = 45_000, structured = true): Promise<Record<string, unknown>> {
  try {
    const { stdout } = await execFileAsync(await pythonBinary(), [SCRIPT, ...args], {
      cwd: SKILL_DIR,
      timeout,
      maxBuffer: MAX_OUTPUT,
      env: process.env,
      windowsHide: true,
    });
    return structured ? parseLastJson(stdout) : {};
  } catch (error) {
    if (error instanceof BinancePayError) throw error;
    const commandError = error as { stdout?: string | Buffer };
    const output = typeof commandError.stdout === "string" ? commandError.stdout : commandError.stdout?.toString("utf8");
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

export function validateBinancePayInput(rawQr: string): string {
  const value = rawQr.trim();
  if (!value || value.length > 4096) throw new BinancePayError("Enter a valid Binance payment link or PIX QR payload.", "INVALID_QR_INPUT");
  if (value.includes("br.gov.bcb.pix")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname === "app.binance.com" && (url.pathname.startsWith("/uni-qr/") || url.pathname.startsWith("/qr/"))) return value;
  } catch { /* handled below */ }
  throw new BinancePayError("Only official app.binance.com payment links and PIX QR payloads are supported.", "UNSUPPORTED_QR_FORMAT");
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
  return { configured: missing.length === 0, executionEnabled: process.env.AGENTPAY_ENABLE_BINANCE_PAY === "true", imageDecodeReady, missing };
}

export async function prepareBinancePayment(rawQr: string): Promise<BinancePayOrder> {
  const capability = await getBinancePayCapability();
  if (!capability.configured) throw new BinancePayError("Binance Pay credentials are not configured.", "PAYMENT_CONFIG_REQUIRED");
  return serialized(async () => {
    await runUnlocked(["--action", "reset"], 45_000, false);
    return asPaymentOrder(await runUnlocked(["--action", "purchase", "--raw_qr", validateBinancePayInput(rawQr)]));
  });
}

export async function setBinancePaymentAmount(amount: string, currency?: string): Promise<BinancePayOrder> {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(amount) || Number(amount) <= 0) throw new BinancePayError("Enter a positive payment amount.", "INVALID_PAYMENT_AMOUNT");
  return serialized(async () => asPaymentOrder(await runUnlocked(["--action", "set_amount", "--amount", amount, ...(currency ? ["--currency", currency.toUpperCase()] : [])])));
}

export async function confirmBinancePayment(): Promise<BinancePayOrder> {
  if (process.env.AGENTPAY_ENABLE_BINANCE_PAY !== "true") throw new BinancePayError("Binance Pay execution is disabled on this server.", "PAYMENT_EXECUTION_DISABLED");
  return serialized(async () => asPaymentOrder(await runUnlocked(["--action", "pay_confirm"], 90_000)));
}

export async function pollBinancePayment(): Promise<BinancePayOrder> {
  return serialized(async () => asPaymentOrder(await runUnlocked(["--action", "query"], 45_000)));
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
