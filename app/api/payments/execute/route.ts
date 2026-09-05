import { AgenticWalletError, getWalletLockStatus, getWalletOverview, sendWalletTransfer } from "@/lib/server/agentic-wallet";
import { PaymentIntentError, prepareTransfer } from "@/lib/server/payment-intents";
import { getPaymentIntent, markPaymentFailed, markPaymentSubmitted, markPaymentSubmitting, walletSendEnabled } from "@/lib/server/payment-store";
import { enforcePaymentPolicy, PaymentPolicyError } from "@/lib/server/payment-policy";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  let processingId: string | undefined;
  try {
    if (!walletSendEnabled()) throw new PaymentIntentError("Wallet execution is disabled on this server.", "EXECUTION_DISABLED");
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string") throw new PaymentIntentError("Payment intent ID is required.", "INVALID_PAYMENT_INTENT_ID");
    const intent = getPaymentIntent(body.id);
    if (intent.status !== "approved") throw new PaymentIntentError("This payment intent is not approved.", "INVALID_PAYMENT_STATUS");
    if (Date.parse(intent.expiresAt) <= Date.now()) throw new PaymentIntentError("Payment intent expired. Prepare it again.", "PAYMENT_INTENT_EXPIRED");

    prepareTransfer({
      amount: intent.amount, recipient: intent.recipient, tokenAddress: intent.tokenAddress,
      binanceChainId: intent.binanceChainId, gasLevel: intent.gasLevel,
    }, await getWalletOverview());
    enforcePaymentPolicy({ rail: "agentic-wallet", amountUsd: intent.amountUsd, destination: intent.recipient });
    if (await getWalletLockStatus(intent.binanceChainId) === "LOCKED") {
      throw new PaymentIntentError("The wallet is locked by another pending transaction or Binance confirmation.", "WALLET_LOCKED");
    }

    processingId = markPaymentSubmitting(intent.id).id;
    const txHash = await sendWalletTransfer(intent);
    return Response.json(markPaymentSubmitted(intent.id, txHash));
  } catch (error) {
    const paymentError = error instanceof PaymentIntentError || error instanceof PaymentPolicyError
      ? error
      : error instanceof AgenticWalletError
        ? new PaymentIntentError(error.message, error.code)
        : new PaymentIntentError("Unable to execute this transfer.", "EXECUTE_TRANSFER_FAILED");
    if (processingId) markPaymentFailed(processingId, paymentError.code, paymentError.message);
    const status = paymentError.code === "EXECUTION_DISABLED" ? 403 : 400;
    return Response.json({ error: paymentError.message, code: paymentError.code }, { status });
  }
}
