import { listPaymentIntents, walletSendEnabled } from "@/lib/server/payment-store";
import { listBinancePayReceipts } from "@/lib/server/binance-pay-store";
import { getBinancePayCapability } from "@/lib/server/binance-pay";
import { listX402Intents } from "@/lib/server/x402-store";
import { ActivityQueryError, queryActivityEvents } from "@/lib/server/activity-store";
import { activityQueryFromUrl } from "@/lib/server/activity-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const activity = queryActivityEvents(activityQueryFromUrl(request.url));
    const binancePay = await getBinancePayCapability();
    return Response.json({
      executionEnabled: walletSendEnabled(),
      binancePayExecutionEnabled: binancePay.executionEnabled,
      ...activity,
      // Kept temporarily for existing clients; new consumers should use events.
      intents: listPaymentIntents(),
      binancePayReceipts: listBinancePayReceipts(),
      x402Intents: listX402Intents(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ActivityQueryError) return Response.json({ error: error.message, code: "INVALID_ACTIVITY_QUERY" }, { status: 400 });
    return Response.json({ error: "Unable to load payment activity.", code: "ACTIVITY_QUERY_FAILED" }, { status: 500 });
  }
}
