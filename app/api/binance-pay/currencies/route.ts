import { getBinancePayReceiveCurrencies } from "@/lib/server/binance-pay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getBinancePayReceiveCurrencies(), { headers: { "Cache-Control": "no-store" } });
}
