import type { GasLevel, PreparedTransfer } from "@/lib/payment-workflow";
import { AgenticWalletError, getWalletLockStatus, getWalletOverview, getWalletTransactionStatus, sendWalletTransfer } from "@/lib/server/agentic-wallet";
import { PaymentIntentError, prepareTransfer } from "@/lib/server/payment-intents";
import { enforcePaymentPolicy, PaymentPolicyError } from "@/lib/server/payment-policy";
import { approvePaymentIntent, createPaymentIntent, getPaymentIntent, markPaymentConfirmed, markPaymentFailed, markPaymentSubmitted, markPaymentSubmitting } from "@/lib/server/payment-store";
import { assertPaymentExecutionAllowed, PaymentExecutionError } from "@/lib/server/payment-execution";
import type { WalletOverview } from "@/lib/wallet-types";

const NETWORK_ALIASES: Record<string, string> = {
  bnb: "56", bsc: "56", bnbsmartchain: "56", binancesmartchain: "56",
  eth: "1", ethereum: "1",
  base: "8453",
  polygon: "137", matic: "137",
  arbitrum: "42161", arbitrumone: "42161", arb: "42161",
  solana: "CT_501", sol: "CT_501",
};

function normalizedNetwork(value: string) {
  return value.toLowerCase().replace(/\b(network|chain)\b/g, "").replace(/[^a-z0-9]/g, "");
}

function paymentError(error: unknown, fallback: string, code: string) {
  if (error instanceof PaymentIntentError || error instanceof PaymentPolicyError) return error;
  if (error instanceof PaymentExecutionError) return new PaymentIntentError(error.message, error.code);
  if (error instanceof AgenticWalletError) return new PaymentIntentError(error.message, error.code);
  return new PaymentIntentError(fallback, code);
}

export function resolveAssistantWalletSelection(wallet: WalletOverview, requestedAsset: string, requestedNetwork: string) {
  const asset = requestedAsset.trim().toUpperCase();
  const network = requestedNetwork.trim();
  if (!asset) throw new PaymentIntentError("Tell me which asset to send.", "ASSET_REQUIRED");
  if (!network) throw new PaymentIntentError("Tell me which network to use.", "CHAIN_REQUIRED");
  const normalized = normalizedNetwork(network);
  const aliasId = NETWORK_ALIASES[normalized];
  const chain = wallet.chains.find(candidate => candidate.binanceChainId === network
    || candidate.binanceChainId === aliasId
    || [candidate.name, candidate.simpleName].some(name => normalizedNetwork(name) === normalized));
  if (!chain) throw new PaymentIntentError(`I could not match “${network}” to a network supported by Agentic Wallet.`, "UNSUPPORTED_CHAIN");
  const balance = wallet.balances.find(candidate => candidate.symbol.toUpperCase() === asset && candidate.binanceChainId === chain.binanceChainId);
  if (!balance) throw new PaymentIntentError(`${asset} is not available on ${chain.name} in this Agentic Wallet.`, "ASSET_NOT_AVAILABLE");
  return { asset, chain, balance };
}

export async function prepareAssistantWalletTransfer(parameters: Record<string, string>): Promise<PreparedTransfer> {
  try {
    const wallet = await getWalletOverview();
    const { chain, balance } = resolveAssistantWalletSelection(wallet, parameters.asset || "", parameters.network || "");
    const gas = (parameters.gasPriority || "MEDIUM").trim().toUpperCase();
    if (!["LOW", "MEDIUM", "HIGH"].includes(gas)) throw new PaymentIntentError("Gas priority must be LOW, MEDIUM, or HIGH.", "INVALID_GAS_LEVEL");
    const prepared = prepareTransfer({
      amount: parameters.amount,
      recipient: parameters.recipient,
      tokenAddress: balance.address,
      binanceChainId: chain.binanceChainId,
      gasLevel: gas as GasLevel,
    }, wallet);
    enforcePaymentPolicy({ rail: "agentic-wallet", amountUsd: prepared.amountUsd, destination: prepared.recipient });
    return createPaymentIntent(prepared);
  } catch (error) {
    throw paymentError(error, "Unable to prepare this transfer.", "PREPARE_TRANSFER_FAILED");
  }
}

export function approveWalletTransferIntent(id: string): PreparedTransfer {
  try {
    assertPaymentExecutionAllowed("agentic-wallet");
    const intent = getPaymentIntent(id);
    enforcePaymentPolicy({ rail: "agentic-wallet", amountUsd: intent.amountUsd, destination: intent.recipient });
    return approvePaymentIntent(id);
  } catch (error) {
    throw paymentError(error, "Unable to approve this transfer.", "APPROVE_TRANSFER_FAILED");
  }
}

export async function executeWalletTransferIntent(id: string): Promise<PreparedTransfer> {
  let processingId: string | undefined;
  try {
    assertPaymentExecutionAllowed("agentic-wallet");
    const intent = getPaymentIntent(id);
    if (intent.status !== "approved") throw new PaymentIntentError("This payment intent is not approved.", "INVALID_PAYMENT_STATUS");
    if (Date.parse(intent.expiresAt) <= Date.now()) throw new PaymentIntentError("Payment intent expired. Prepare it again.", "PAYMENT_INTENT_EXPIRED");
    prepareTransfer({ amount: intent.amount, recipient: intent.recipient, tokenAddress: intent.tokenAddress, binanceChainId: intent.binanceChainId, gasLevel: intent.gasLevel }, await getWalletOverview());
    enforcePaymentPolicy({ rail: "agentic-wallet", amountUsd: intent.amountUsd, destination: intent.recipient });
    if (await getWalletLockStatus(intent.binanceChainId) === "LOCKED") throw new PaymentIntentError("The wallet is locked by another pending transaction or Binance confirmation.", "WALLET_LOCKED");
    processingId = markPaymentSubmitting(intent.id).id;
    const txHash = await sendWalletTransfer(intent);
    const submitted = markPaymentSubmitted(intent.id, txHash);
    // The provider may already report confirmation by the time send returns.
    // A status-read failure is intentionally non-fatal: the broadcast is durable.
    try {
      const status = await getWalletTransactionStatus(txHash);
      if (status === "confirmed") return markPaymentConfirmed(intent.id);
      if (status === "failed") return markPaymentFailed(intent.id, "ONCHAIN_TRANSACTION_FAILED", "Binance reported that the on-chain transaction failed.");
    } catch { /* retain submitted until a later status refresh */ }
    return submitted;
  } catch (error) {
    const result = paymentError(error, "Unable to execute this transfer.", "EXECUTE_TRANSFER_FAILED");
    if (processingId) markPaymentFailed(processingId, result.code, result.message);
    throw result;
  }
}

export async function approveAndExecuteWalletTransfer(id: string): Promise<PreparedTransfer> {
  const intent = getPaymentIntent(id);
  if (intent.status === "awaiting-approval") approveWalletTransferIntent(id);
  else if (intent.status !== "approved") throw new PaymentIntentError("This transfer is no longer awaiting confirmation.", "INVALID_PAYMENT_STATUS");
  return executeWalletTransferIntent(id);
}
