import { approveTransfer, PaymentIntentError } from "@/lib/server/payment-intents";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string") throw new PaymentIntentError("Payment intent ID is required.", "INVALID_PAYMENT_INTENT_ID");
    return Response.json(approveTransfer(body.id));
  } catch (error) {
    const paymentError = error instanceof PaymentIntentError
      ? error
      : new PaymentIntentError("Unable to approve this transfer.", "APPROVE_TRANSFER_FAILED");
    return Response.json({ error: paymentError.message, code: paymentError.code }, { status: 400 });
  }
}
