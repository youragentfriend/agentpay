import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type {
  WalletAddress,
  WalletBalance,
  WalletChain,
  WalletConnectionStatus,
  WalletOverview,
  WalletSignIn,
  WalletTransaction,
} from "@/lib/wallet-types";
import type { PreparedTransfer } from "@/lib/payment-workflow";
import type { X402Preview, X402Signature } from "@/lib/x402-types";
import { directChildEnvironment } from "@/lib/server/direct-network";

const execFileAsync = promisify(execFile);
const BAW_BIN = path.join(process.cwd(), "node_modules", ".bin", "baw");
const MAX_OUTPUT_BYTES = 1024 * 1024;
const READ_TIMEOUT_MS = 30_000;
const VERIFY_TIMEOUT_MS = 295_000;
const QR_CODE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface CliEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: number | string; name?: string; message?: string };
}

export class AgenticWalletError extends Error {
  constructor(
    message: string,
    public readonly code = "AGENTIC_WALLET_ERROR",
  ) {
    super(message);
    this.name = "AgenticWalletError";
  }
}

export function parseCliEnvelope<T>(stdout: string): T {
  const envelope = JSON.parse(stdout) as CliEnvelope<T>;
  if (!envelope.success || envelope.data === undefined) {
    throw new AgenticWalletError(
      envelope.error?.message ?? "Agentic Wallet returned an unsuccessful response.",
      String(envelope.error?.name ?? envelope.error?.code ?? "AGENTIC_WALLET_ERROR"),
    );
  }
  return envelope.data;
}

export function isValidQrCodeId(value: string): boolean {
  return QR_CODE_ID.test(value);
}

async function runBaw<T>(args: readonly string[], timeout = READ_TIMEOUT_MS): Promise<T> {
  try {
    const { stdout } = await execFileAsync(BAW_BIN, [...args, "--json"], {
      cwd: process.cwd(),
      timeout,
      maxBuffer: MAX_OUTPUT_BYTES,
      env: directChildEnvironment(),
      windowsHide: true,
    });
    return parseCliEnvelope<T>(stdout);
  } catch (error) {
    if (error instanceof AgenticWalletError) throw error;
    if (error instanceof SyntaxError) {
      throw new AgenticWalletError("Agentic Wallet returned invalid JSON.", "INVALID_WALLET_RESPONSE");
    }
    const commandError = error as { stdout?: string | Buffer; stderr?: string | Buffer };
    for (const output of [commandError.stdout, commandError.stderr]) {
      const value = typeof output === "string" ? output : output?.toString("utf8");
      if (!value?.trim().startsWith("{")) continue;
      try {
        return parseCliEnvelope<T>(value);
      } catch (parsedError) {
        if (parsedError instanceof AgenticWalletError) throw parsedError;
      }
    }
    throw new AgenticWalletError("Agentic Wallet command failed.", "WALLET_COMMAND_FAILED");
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export async function getWalletStatus(): Promise<WalletConnectionStatus> {
  const data = await runBaw<{ status?: unknown }>(["wallet", "status"]);
  const status = text(data.status);
  if (status === "CONNECTED" || status === "CREATING" || status === "UNCONNECTED") return status;
  throw new AgenticWalletError("Agentic Wallet returned an unknown connection status.", "UNKNOWN_WALLET_STATUS");
}

export async function getWalletOverview(): Promise<WalletOverview> {
  const status = await getWalletStatus();
  if (status !== "CONNECTED") {
    return { status, addresses: [], balances: [], chains: [], transactions: [] };
  }

  const [addressData, balanceData, chainData, historyData] = await Promise.all([
    runBaw<{ addresses?: unknown }>(["wallet", "address"]),
    runBaw<unknown>(["wallet", "balance"]),
    runBaw<unknown>(["wallet", "chains"]),
    runBaw<{ transactions?: unknown }>(["wallet", "tx-history", "--size", "20"]),
  ]);

  const addresses: WalletAddress[] = list(addressData.addresses).map((item) => {
    const row = record(item);
    return { binanceChainId: text(row.binanceChainId), chainName: text(row.chainName), address: text(row.address) };
  }).filter((item) => item.binanceChainId && item.address);

  const balances: WalletBalance[] = list(balanceData).map((item) => {
    const row = record(item);
    return {
      symbol: text(row.symbol), address: text(row.address), binanceChainId: text(row.binanceChainId),
      balance: text(row.balance), price: text(row.price), value: text(row.value),
    };
  }).filter((item) => item.symbol && item.binanceChainId);

  const chains: WalletChain[] = list(chainData).map((item) => {
    const row = record(item);
    return { binanceChainId: text(row.binanceChainId), name: text(row.name), simpleName: text(row.simpleName) };
  }).filter((item) => item.binanceChainId && item.name);

  const transactions: WalletTransaction[] = list(historyData.transactions).map((item) => {
    const row = record(item);
    return {
      txType: text(row.txType), txHash: text(row.txHash), txTime: text(row.txTime),
      binanceChainId: text(row.binanceChainId), status: text(row.status),
    };
  }).filter((item) => item.txHash);

  return { status, addresses, balances, chains, transactions };
}

export async function startWalletSignIn(): Promise<WalletSignIn> {
  const data = await runBaw<Record<string, unknown>>(["auth", "signin"]);
  if (data.status === "ALREADY_CONNECTED") return { status: "ALREADY_CONNECTED" };
  return {
    urlForWeb: text(data.urlForWeb), qrCodeId: text(data.qrCodeId),
    expireAt: text(data.expireAt), pairingCode: text(data.pairingCode),
  };
}

export async function verifyWalletSignIn(qrCodeId: string): Promise<void> {
  if (!isValidQrCodeId(qrCodeId)) {
    throw new AgenticWalletError("Invalid wallet sign-in request.", "INVALID_QR_CODE_ID");
  }
  const data = await runBaw<{ status?: unknown }>(["auth", "verify", "--qrCodeId", qrCodeId], VERIFY_TIMEOUT_MS);
  if (data.status !== "SUCCESS") {
    throw new AgenticWalletError("Agentic Wallet sign-in was not completed.", "WALLET_SIGN_IN_INCOMPLETE");
  }
}

export async function getWalletLockStatus(binanceChainId: string): Promise<"LOCKED" | "UNLOCKED"> {
  const data = await runBaw<{ status?: unknown }>(["wallet", "tx-lock", "--binanceChainId", binanceChainId]);
  if (data.status === "LOCKED" || data.status === "UNLOCKED") return data.status;
  throw new AgenticWalletError("Agentic Wallet returned an unknown transaction lock status.", "UNKNOWN_TX_LOCK_STATUS");
}

export async function sendWalletTransfer(intent: PreparedTransfer): Promise<string> {
  const data = await runBaw<{ txHash?: unknown }>([
    "wallet", "send", "--amount", intent.amount, "--recipient", intent.recipient,
    "--binanceChainId", intent.binanceChainId, "--tokenAddress", intent.tokenAddress,
    "--gasLevel", intent.gasLevel,
  ], 120_000);
  const txHash = text(data.txHash);
  if (!txHash) throw new AgenticWalletError("Agentic Wallet did not return a transaction hash.", "MISSING_TX_HASH");
  return txHash;
}

export async function getWalletTransactionStatus(txHash: string): Promise<string | undefined> {
  const data = await runBaw<Record<string, unknown>>(["wallet", "tx-history", "--tx", txHash]);
  const transaction = Array.isArray(data.transactions) ? record(data.transactions[0]) : data;
  return normalizeWalletTransactionStatus(text(transaction.status));
}

export async function previewX402Payment(paymentRequirements: string): Promise<X402Preview> {
  if (!paymentRequirements || paymentRequirements.length > 65_536) {
    throw new AgenticWalletError("The x402 payment requirements are missing or too large.", "INVALID_X402_REQUIREMENTS");
  }
  return runBaw<X402Preview>(["x402-payment", "preview", "--paymentRequirements", paymentRequirements]);
}

export async function signX402Payment(paymentId: string, selectedIndex: number): Promise<X402Signature> {
  if (!QR_CODE_ID.test(paymentId)) throw new AgenticWalletError("The x402 payment ID is invalid.", "INVALID_X402_PAYMENT_ID");
  if (!Number.isSafeInteger(selectedIndex) || selectedIndex < 1) throw new AgenticWalletError("The x402 payment option index is invalid.", "INVALID_X402_OPTION");
  return runBaw<X402Signature>(["x402-payment", "sign", "--paymentId", paymentId, "--selectedIndex", String(selectedIndex)], 120_000);
}

export function normalizeWalletTransactionStatus(status: string): "pending" | "confirmed" | "failed" | undefined {
  switch (status.toUpperCase()) {
    case "PENDING":
    case "WORKING":
      return "pending";
    case "SUCCESS":
    case "CONFIRMED":
      return "confirmed";
    case "FAILED":
    case "REJECTED":
      return "failed";
    default:
      return undefined;
  }
}
