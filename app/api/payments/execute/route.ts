import { PaymentIntentError } from "@/lib/server/payment-intents";
import { executeWalletTransferIntent } from "@/lib/server/wallet-transfer-service";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string") throw new PaymentIntentError("Payment intent ID is required.", "INVALID_PAYMENT_INTENT_ID");
    return Response.json(await executeWalletTransferIntent(body.id));
  } catch (error) {
    const paymentError = error instanceof PaymentIntentError ? error : new PaymentIntentError("Unable to execute this transfer.", "EXECUTE_TRANSFER_FAILED");
    const status = ["EXECUTION_DISABLED", "PAYMENT_SERVER_DISABLED", "PAYMENTS_EMERGENCY_STOPPED", "PAYMENT_RAIL_DISABLED"].includes(paymentError.code) ? 403 : 400;
    return Response.json({ error: paymentError.message, code: paymentError.code }, { status });
  }
}
