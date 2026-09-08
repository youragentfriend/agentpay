import { binancePayErrorResponse, confirmBinancePayment } from "@/lib/server/binance-pay";

export const runtime = "nodejs";

export async function POST() {
  try { return Response.json(await confirmBinancePayment()); }
  catch (error) { return binancePayErrorResponse(error); }
}
