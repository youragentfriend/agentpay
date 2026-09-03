import type { PrepareTransferRequest, PreparedTransfer } from "@/lib/payment-workflow";
import type { WalletOverview } from "@/lib/wallet-types";

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DECIMAL_AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;
const GAS_LEVELS = new Set(["LOW", "MEDIUM", "HIGH"]);

export class PaymentIntentError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "PaymentIntentError";
  }
}

interface ParsedInstruction {
  amount: string;
  asset: string;
  recipient: string;
  chain?: string;
}

export function parseTransferInstruction(instruction: string): ParsedInstruction {
  const normalized = instruction.trim();
  const match = normalized.match(/^(?:send|pay)\s+([0-9]+(?:\.[0-9]+)?)\s+([a-zA-Z0-9._-]+)\s+to\s+(\S+?)(?:\s+on\s+(.+))?$/i);
  if (!match) {
    throw new PaymentIntentError(
      'Use: “Send 5 USDT to 0x… on BNB Smart Chain”.',
      "UNRECOGNIZED_TRANSFER_INSTRUCTION",
    );
  }
  return { amount: match[1], asset: match[2].toUpperCase(), recipient: match[3], chain: match[4]?.trim() };
}

function normalizeDecimal(value: string): [string, string] {
  const [whole, fraction = ""] = value.split(".");
  return [whole.replace(/^0+(?=\d)/, ""), fraction.replace(/0+$/, "")];
}

export function compareDecimalStrings(left: string, right: string): number {
  const [leftWhole, leftFraction] = normalizeDecimal(left);
  const [rightWhole, rightFraction] = normalizeDecimal(right);
  if (leftWhole.length !== rightWhole.length) return leftWhole.length > rightWhole.length ? 1 : -1;
  if (leftWhole !== rightWhole) return leftWhole > rightWhole ? 1 : -1;
  const length = Math.max(leftFraction.length, rightFraction.length);
  const paddedLeft = leftFraction.padEnd(length, "0");
  const paddedRight = rightFraction.padEnd(length, "0");
  return paddedLeft === paddedRight ? 0 : paddedLeft > paddedRight ? 1 : -1;
}

function validAddress(value: string, chainId: string): boolean {
  return chainId === "CT_501" ? SOLANA_ADDRESS.test(value) : EVM_ADDRESS.test(value);
}

export function prepareTransfer(request: PrepareTransferRequest, wallet: WalletOverview): Omit<PreparedTransfer, "id"> {
  if (wallet.status !== "CONNECTED") {
    throw new PaymentIntentError("Connect Agentic Wallet before preparing a transfer.", "WALLET_NOT_CONNECTED");
  }

  let amount = request.amount?.trim() ?? "";
  let recipient = request.recipient?.trim() ?? "";
  let tokenAddress = request.tokenAddress?.trim() ?? "";
  let chainId = request.binanceChainId?.trim() ?? "";

  if (request.instruction) {
    const parsed = parseTransferInstruction(request.instruction);
    amount = parsed.amount;
    recipient = parsed.recipient;
    const candidates = wallet.balances.filter((balance) => balance.symbol.toUpperCase() === parsed.asset);
    const chainText = parsed.chain?.toLowerCase();
    const selected = chainText
      ? candidates.find((balance) => {
          const chain = wallet.chains.find((item) => item.binanceChainId === balance.binanceChainId);
          return chain && [chain.binanceChainId, chain.name, chain.simpleName].some((value) => value.toLowerCase() === chainText);
        })
      : candidates.length === 1 ? candidates[0] : undefined;
    if (!selected) {
      throw new PaymentIntentError(
        candidates.length > 1 ? `Specify which chain to use for ${parsed.asset}.` : `${parsed.asset} is not available in this wallet.`,
        candidates.length > 1 ? "CHAIN_REQUIRED" : "ASSET_NOT_AVAILABLE",
      );
    }
    tokenAddress = selected.address;
    chainId = selected.binanceChainId;
  }

  if (!DECIMAL_AMOUNT.test(amount) || compareDecimalStrings(amount, "0") <= 0) {
    throw new PaymentIntentError("Enter a positive amount with up to 18 decimal places.", "INVALID_AMOUNT");
  }
  if (request.gasLevel && !GAS_LEVELS.has(request.gasLevel)) {
    throw new PaymentIntentError("Gas priority must be LOW, MEDIUM, or HIGH.", "INVALID_GAS_LEVEL");
  }
  const chain = wallet.chains.find((item) => item.binanceChainId === chainId);
  if (!chain) throw new PaymentIntentError("Choose a chain supported by this wallet.", "UNSUPPORTED_CHAIN");
  if (!validAddress(recipient, chainId)) throw new PaymentIntentError("Recipient address format does not match the selected chain.", "INVALID_RECIPIENT");
  if (!validAddress(tokenAddress, chainId)) throw new PaymentIntentError("Token address format does not match the selected chain.", "INVALID_TOKEN_ADDRESS");

  const balance = wallet.balances.find((item) => item.binanceChainId === chainId && item.address.toLowerCase() === tokenAddress.toLowerCase());
  if (!balance) throw new PaymentIntentError("That token is not available in the connected wallet.", "ASSET_NOT_AVAILABLE");
  if (compareDecimalStrings(amount, balance.balance) > 0) throw new PaymentIntentError(`Amount exceeds the available ${balance.symbol} balance.`, "INSUFFICIENT_BALANCE");

  const now = new Date();
  return {
    status: "awaiting-approval", instruction: request.instruction?.trim(),
    amount, asset: balance.symbol, availableBalance: balance.balance, recipient,
    tokenAddress: balance.address, binanceChainId: chainId, chainName: chain.name,
    gasLevel: request.gasLevel ?? "HIGH", createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
    warnings: [
      "The recipient must already exist in your Binance Wallet address book.",
      "Approval alone does not broadcast funds; execution is a separate server-guarded action.",
    ],
  };
}
