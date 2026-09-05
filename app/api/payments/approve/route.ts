import { PaymentIntentError } from "@/lib/server/payment-intents";
import { approvePaymentIntent, getPaymentIntent } from "@/lib/server/payment-store";
import { enforcePaymentPolicy, PaymentPolicyError } from "@/lib/server/payment-policy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string") throw new PaymentIntentError("Payment intent ID is required.", "INVALID_PAYMENT_INTENT_ID");
    const intent = getPaymentIntent(body.id);
    enforcePaymentPolicy({ rail: "agentic-wallet", amountUsd: intent.amountUsd, destination: intent.recipient });
    return Response.json(approvePaymentIntent(body.id));
  } catch (error) {
    const paymentError = error instanceof PaymentIntentError || error instanceof PaymentPolicyError
      ? error
      : new PaymentIntentError("Unable to approve this transfer.", "APPROVE_TRANSFER_FAILED");
    return Response.json({ error: paymentError.message, code: paymentError.code }, { status: 400 });
  }
}
