export type WalletConnectionStatus = "CONNECTED" | "CREATING" | "UNCONNECTED";

export interface WalletAddress {
  binanceChainId: string;
  chainName: string;
  address: string;
}

export interface WalletBalance {
  symbol: string;
  address: string;
  binanceChainId: string;
  balance: string;
  price: string;
  value: string;
}

export interface WalletChain {
  binanceChainId: string;
  name: string;
  simpleName: string;
}

export interface WalletTransaction {
  txType: string;
  txHash: string;
  txTime: string;
  binanceChainId: string;
  status: string;
}

export interface WalletOverview {
  status: WalletConnectionStatus;
  addresses: WalletAddress[];
  balances: WalletBalance[];
  chains: WalletChain[];
  transactions: WalletTransaction[];
}

export interface WalletSignIn {
  status?: "ALREADY_CONNECTED";
  urlForWeb?: string;
  qrCodeId?: string;
  expireAt?: string;
  pairingCode?: string;
}
