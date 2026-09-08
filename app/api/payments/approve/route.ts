import { PaymentIntentError } from "@/lib/server/payment-intents";
import { approveWalletTransferIntent } from "@/lib/server/wallet-transfer-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string") throw new PaymentIntentError("Payment intent ID is required.", "INVALID_PAYMENT_INTENT_ID");
    return Response.json(approveWalletTransferIntent(body.id));
  } catch (error) {
    const paymentError = error instanceof PaymentIntentError ? error : new PaymentIntentError("Unable to approve this transfer.", "APPROVE_TRANSFER_FAILED");
    const status = ["PAYMENT_SERVER_DISABLED", "PAYMENTS_EMERGENCY_STOPPED", "PAYMENT_RAIL_DISABLED"].includes(paymentError.code) ? 403 : 400;
    return Response.json({ error: paymentError.message, code: paymentError.code }, { status });
  }
}
