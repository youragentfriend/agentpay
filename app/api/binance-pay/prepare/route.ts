import { BinancePayError, binancePayErrorResponse, prepareBinancePayment } from "@/lib/server/binance-pay";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { rawQr?: unknown };
    if (typeof body.rawQr !== "string") throw new BinancePayError("A payment link or QR payload is required.", "INVALID_QR_INPUT");
    return Response.json(await prepareBinancePayment(body.rawQr));
  } catch (error) { return binancePayErrorResponse(error); }
}
