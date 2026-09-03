import type { PrepareTransferRequest } from "@/lib/payment-workflow";
import { getWalletOverview } from "@/lib/server/agentic-wallet";
import { PaymentIntentError, prepareTransfer } from "@/lib/server/payment-intents";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as PrepareTransferRequest;
    return Response.json(prepareTransfer(body, await getWalletOverview()), { status: 201 });
  } catch (error) {
    const paymentError = error instanceof PaymentIntentError
      ? error
      : new PaymentIntentError("Unable to prepare this transfer.", "PREPARE_TRANSFER_FAILED");
    return Response.json({ error: paymentError.message, code: paymentError.code }, { status: 400 });
  }
}
