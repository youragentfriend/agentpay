const EXPLORERS: Record<string, { name: string; transactionUrl: string; kind: "evm" | "solana" }> = {
  "1": { name: "Etherscan", transactionUrl: "https://etherscan.io/tx/", kind: "evm" },
  "56": { name: "BscScan", transactionUrl: "https://bscscan.com/tx/", kind: "evm" },
  "137": { name: "PolygonScan", transactionUrl: "https://polygonscan.com/tx/", kind: "evm" },
  "8453": { name: "BaseScan", transactionUrl: "https://basescan.org/tx/", kind: "evm" },
  "42161": { name: "Arbiscan", transactionUrl: "https://arbiscan.io/tx/", kind: "evm" },
  "CT_501": { name: "Solscan", transactionUrl: "https://solscan.io/tx/", kind: "solana" },
};

function validHash(hash: string, kind: "evm" | "solana") {
  if (kind === "evm") return /^0x[0-9a-fA-F]{64}$/.test(hash);
  return /^[1-9A-HJ-NP-Za-km-z]{64,128}$/.test(hash);
}

export function transactionExplorer(chainId: string, transactionHash: string) {
  const explorer = EXPLORERS[chainId];
  const hash = transactionHash.trim();
  if (!explorer || !validHash(hash, explorer.kind)) return undefined;
  return { name: explorer.name, url: `${explorer.transactionUrl}${encodeURIComponent(hash)}` };
}
