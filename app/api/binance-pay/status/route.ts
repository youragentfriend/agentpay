import { getBinancePayCapability } from "@/lib/server/binance-pay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getBinancePayCapability(), { headers: { "Cache-Control": "no-store" } });
}
