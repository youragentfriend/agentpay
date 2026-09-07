import { createHash, createSign, createVerify, randomBytes } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import type { OnchainPayCapability, OnchainPayCatalog, OnchainPayNetwork, OnchainPayOrder, OnchainPayPrepareInput, OnchainPayOrderStatus } from "@/lib/onchain-pay-types";
import { createOnchainPayOrder, findRecentActiveOnchainPayOrder, getOnchainPayOrder, getOnchainPayOrderByExternalId, updateOnchainPayOrder } from "@/lib/server/onchain-pay-store";
import { enforcePaymentPolicy, multiplyDecimalStrings, PaymentPolicyError } from "@/lib/server/payment-policy";

const API_PATHS = {
  networks: "papi/v1/ramp/connect/crypto-network",
  tradingPairs: "papi/v1/ramp/connect/buy/trading-pairs",
  preOrder: "papi/v1/ramp/connect/buy/pre-order",
  order: "papi/v1/ramp/connect/order",
} as const;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;
const STABLECOINS = new Set(["USD", "USDT", "USDC", "FDUSD", "BUSD", "DAI", "USD1"]);

const PREVIEW_CATALOG: OnchainPayCatalog = {
  source: "documented-preview",
  fetchedAt: "2026-09-07T00:00:00.000Z",
  warning: "Preview examples only. Live Binance partner access is required to confirm current asset, network, fee, and limit availability.",
  assets: [
    { asset: "BNB", networks: [{ asset: "BNB", network: "BSC", addressRegex: "^0x[0-9A-Fa-f]{40}$", withdrawFee: "0.0005", withdrawMinAmount: "0.01", withdrawMaxAmount: "100000", withdrawEnabled: true, depositEnabled: true }] },
    { asset: "BTC", networks: [{ asset: "BTC", network: "BTC", addressRegex: "^(bc1|[13])[A-Za-z0-9]{20,80}$", withdrawFee: "0.0001", withdrawMinAmount: "0.0002", withdrawMaxAmount: "1000", withdrawEnabled: true, depositEnabled: true }] },
    { asset: "ETH", networks: [{ asset: "ETH", network: "ETH", addressRegex: "^0x[0-9A-Fa-f]{40}$", withdrawFee: "0.001", withdrawMinAmount: "0.002", withdrawMaxAmount: "100000", withdrawEnabled: true, depositEnabled: true }, { asset: "ETH", network: "BSC", addressRegex: "^0x[0-9A-Fa-f]{40}$", withdrawFee: "0.0005", withdrawMinAmount: "0.001", withdrawMaxAmount: "100000", withdrawEnabled: true, depositEnabled: true }] },
    { asset: "SOL", networks: [{ asset: "SOL", network: "SOL", addressRegex: "^[1-9A-HJ-NP-Za-km-z]{32,44}$", withdrawFee: "0.01", withdrawMinAmount: "0.02", withdrawMaxAmount: "100000", withdrawEnabled: true, depositEnabled: true }] },
    { asset: "USDT", networks: [{ asset: "USDT", network: "BSC", addressRegex: "^0x[0-9A-Fa-f]{40}$", withdrawFee: "0.1", withdrawMinAmount: "0.2", withdrawMaxAmount: "10000000", withdrawEnabled: true, depositEnabled: true }, { asset: "USDT", network: "ETH", addressRegex: "^0x[0-9A-Fa-f]{40}$", withdrawFee: "3", withdrawMinAmount: "5", withdrawMaxAmount: "10000000", withdrawEnabled: true, depositEnabled: true }] },
    { asset: "USDC", networks: [{ asset: "USDC", network: "BSC", addressRegex: "^0x[0-9A-Fa-f]{40}$", withdrawFee: "0.1", withdrawMinAmount: "0.2", withdrawMaxAmount: "10000000", withdrawEnabled: true, depositEnabled: true }, { asset: "USDC", network: "SOL", addressRegex: "^[1-9A-HJ-NP-Za-km-z]{32,44}$", withdrawFee: "0.1", withdrawMinAmount: "0.2", withdrawMaxAmount: "10000000", withdrawEnabled: true, depositEnabled: true }] },
  ],
};

export class OnchainPayError extends Error {
  constructor(message: string, public readonly code = "ONCHAIN_PAY_ERROR", public readonly status = 400) { super(message); this.name = "OnchainPayError"; }
}
export function onchainPayErrorResponse(error: unknown): Response {
  const value = error instanceof OnchainPayError ? error : error instanceof PaymentPolicyError ? new OnchainPayError(error.message, error.code, 403) : new OnchainPayError("Onchain Pay operation failed.", "ONCHAIN_PAY_ERROR", 500);
  return Response.json({ error: value.message, code: value.code }, { status: value.status });
}

function configuration() {
  return {
    baseUrl: process.env.ONCHAIN_PAY_BASE_URL?.trim(), clientId: process.env.ONCHAIN_PAY_CLIENT_ID?.trim(),
    accessToken: process.env.ONCHAIN_PAY_SIGN_ACCESS_TOKEN?.trim(), privateKeyPath: process.env.ONCHAIN_PAY_PRIVATE_KEY_PATH?.trim(),
    webhookPublicKeyPath: process.env.ONCHAIN_PAY_WEBHOOK_PUBLIC_KEY_PATH?.trim(),
    redirectUrl: process.env.ONCHAIN_PAY_REDIRECT_URL?.trim(), failRedirectUrl: process.env.ONCHAIN_PAY_FAIL_REDIRECT_URL?.trim(),
    merchantDisplayName: process.env.ONCHAIN_PAY_MERCHANT_DISPLAY_NAME?.trim(),
  };
}
function validateBaseUrl(value?: string): URL {
  if (!value) throw new OnchainPayError("Binance Onchain Pay partner access is not configured.", "ONCHAIN_PAY_CONFIG_REQUIRED", 503);
  let url: URL; try { url = new URL(value); } catch { throw new OnchainPayError("Onchain Pay base URL is invalid.", "INVALID_ONCHAIN_PAY_BASE_URL", 503); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new OnchainPayError("Onchain Pay base URL must be a credential-free HTTPS URL.", "INVALID_ONCHAIN_PAY_BASE_URL", 503);
  return url;
}

export async function getOnchainPayCapability(): Promise<OnchainPayCapability> {
  const config = configuration(); const missing: string[] = [];
  if (!config.baseUrl) missing.push("ONCHAIN_PAY_BASE_URL"); else { try { validateBaseUrl(config.baseUrl); } catch { missing.push("ONCHAIN_PAY_BASE_URL"); } }
  if (!config.clientId) missing.push("ONCHAIN_PAY_CLIENT_ID");
  if (!config.accessToken) missing.push("ONCHAIN_PAY_SIGN_ACCESS_TOKEN");
  if (!config.privateKeyPath) missing.push("ONCHAIN_PAY_PRIVATE_KEY_PATH"); else { try { await access(config.privateKeyPath); } catch { missing.push("ONCHAIN_PAY_PRIVATE_KEY_PATH"); } }
  let webhookReady = false;
  if (config.webhookPublicKeyPath) { try { await access(config.webhookPublicKeyPath); webhookReady = true; } catch { webhookReady = false; } }
  const configured = missing.length === 0;
  return { configured, liveDiscoveryEnabled: configured, executionEnabled: configured && process.env.AGENTPAY_ENABLE_ONCHAIN_PAY === "true", webhookReady, missing, mode: configured ? "live" : "preview", message: configured ? "Binance Onchain Pay partner access is configured." : "Preview mode uses documented examples. Live availability and order creation require approved Binance partner access." };
}

async function providerRequest<T>(apiPath: string, body: Record<string, unknown> = {}): Promise<T> {
  const config = configuration(); const baseUrl = validateBaseUrl(config.baseUrl);
  if (!config.clientId || !config.accessToken || !config.privateKeyPath) throw new OnchainPayError("Binance Onchain Pay partner access is not configured.", "ONCHAIN_PAY_CONFIG_REQUIRED", 503);
  const timestamp = String(Date.now()); const jsonBody = Object.keys(body).length ? JSON.stringify(body) : "";
  const privateKey = await readFile(config.privateKeyPath, "utf8");
  const signer = createSign("RSA-SHA256"); signer.update(`${jsonBody}${timestamp}`); signer.end();
  const signature = signer.sign(privateKey, "base64");
  const endpoint = new URL(apiPath.replace(/^\/+/, ""), `${baseUrl.toString().replace(/\/?$/, "/")}`);
  if (endpoint.origin !== baseUrl.origin) throw new OnchainPayError("Onchain Pay request host did not match configured Binance base URL.", "ONCHAIN_PAY_HOST_MISMATCH", 500);
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000), headers: { "Content-Type": "application/json", "X-Tesla-ClientId": config.clientId, "X-Tesla-SignAccessToken": config.accessToken, "X-Tesla-Signature": signature, "X-Tesla-Timestamp": timestamp, "User-Agent": "agentpay-onchain-pay/1.0" }, body: jsonBody || undefined });
  } catch { throw new OnchainPayError("Binance Onchain Pay could not be reached.", "ONCHAIN_PAY_NETWORK_ERROR", 502); }
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_RESPONSE_BYTES) throw new OnchainPayError("Binance Onchain Pay response was too large.", "ONCHAIN_PAY_RESPONSE_TOO_LARGE", 502);
  const text = await response.text(); if (text.length > MAX_RESPONSE_BYTES) throw new OnchainPayError("Binance Onchain Pay response was too large.", "ONCHAIN_PAY_RESPONSE_TOO_LARGE", 502);
  let parsed: { success?: boolean; code?: string; message?: string; data?: T };
  try { parsed = JSON.parse(text) as typeof parsed; } catch { throw new OnchainPayError("Binance Onchain Pay returned an invalid response.", "INVALID_ONCHAIN_PAY_RESPONSE", 502); }
  if (!response.ok || parsed.success !== true || parsed.data === undefined) throw new OnchainPayError(typeof parsed.message === "string" ? parsed.message : "Binance Onchain Pay rejected the request.", parsed.code || "ONCHAIN_PAY_REJECTED", response.ok ? 400 : 502);
  return parsed.data;
}

function stringValue(value: unknown, fallback = "0"): string { return typeof value === "string" || typeof value === "number" ? String(value) : fallback; }
function normalizeNetworkData(data: unknown): OnchainPayCatalog {
  if (!Array.isArray(data)) throw new OnchainPayError("Binance returned an invalid network catalog.", "INVALID_ONCHAIN_PAY_CATALOG", 502);
  const assets = data.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>; const asset = typeof row.cryptoCurrency === "string" ? row.cryptoCurrency.toUpperCase() : "";
    if (!asset || !Array.isArray(row.networks)) return [];
    const networks = row.networks.flatMap((candidate): OnchainPayNetwork[] => {
      if (!candidate || typeof candidate !== "object") return [];
      const network = candidate as Record<string, unknown>; const name = typeof network.network === "string" ? network.network.toUpperCase() : "";
      if (!name) return [];
      const rawAddressRegex = network.addressRegex; const addressRegex = typeof rawAddressRegex === "string" ? rawAddressRegex : Array.isArray(rawAddressRegex) && typeof rawAddressRegex[0] === "string" ? rawAddressRegex[0] : undefined;
      return [{ asset, network: name, addressRegex, memoRegex: typeof network.memoRegex === "string" ? network.memoRegex : undefined, withdrawFee: stringValue(network.withdrawFee), withdrawMinAmount: stringValue(network.withdrawMinAmount), withdrawMaxAmount: stringValue(network.withdrawMaxAmount, "999999999"), contractAddress: typeof network.contractAddress === "string" ? network.contractAddress : undefined, withdrawEnabled: network.withdrawEnable === true, depositEnabled: network.depositEnable === true }];
    });
    return networks.length ? [{ asset, networks }] : [];
  }).sort((a, b) => a.asset.localeCompare(b.asset));
  if (!assets.length) throw new OnchainPayError("Binance returned no supported Onchain Pay networks.", "EMPTY_ONCHAIN_PAY_CATALOG", 502);
  return { assets, source: "live-binance", fetchedAt: new Date().toISOString() };
}

export async function getOnchainPayCatalog(): Promise<OnchainPayCatalog> {
  const capability = await getOnchainPayCapability();
  if (!capability.configured) return { ...PREVIEW_CATALOG, assets: PREVIEW_CATALOG.assets.map(row => ({ ...row, networks: row.networks.map(network => ({ ...network })) })) };
  return normalizeNetworkData(await providerRequest<unknown>(API_PATHS.networks));
}

function decimalUnits(value: string): bigint { const [whole, fraction = ""] = value.split("."); return BigInt(`${whole}${fraction.padEnd(8, "0")}`); }
function unitsDecimal(value: bigint): string { const raw = value.toString().padStart(9, "0"); return `${raw.slice(0, -8)}.${raw.slice(-8)}`.replace(/\.?0+$/, "") || "0"; }
function assertAmount(amount: string, network: OnchainPayNetwork): string {
  const value = amount.trim(); if (!DECIMAL.test(value) || Number(value) <= 0) throw new OnchainPayError("Enter a positive amount with no more than 8 decimal places.", "INVALID_ONCHAIN_PAY_AMOUNT");
  if (DECIMAL.test(network.withdrawMinAmount) && decimalUnits(value) < decimalUnits(network.withdrawMinAmount)) throw new OnchainPayError(`Minimum ${network.asset} withdrawal on ${network.network} is ${network.withdrawMinAmount}.`, "ONCHAIN_PAY_BELOW_MINIMUM");
  if (DECIMAL.test(network.withdrawMaxAmount) && decimalUnits(value) > decimalUnits(network.withdrawMaxAmount)) throw new OnchainPayError(`Maximum ${network.asset} withdrawal on ${network.network} is ${network.withdrawMaxAmount}.`, "ONCHAIN_PAY_ABOVE_MAXIMUM");
  return value;
}
function safeRegex(pattern: string | undefined, value: string): boolean {
  if (!pattern || pattern.length > 500 || value.length > 256) return !pattern;
  try { return new RegExp(pattern).test(value); } catch { return false; }
}
function validateRecipient(address: string, memo: string | undefined, network: OnchainPayNetwork): { address: string; memo?: string } {
  const normalizedAddress = address.trim(); if (!normalizedAddress || normalizedAddress.length > 256 || !safeRegex(network.addressRegex, normalizedAddress)) throw new OnchainPayError(`Enter a valid ${network.network} destination address.`, "INVALID_ONCHAIN_PAY_ADDRESS");
  const normalizedMemo = memo?.trim() || undefined;
  if (network.memoRegex && !normalizedMemo) throw new OnchainPayError(`${network.network} requires a destination memo or tag.`, "ONCHAIN_PAY_MEMO_REQUIRED");
  if (normalizedMemo && (normalizedMemo.length > 120 || (network.memoRegex && !safeRegex(network.memoRegex, normalizedMemo)))) throw new OnchainPayError(`Enter a valid ${network.network} memo or destination tag.`, "INVALID_ONCHAIN_PAY_MEMO");
  return { address: normalizedAddress, memo: normalizedMemo };
}
async function assetUsdAmount(asset: string, amount: string): Promise<string | undefined> {
  if (STABLECOINS.has(asset)) return amount;
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(`${asset}USDT`)}`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return undefined; const data = await response.json() as { price?: unknown };
    return multiplyDecimalStrings(amount, typeof data.price === "string" ? data.price : "");
  } catch { return undefined; }
}
function fingerprint(input: { asset: string; network: string; address: string; memo?: string; amount: string; netReceive: boolean }): string { return createHash("sha256").update(JSON.stringify(input)).digest("hex"); }
function externalOrderId(): string { return `agentpay${Date.now()}${randomBytes(4).toString("hex")}`; }

export async function prepareOnchainPayOrder(input: OnchainPayPrepareInput): Promise<OnchainPayOrder> {
  const catalog = await getOnchainPayCatalog(); const asset = input.asset.trim().toUpperCase(), networkName = input.network.trim().toUpperCase();
  const network = catalog.assets.find(row => row.asset === asset)?.networks.find(row => row.network === networkName);
  if (!network || !network.withdrawEnabled) throw new OnchainPayError("Choose a currently supported asset and withdrawal network.", "UNSUPPORTED_ONCHAIN_PAY_ROUTE");
  const amount = assertAmount(input.amount, network); const recipient = validateRecipient(input.address, input.memo, network); const netReceive = input.netReceive === true;
  const fee = DECIMAL.test(network.withdrawFee) ? network.withdrawFee : "0"; const amountUnits = decimalUnits(amount), feeUnits = decimalUnits(fee);
  if (!netReceive && amountUnits <= feeUnits) throw new OnchainPayError("Amount must be greater than the estimated network fee.", "ONCHAIN_PAY_AMOUNT_BELOW_FEE");
  const expectedReceive = netReceive ? amount : unitsDecimal(amountUnits - feeUnits);
  const normalized = { asset, network: networkName, address: recipient.address, memo: recipient.memo, amount, netReceive };
  const requestFingerprint = fingerprint(normalized); const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const duplicate = findRecentActiveOnchainPayOrder(requestFingerprint, since);
  if (duplicate) throw new OnchainPayError(`A matching Onchain Pay order is already ${duplicate.status.replaceAll("-", " ")}.`, "DUPLICATE_ONCHAIN_PAY_ORDER", 409);
  return createOnchainPayOrder({ externalOrderId: externalOrderId(), fingerprint: requestFingerprint, status: "prepared", asset, network: networkName, address: recipient.address, memo: recipient.memo, amount, withdrawFee: fee, netReceive, expectedReceive, catalogSource: catalog.source, amountUsd: await assetUsdAmount(asset, amount) });
}

export function approveOnchainPayOrder(id: string): OnchainPayOrder {
  const order = getOnchainPayOrder(id); if (order.status !== "prepared") throw new OnchainPayError("Only a prepared Onchain Pay order can be approved.", "INVALID_ONCHAIN_PAY_STATUS", 409);
  enforcePaymentPolicy({ rail: "binance-onchain", amountUsd: order.amountUsd, destination: order.address });
  return updateOnchainPayOrder(id, { status: "approved", errorMessage: undefined });
}

export async function createOnchainPayOrderLink(id: string): Promise<OnchainPayOrder> {
  const order = getOnchainPayOrder(id); if (order.status !== "approved") throw new OnchainPayError("Review and approve this Onchain Pay order first.", "INVALID_ONCHAIN_PAY_STATUS", 409);
  if (process.env.AGENTPAY_ENABLE_ONCHAIN_PAY !== "true") throw new OnchainPayError("Onchain Pay execution is disabled on this server.", "ONCHAIN_PAY_EXECUTION_DISABLED", 403);
  const capability = await getOnchainPayCapability(); if (!capability.configured || order.catalogSource !== "live-binance") throw new OnchainPayError("Live Binance Onchain Pay partner access is required.", "ONCHAIN_PAY_CONFIG_REQUIRED", 503);
  enforcePaymentPolicy({ rail: "binance-onchain", amountUsd: order.amountUsd, destination: order.address });
  const config = configuration(); const customization: Record<string, unknown> = { SEND_PRIMARY: true, LOCK_ORDER_ATTRIBUTES: [6] };
  if (order.netReceive) customization.NET_RECEIVE = true;
  if (config.merchantDisplayName) customization.MERCHANT_DISPLAY_NAME = config.merchantDisplayName;
  const data = await providerRequest<{ link?: unknown; linkExpireTime?: unknown }>(API_PATHS.preOrder, {
    externalOrderId: order.externalOrderId, cryptoCurrency: order.asset, amountType: 2, requestedAmount: order.amount,
    network: order.network, address: order.address, ...(order.memo ? { memo: order.memo } : {}),
    ...(config.redirectUrl ? { redirectUrl: config.redirectUrl } : {}), ...(config.failRedirectUrl ? { failRedirectUrl: config.failRedirectUrl } : {}), customization,
  });
  if (typeof data.link !== "string" || !data.link.startsWith("https://")) throw new OnchainPayError("Binance returned no secure order link.", "INVALID_ONCHAIN_PAY_ORDER_LINK", 502);
  const link = new URL(data.link); if (link.hostname !== "binance.com" && !link.hostname.endsWith(".binance.com")) throw new OnchainPayError("Binance returned an untrusted order-link host.", "UNTRUSTED_ONCHAIN_PAY_ORDER_LINK", 502);
  return updateOnchainPayOrder(id, { status: "link-created", orderLink: link.toString(), linkExpireTime: data.linkExpireTime === undefined ? undefined : String(data.linkExpireTime) });
}

const STATUS_MAP: Record<number, OnchainPayOrderStatus> = { 0: "waiting-for-binance", 1: "on-ramp-processing", 2: "on-ramp-completed", 3: "convert-processing", 4: "convert-completed", 10: "withdraw-initiated", 11: "withdraw-processing", 20: "completed", 93: "abandoned", 94: "failed", 96: "abandoned", 97: "failed", 98: "failed", 99: "failed" };
function applyProviderOrder(order: OnchainPayOrder, data: Record<string, unknown>): OnchainPayOrder {
  const providerStatus = Number(data.status); const status = STATUS_MAP[providerStatus] || "unknown"; const completedAt = status === "completed" ? new Date().toISOString() : order.completedAt;
  return updateOnchainPayOrder(order.id, { status, providerStatus: Number.isFinite(providerStatus) ? providerStatus : undefined, txHash: typeof data.withdrawTxHash === "string" && data.withdrawTxHash ? data.withdrawTxHash : order.txHash, providerOrderDetailLink: typeof data.orderDetailLink === "string" ? data.orderDetailLink : order.providerOrderDetailLink, withdrawFee: stringValue(data.networkFee, order.withdrawFee), amount: stringValue(data.cryptoAmount, order.amount), completedAt, errorMessage: status === "failed" ? "Binance reported that this Onchain Pay order failed." : undefined });
}
export async function refreshOnchainPayOrder(id: string): Promise<OnchainPayOrder> {
  const order = getOnchainPayOrder(id); if (!order.orderLink && !order.providerStatus) throw new OnchainPayError("This order has not been submitted to Binance.", "INVALID_ONCHAIN_PAY_STATUS", 409);
  return applyProviderOrder(order, await providerRequest<Record<string, unknown>>(API_PATHS.order, { externalOrderId: order.externalOrderId }));
}

export async function processOnchainPayWebhook(rawBody: string, headers: Headers): Promise<OnchainPayOrder> {
  const config = configuration(); if (!config.webhookPublicKeyPath) throw new OnchainPayError("Onchain Pay webhook verification is not configured.", "ONCHAIN_PAY_WEBHOOK_NOT_READY", 503);
  const timestamp = headers.get("x-bn-connect-timestamp") || "", signature = headers.get("x-bn-connect-signature") || "", recipient = headers.get("x-bn-connect-for") || "";
  if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 5 * 60_000) throw new OnchainPayError("Onchain Pay webhook timestamp is invalid or expired.", "INVALID_ONCHAIN_PAY_WEBHOOK", 401);
  if (!signature || (config.clientId && recipient !== config.clientId)) throw new OnchainPayError("Onchain Pay webhook identity is invalid.", "INVALID_ONCHAIN_PAY_WEBHOOK", 401);
  const verifier = createVerify("RSA-SHA256"); verifier.update(`${rawBody}${timestamp}`); verifier.end();
  if (!verifier.verify(await readFile(config.webhookPublicKeyPath, "utf8"), signature, "base64")) throw new OnchainPayError("Onchain Pay webhook signature is invalid.", "INVALID_ONCHAIN_PAY_WEBHOOK", 401);
  let data: Record<string, unknown>; try { data = JSON.parse(rawBody) as Record<string, unknown>; } catch { throw new OnchainPayError("Onchain Pay webhook body is invalid.", "INVALID_ONCHAIN_PAY_WEBHOOK", 400); }
  if (data.webhookEventType !== "connect_order_event" || typeof data.externalOrderId !== "string") throw new OnchainPayError("Unsupported Onchain Pay webhook event.", "INVALID_ONCHAIN_PAY_WEBHOOK", 400);
  return applyProviderOrder(getOnchainPayOrderByExternalId(data.externalOrderId), data);
}
