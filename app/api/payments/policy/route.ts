import { getDailySpendUsd, PaymentPolicyError } from "@/lib/server/payment-policy";
import { getAgentPaySettings } from "@/lib/server/settings-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = getAgentPaySettings();
  const limits = settings.spendingLimits["agentic-wallet"];
  try {
    return Response.json({
      limits,
      dailySpendUsd: limits.dailyUsdLimit === null ? "0" : getDailySpendUsd("agentic-wallet"),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof PaymentPolicyError ? error.message : "Daily spending could not be calculated.";
    return Response.json({ limits, dailySpendUsd: null, warning: message }, { headers: { "Cache-Control": "no-store" } });
  }
}
