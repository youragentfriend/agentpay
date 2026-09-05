import { binancePayErrorResponse, confirmBinancePayment } from "@/lib/server/binance-pay";
import { policyAuditFingerprint, recordPolicyRejectionFromError } from "@/lib/server/activity-policy-audit";

export const runtime = "nodejs";

export async function POST() {
  try { return Response.json(await confirmBinancePayment()); }
  catch (error) { recordPolicyRejectionFromError(error,{source:"binance-pay",operation:"confirm",fingerprint:policyAuditFingerprint("active-order")}); return binancePayErrorResponse(error); }
}
