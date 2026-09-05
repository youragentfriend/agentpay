import { BinancePayError, binancePayErrorResponse, prepareBinancePayment } from "@/lib/server/binance-pay";
import { policyAuditFingerprint, recordPolicyRejectionFromError } from "@/lib/server/activity-policy-audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let fingerprint=policyAuditFingerprint("invalid-request");
  try {
    const body = await request.json() as { rawQr?: unknown };
    fingerprint=policyAuditFingerprint(body);
    if (typeof body.rawQr !== "string") throw new BinancePayError("A payment link or QR payload is required.", "INVALID_QR_INPUT");
    return Response.json(await prepareBinancePayment(body.rawQr));
  } catch (error) { recordPolicyRejectionFromError(error,{source:"binance-pay",operation:"prepare",fingerprint}); return binancePayErrorResponse(error); }
}
