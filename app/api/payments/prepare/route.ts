import type { PrepareTransferRequest } from "@/lib/payment-workflow";
import { getWalletOverview } from "@/lib/server/agentic-wallet";
import { PaymentIntentError, prepareTransfer } from "@/lib/server/payment-intents";
import { enforcePaymentPolicy, PaymentPolicyError } from "@/lib/server/payment-policy";
import { createPaymentIntent } from "@/lib/server/payment-store";
import { policyAuditFingerprint, recordPolicyRejectionFromError } from "@/lib/server/activity-policy-audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let fingerprint = policyAuditFingerprint("invalid-request");
  try {
    const body = await request.json() as PrepareTransferRequest;
    fingerprint = policyAuditFingerprint(body);
    const prepared = prepareTransfer(body, await getWalletOverview());
    enforcePaymentPolicy({ rail: "agentic-wallet", amountUsd: prepared.amountUsd, destination: prepared.recipient });
    return Response.json(createPaymentIntent(prepared), { status: 201 });
  } catch (error) {
    recordPolicyRejectionFromError(error, { source: "agentic-wallet", operation: "prepare", fingerprint });
    const paymentError = error instanceof PaymentIntentError || error instanceof PaymentPolicyError
      ? error
      : new PaymentIntentError("Unable to prepare this transfer.", "PREPARE_TRANSFER_FAILED");
    return Response.json({ error: paymentError.message, code: paymentError.code }, { status: 400 });
  }
}
