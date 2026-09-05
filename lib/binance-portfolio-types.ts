export type BinancePortfolioSource = "spot" | "funding" | "futures" | "earn" | "margin";

export type BinanceSourceState = "available" | "empty" | "unavailable" | "error";

export type BinanceSourceHealth = {
  source: BinancePortfolioSource;
  state: BinanceSourceState;
  label: string;
  itemCount: number;
  message?: string;
};

export type BinanceBalance = {
  id: string;
  source: BinancePortfolioSource;
  sourceLabel: string;
  asset: string;
  available: string;
  total: string;
  usdValue: number | null;
  priceUsd: number | null;
  valuation: "direct" | "derived" | "stablecoin" | "unavailable";
};

export type BinancePortfolio = {
  configured: boolean;
  connection: "not_configured" | "connected" | "partial" | "error";
  readOnly: true;
  refreshedAt: string | null;
  estimatedTotalUsd: number;
  pricedAssetCount: number;
  unpricedAssetCount: number;
  dustThresholdUsd: number;
  balances: BinanceBalance[];
  sources: BinanceSourceHealth[];
};

export type BinanceAccountStatus = {
  configured: boolean;
  readOnly: true;
  missing: string[];
  credentialSource: "environment" | "not_configured";
};
