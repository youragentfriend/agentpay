import { listPaymentIntents, walletSendEnabled } from "@/lib/server/payment-store";
import { listBinancePayReceipts } from "@/lib/server/binance-pay-store";
import { getBinancePayCapability } from "@/lib/server/binance-pay";
import { listX402Intents } from "@/lib/server/x402-store";
import { ActivityQueryError, queryActivityEvents, type ActivityQuery } from "@/lib/server/activity-store";
import { activityCsv } from "@/lib/activity-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const value = (name: string): string | undefined => params.get(name) ?? undefined;
    const rawLimit = value("limit");
    const rawPage = value("page");
    const query: ActivityQuery = {
      statusGroup: value("statusGroup") ?? value("status"),
      source: value("source"),
      activityType: value("activityType") ?? value("type"),
      search: value("search"),
      asset: value("asset"),
      from: value("from") ?? value("dateFrom"),
      to: value("to") ?? value("dateTo"),
      sort: value("sort"),
      limit: rawLimit === undefined ? undefined : Number(rawLimit),
      page: rawPage === undefined ? undefined : Number(rawPage),
    };
    if (value("format") === "csv") {
      const first = queryActivityEvents({ ...query, page: 1, limit: 100 });
      const events = [...first.events];
      for (let page = 2; page <= first.pagination.totalPages; page += 1) events.push(...queryActivityEvents({ ...query, page, limit: 100 }).events);
      return new Response(activityCsv(events, value("timezone") || "UTC"), {
        headers: { "Cache-Control": "no-store", "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=agentpay-activity.csv" },
      });
    }
    const activity = queryActivityEvents(query);
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
