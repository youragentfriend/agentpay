export const SOLANA_CHAIN_ID = "CT_501";

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DECIMAL_AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;
const ZERO_AMOUNT = /^0+(?:\.0+)?$/;
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function decimalParts(value: string): { units: bigint; scale: number } | undefined {
  if (!DECIMAL.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  return { units: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function alignDecimals(left: string, right: string): [bigint, bigint, number] | undefined {
  const a = decimalParts(left);
  const b = decimalParts(right);
  if (!a || !b) return undefined;
  const scale = Math.max(a.scale, b.scale);
  return [a.units * BigInt(10) ** BigInt(scale - a.scale), b.units * BigInt(10) ** BigInt(scale - b.scale), scale];
}

function greaterThan(left: string, right: string): boolean {
  const values = alignDecimals(left, right);
  return values ? values[0] > values[1] : false;
}

export function addDecimalStrings(left: string, right: string): string {
  const values = alignDecimals(left, right);
  if (!values) return "0";
  const [a, b, scale] = values;
  const raw = (a + b).toString().padStart(scale + 1, "0");
  if (scale === 0) return raw;
  return `${raw.slice(0, -scale)}.${raw.slice(-scale)}`.replace(/\.?0+$/, "") || "0";
}

function multiplyDecimalStrings(left: string, right: string): string | undefined {
  const a = decimalParts(left);
  const b = decimalParts(right);
  if (!a || !b) return undefined;
  const scale = a.scale + b.scale;
  const raw = (a.units * b.units).toString().padStart(scale + 1, "0");
  if (scale === 0) return raw;
  return `${raw.slice(0, -scale)}.${raw.slice(-scale)}`.replace(/\.?0+$/, "") || "0";
}

export function amountValidationError(value: string): string {
  const amount = value.trim();
  if (!amount) return "Enter an amount.";
  if (!DECIMAL_AMOUNT.test(amount) || ZERO_AMOUNT.test(amount)) {
    return "Enter a positive number with up to 18 decimal places.";
  }
  return "";
}

export function transferAmountValidationError(value: string, options: {
  asset?: string;
  availableBalance?: string;
  priceUsd?: string;
  perPaymentUsdLimit?: string | null;
  dailyUsdLimit?: string | null;
  dailySpendUsd?: string;
} = {}): string {
  const formatError = amountValidationError(value);
  if (formatError) return formatError;
  const amount = value.trim();
  if (options.availableBalance && greaterThan(amount, options.availableBalance)) {
    return `Amount exceeds your available ${options.asset || "asset"} balance of ${options.availableBalance}.`;
  }
  const amountUsd = options.priceUsd ? multiplyDecimalStrings(amount, options.priceUsd) : undefined;
  if (!amountUsd) return "";
  if (options.perPaymentUsdLimit && greaterThan(amountUsd, options.perPaymentUsdLimit)) {
    return `Payment exceeds your $${options.perPaymentUsdLimit} Agentic Wallet per-transaction limit.`;
  }
  if (options.dailyUsdLimit && options.dailySpendUsd && greaterThan(addDecimalStrings(options.dailySpendUsd, amountUsd), options.dailyUsdLimit)) {
    return `Payment would exceed your $${options.dailyUsdLimit} Agentic Wallet daily limit.`;
  }
  return "";
}

export function isSolanaChain(chainId: string): boolean {
  return chainId === SOLANA_CHAIN_ID;
}

export function isValidRecipientForChain(value: string, chainId: string): boolean {
  return isSolanaChain(chainId) ? SOLANA_ADDRESS.test(value) : EVM_ADDRESS.test(value);
}

export function recipientValidationError(value: string, chainId: string): string {
  const recipient = value.trim();
  if (!recipient) return "Enter a recipient address.";
  if (!chainId) return "Select a network before entering a recipient address.";
  if (isValidRecipientForChain(recipient, chainId)) return "";
  return isSolanaChain(chainId)
    ? "Enter a valid Solana address using 32–44 base58 characters."
    : "Enter a valid EVM address beginning with 0x followed by 40 hexadecimal characters.";
}
