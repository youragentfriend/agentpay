import { PaymentIntentError } from "@/lib/server/payment-intents";
import { approvePaymentIntent, getPaymentIntent } from "@/lib/server/payment-store";
import { enforcePaymentPolicy, PaymentPolicyError } from "@/lib/server/payment-policy";
import { assertPaymentExecutionAllowed, PaymentExecutionError } from "@/lib/server/payment-execution";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string") throw new PaymentIntentError("Payment intent ID is required.", "INVALID_PAYMENT_INTENT_ID");
    assertPaymentExecutionAllowed("agentic-wallet");
    const intent = getPaymentIntent(body.id);
    enforcePaymentPolicy({ rail: "agentic-wallet", amountUsd: intent.amountUsd, destination: intent.recipient });
    return Response.json(approvePaymentIntent(body.id));
  } catch (error) {
    const paymentError = error instanceof PaymentIntentError || error instanceof PaymentPolicyError
      ? error
      : error instanceof PaymentExecutionError
        ? new PaymentIntentError(error.message, error.code)
      : new PaymentIntentError("Unable to approve this transfer.", "APPROVE_TRANSFER_FAILED");
    const status = ["PAYMENT_SERVER_DISABLED", "PAYMENTS_EMERGENCY_STOPPED", "PAYMENT_RAIL_DISABLED"].includes(paymentError.code) ? 403 : 400;
    return Response.json({ error: paymentError.message, code: paymentError.code }, { status });
  }
}
