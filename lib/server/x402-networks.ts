export const SUPPORTED_X402_NETWORKS = ["eip155:56", "eip155:8453"] as const;

export function isSupportedX402Network(value: unknown): value is string {
  return typeof value === "string"
    && (SUPPORTED_X402_NETWORKS.includes(value as typeof SUPPORTED_X402_NETWORKS[number]) || value.startsWith("solana:"));
}
