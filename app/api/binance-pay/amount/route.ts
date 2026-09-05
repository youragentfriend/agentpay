import { BinancePayError, binancePayErrorResponse, setBinancePaymentAmount } from "@/lib/server/binance-pay";
import { policyAuditFingerprint, recordPolicyRejectionFromError } from "@/lib/server/activity-policy-audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let fingerprint=policyAuditFingerprint("invalid-request");
  try {
    const body = await request.json() as { amount?: unknown; currency?: unknown };
    fingerprint=policyAuditFingerprint(body);
    if (typeof body.amount !== "string") throw new BinancePayError("Payment amount is required.", "INVALID_PAYMENT_AMOUNT");
    return Response.json(await setBinancePaymentAmount(body.amount, typeof body.currency === "string" ? body.currency : undefined));
  } catch (error) { recordPolicyRejectionFromError(error,{source:"binance-pay",operation:"set amount",fingerprint}); return binancePayErrorResponse(error); }
}
