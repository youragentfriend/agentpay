import { getSpendingReport } from "@/lib/server/spending-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const sources = params.getAll("source").flatMap(value => value.split(",")).map(value => value.trim()).filter(Boolean);
    const report = getSpendingReport({
      preset: params.get("range") || undefined,
      from: params.get("from") || undefined,
      to: params.get("to") || undefined,
      timezone: params.get("timezone") || undefined,
      sources,
      asset: params.get("asset") || undefined,
      includePending: params.get("includePending") === "true",
      calendarMonth: params.get("calendarMonth") || undefined,
    });
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to build the spending report.", code: "SPENDING_REPORT_FAILED" }, { status: 500 });
  }
}
