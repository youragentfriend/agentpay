import { createHmac } from "node:crypto";
import type {
  BinanceAccountStatus,
  BinanceBalance,
  BinancePortfolio,
  BinancePortfolioSource,
  BinanceSourceHealth,
} from "@/lib/binance-portfolio-types";

const SPOT_BASE = "https://api.binance.com";
const FUTURES_BASE = "https://fapi.binance.com";
const REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_DUST_THRESHOLD_USD = 0.1;
const SOURCE_LABELS: Record<BinancePortfolioSource, string> = {
  spot: "Spot",
  funding: "Funding",
  futures: "USDⓈ-M Futures",
  earn: "Simple Earn",
  margin: "Margin",
};
const STABLECOINS = new Set(["USDT", "USDC", "FDUSD", "TUSD", "USDP", "DAI", "BUSD", "USD1"]);

type QueryValue = string | number | boolean | undefined;
export type NormalizedBinanceBalance = { source: BinancePortfolioSource; asset: string; available: number; total: number };
export type BinanceSourceLoad = { balances: NormalizedBinanceBalance[]; message?: string };
type Ticker = { symbol?: unknown; price?: unknown };

export class BinanceReadonlyError extends Error {
  constructor(message: string, public readonly code = "BINANCE_READONLY_ERROR", public readonly status = 502) {
    super(message);
  }
}

export function getBinanceAccountStatus(): BinanceAccountStatus {
  const missing = [
    !process.env.BINANCE_READONLY_API_KEY ? "BINANCE_READONLY_API_KEY" : "",
    !process.env.BINANCE_READONLY_API_SECRET ? "BINANCE_READONLY_API_SECRET" : "",
  ].filter(Boolean);
  return {
    configured: missing.length === 0,
    readOnly: true,
    missing,
    credentialSource: missing.length === 0 ? "environment" : "not_configured",
  };
}

function encode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function canonicalQuery(params: Record<string, QueryValue>) {
  return Object.entries(params)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encode(key)}=${encode(String(value))}`)
    .join("&");
}

export function signCanonicalQuery(query: string, secret: string) {
  return createHmac("sha256", secret).update(query).digest("hex");
}

export function sanitizeBinanceMessage(message: string) {
  return message
    .replace(/(signature=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(X-MBX-APIKEY[=: ]+)[^&\s]+/gi, "$1[redacted]")
    .replace(/(BINANCE_READONLY_API_(?:KEY|SECRET)[=: ]+)[^&\s]+/gi, "$1[redacted]")
    .slice(0, 280);
}

async function parseResponse(response: Response) {
  const text = await response.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const payload = data && typeof data === "object" ? data as { code?: unknown; msg?: unknown } : {};
    const code = typeof payload.code === "number" || typeof payload.code === "string" ? String(payload.code) : "HTTP_ERROR";
    const rawMessage = typeof payload.msg === "string" ? payload.msg : `Binance returned HTTP ${response.status}.`;
    throw new BinanceReadonlyError(sanitizeBinanceMessage(rawMessage), code, response.status);
  }
  return data;
}

async function publicRequest<T>(base: string, path: string): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  return await parseResponse(response) as T;
}

async function serverTimestamp() {
  try {
    const value = await publicRequest<{ serverTime?: unknown }>(SPOT_BASE, "/api/v3/time");
    return typeof value.serverTime === "number" ? value.serverTime : Date.now();
  } catch {
    return Date.now();
  }
}

async function signedRequest<T>(options: {
  base?: string;
  path: string;
  method?: "GET" | "POST";
  params?: Record<string, QueryValue>;
  timestamp: number;
}): Promise<T> {
  const key = process.env.BINANCE_READONLY_API_KEY;
  const secret = process.env.BINANCE_READONLY_API_SECRET;
  if (!key || !secret) throw new BinanceReadonlyError("Binance read-only credentials are not configured.", "NOT_CONFIGURED", 503);

  const method = options.method ?? "GET";
  const query = canonicalQuery({ ...(options.params ?? {}), recvWindow: 5000, timestamp: options.timestamp });
  const signed = `${query}&signature=${signCanonicalQuery(query, secret)}`;
  const base = options.base ?? SPOT_BASE;
  const response = await fetch(method === "GET" ? `${base}${options.path}?${signed}` : `${base}${options.path}`, {
    method,
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "X-MBX-APIKEY": key,
    },
    body: method === "POST" ? signed : undefined,
  });
  return await parseResponse(response) as T;
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanAsset(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function normalizeSpot(data: unknown): NormalizedBinanceBalance[] {
  const balances = data && typeof data === "object" && Array.isArray((data as { balances?: unknown }).balances)
    ? (data as { balances: Array<{ asset?: unknown; free?: unknown; locked?: unknown }> }).balances : [];
  return balances.flatMap((item) => {
    const asset = cleanAsset(item.asset);
    const available = number(item.free);
    const total = available + number(item.locked);
    return asset && total !== 0 ? [{ source: "spot" as const, asset, available, total }] : [];
  });
}

export function normalizeFunding(data: unknown): NormalizedBinanceBalance[] {
  const rows = Array.isArray(data) ? data as Array<{ asset?: unknown; free?: unknown; locked?: unknown; freeze?: unknown; withdrawing?: unknown }> : [];
  return rows.flatMap((item) => {
    const asset = cleanAsset(item.asset);
    const available = number(item.free);
    const total = available + number(item.locked) + number(item.freeze) + number(item.withdrawing);
    return asset && total !== 0 ? [{ source: "funding" as const, asset, available, total }] : [];
  });
}

export function normalizeFutures(data: unknown): NormalizedBinanceBalance[] {
  const rows = Array.isArray(data) ? data as Array<{ asset?: unknown; availableBalance?: unknown; balance?: unknown }> : [];
  return rows.flatMap((item) => {
    const asset = cleanAsset(item.asset);
    const available = number(item.availableBalance);
    const total = number(item.balance);
    return asset && total !== 0 ? [{ source: "futures" as const, asset, available, total }] : [];
  });
}

export function normalizeEarn(data: unknown): NormalizedBinanceBalance[] {
  const rows = data && typeof data === "object" && Array.isArray((data as { rows?: unknown }).rows)
    ? (data as { rows: Array<{ asset?: unknown; totalAmount?: unknown; amount?: unknown; canRedeem?: unknown }> }).rows : [];
  return rows.flatMap((item) => {
    const asset = cleanAsset(item.asset);
    const total = number(item.totalAmount ?? item.amount);
    const available = item.canRedeem === false ? 0 : total;
    return asset && total !== 0 ? [{ source: "earn" as const, asset, available, total }] : [];
  });
}

export function normalizeMargin(data: unknown): NormalizedBinanceBalance[] {
  const rows = data && typeof data === "object" && Array.isArray((data as { userAssets?: unknown }).userAssets)
    ? (data as { userAssets: Array<{ asset?: unknown; free?: unknown; netAsset?: unknown }> }).userAssets : [];
  return rows.flatMap((item) => {
    const asset = cleanAsset(item.asset);
    const available = number(item.free);
    const total = number(item.netAsset);
    return asset && total !== 0 ? [{ source: "margin" as const, asset, available, total }] : [];
  });
}

export function aggregateRawBalances(rows: NormalizedBinanceBalance[]) {
  const aggregated = new Map<string, NormalizedBinanceBalance>();
  for (const row of rows) {
    const key = `${row.source}:${row.asset}`;
    const current = aggregated.get(key);
    aggregated.set(key, current ? { ...current, available: current.available + row.available, total: current.total + row.total } : { ...row });
  }
  return [...aggregated.values()];
}

function tickerMap(data: unknown) {
  const rows = Array.isArray(data) ? data as Ticker[] : [];
  return new Map(rows.flatMap((row) => {
    const symbol = cleanAsset(row.symbol);
    const price = number(row.price);
    return symbol && price > 0 ? [[symbol, price] as const] : [];
  }));
}

export function estimateAssetPrice(asset: string, prices: Map<string, number>): { price: number | null; valuation: BinanceBalance["valuation"] } {
  if (STABLECOINS.has(asset)) return { price: 1, valuation: "stablecoin" };
  for (const quote of ["USDT", "USDC", "FDUSD"]) {
    const direct = prices.get(`${asset}${quote}`);
    if (direct) return { price: direct, valuation: "direct" };
  }
  for (const quote of ["BTC", "ETH", "BNB"]) {
    const assetQuote = prices.get(`${asset}${quote}`);
    const quoteUsd = prices.get(`${quote}USDT`);
    if (assetQuote && quoteUsd) return { price: assetQuote * quoteUsd, valuation: "derived" };
  }
  return { price: null, valuation: "unavailable" };
}

function formatAmount(value: number) {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(8).replace(/\.?0+$/, "");
}

export function valueBalances(rows: NormalizedBinanceBalance[], prices: Map<string, number>, dustThresholdUsd = DEFAULT_DUST_THRESHOLD_USD): BinanceBalance[] {
  return aggregateRawBalances(rows).flatMap((row) => {
    const estimate = estimateAssetPrice(row.asset, prices);
    const usdValue = estimate.price === null ? null : row.total * estimate.price;
    if (usdValue !== null && Math.abs(usdValue) < dustThresholdUsd) return [];
    return [{
      id: `${row.source}:${row.asset}`,
      source: row.source,
      sourceLabel: SOURCE_LABELS[row.source],
      asset: row.asset,
      available: formatAmount(row.available),
      total: formatAmount(row.total),
      usdValue,
      priceUsd: estimate.price,
      valuation: estimate.valuation,
    }];
  }).sort((left, right) => (right.usdValue ?? -Infinity) - (left.usdValue ?? -Infinity) || left.asset.localeCompare(right.asset));
}

function friendlySourceError(error: unknown) {
  if (error instanceof BinanceReadonlyError) {
    if (["-2014", "-2015"].includes(error.code)) return "Unavailable for this API key, IP restriction, or permission set.";
    if (error.code === "-1021") return "Binance rejected the request timestamp. Retry after checking server time.";
    return sanitizeBinanceMessage(error.message);
  }
  return "This Binance account source is temporarily unavailable.";
}

async function loadEarn(timestamp: number): Promise<BinanceSourceLoad> {
  const requests = await Promise.allSettled([
    signedRequest<unknown>({ path: "/sapi/v1/simple-earn/flexible/position", params: { current: 1, size: 100 }, timestamp }),
    signedRequest<unknown>({ path: "/sapi/v1/simple-earn/locked/position", params: { current: 1, size: 100 }, timestamp }),
  ]);
  const balances = requests.flatMap((result) => result.status === "fulfilled" ? normalizeEarn(result.value) : []);
  const failed = requests.filter((result) => result.status === "rejected");
  if (failed.length === requests.length) throw failed[0].reason;
  return { balances, message: failed.length ? "Some Simple Earn positions could not be loaded." : undefined };
}

async function loadSource(source: BinancePortfolioSource, timestamp: number): Promise<BinanceSourceLoad> {
  if (source === "spot") return { balances: normalizeSpot(await signedRequest({ path: "/api/v3/account", params: { omitZeroBalances: true }, timestamp })) };
  if (source === "funding") return { balances: normalizeFunding(await signedRequest({ path: "/sapi/v1/asset/get-funding-asset", method: "POST", timestamp })) };
  if (source === "futures") return { balances: normalizeFutures(await signedRequest({ base: FUTURES_BASE, path: "/fapi/v3/balance", timestamp })) };
  if (source === "earn") return await loadEarn(timestamp);
  return { balances: normalizeMargin(await signedRequest({ path: "/sapi/v1/margin/account", timestamp })) };
}

export function combineSourceResults(
  sourceNames: BinancePortfolioSource[],
  results: PromiseSettledResult<BinanceSourceLoad>[],
) {
  const rawBalances: NormalizedBinanceBalance[] = [];
  const sources: BinanceSourceHealth[] = results.map((result, index) => {
    const source = sourceNames[index];
    if (result.status === "rejected") {
      return { source, label: SOURCE_LABELS[source], state: "unavailable", itemCount: 0, message: friendlySourceError(result.reason) };
    }
    rawBalances.push(...result.value.balances);
    return {
      source,
      label: SOURCE_LABELS[source],
      state: result.value.balances.length ? "available" : "empty",
      itemCount: result.value.balances.length,
      message: result.value.message,
    };
  });
  return { rawBalances, sources };
}

export async function loadBinancePortfolio(): Promise<BinancePortfolio> {
  const status = getBinanceAccountStatus();
  const dustThreshold = Math.max(0, number(process.env.BINANCE_PORTFOLIO_DUST_USD || DEFAULT_DUST_THRESHOLD_USD));
  if (!status.configured) {
    return {
      configured: false,
      connection: "not_configured",
      readOnly: true,
      refreshedAt: null,
      estimatedTotalUsd: 0,
      pricedAssetCount: 0,
      unpricedAssetCount: 0,
      dustThresholdUsd: dustThreshold,
      balances: [],
      sources: (Object.keys(SOURCE_LABELS) as BinancePortfolioSource[]).map((source) => ({ source, label: SOURCE_LABELS[source], state: "unavailable", itemCount: 0, message: "Read-only credentials are not configured." })),
    };
  }

  const timestamp = await serverTimestamp();
  const sourceNames = Object.keys(SOURCE_LABELS) as BinancePortfolioSource[];
  const results = await Promise.allSettled(sourceNames.map((source) => loadSource(source, timestamp)));
  const { rawBalances, sources } = combineSourceResults(sourceNames, results);

  let prices = new Map<string, number>();
  try { prices = tickerMap(await publicRequest<unknown>(SPOT_BASE, "/api/v3/ticker/price")); } catch { /* balances remain visible without estimates */ }
  const balances = valueBalances(rawBalances, prices, dustThreshold);
  const successfulSources = sources.filter((source) => source.state === "available" || source.state === "empty").length;
  const failedSources = sources.length - successfulSources;
  const estimatedTotalUsd = balances.reduce((sum, balance) => sum + (balance.usdValue ?? 0), 0);
  return {
    configured: true,
    connection: successfulSources === 0 ? "error" : failedSources ? "partial" : "connected",
    readOnly: true,
    refreshedAt: new Date().toISOString(),
    estimatedTotalUsd,
    pricedAssetCount: balances.filter((balance) => balance.usdValue !== null).length,
    unpricedAssetCount: balances.filter((balance) => balance.usdValue === null).length,
    dustThresholdUsd: dustThreshold,
    balances,
    sources,
  };
}
