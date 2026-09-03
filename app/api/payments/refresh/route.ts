import { getWalletTransactionStatus } from "@/lib/server/agentic-wallet";
import { PaymentIntentError } from "@/lib/server/payment-intents";
import { getPaymentIntent, markPaymentConfirmed } from "@/lib/server/payment-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string") throw new PaymentIntentError("Payment intent ID is required.", "INVALID_PAYMENT_INTENT_ID");
    const intent = getPaymentIntent(body.id);
    if (!intent.txHash) throw new PaymentIntentError("This intent has not been submitted.", "PAYMENT_NOT_SUBMITTED");
    const status = await getWalletTransactionStatus(intent.txHash);
    return Response.json(status === "confirmed" ? markPaymentConfirmed(intent.id) : intent);
  } catch (error) {
    const paymentError = error instanceof PaymentIntentError
      ? error
      : new PaymentIntentError("Unable to refresh transaction status.", "REFRESH_PAYMENT_FAILED");
    return Response.json({ error: paymentError.message, code: paymentError.code }, { status: 400 });
  }
}
