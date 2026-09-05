export const SOLANA_CHAIN_ID = "CT_501";

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DECIMAL_AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;
const ZERO_AMOUNT = /^0+(?:\.0+)?$/;

export function amountValidationError(value: string): string {
  const amount = value.trim();
  if (!amount) return "Enter an amount.";
  if (!DECIMAL_AMOUNT.test(amount) || ZERO_AMOUNT.test(amount)) {
    return "Enter a positive number with up to 18 decimal places.";
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
