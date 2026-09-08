import { binancePayErrorResponse, pollBinancePayment } from "@/lib/server/binance-pay";

export const runtime = "nodejs";

export async function POST() {
  try { return Response.json(await pollBinancePayment()); }
  catch (error) { return binancePayErrorResponse(error); }
}
