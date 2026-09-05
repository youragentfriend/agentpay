import { BinancePayError, binancePayErrorResponse, setBinancePaymentAmount } from "@/lib/server/binance-pay";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { amount?: unknown; currency?: unknown };
    if (typeof body.amount !== "string") throw new BinancePayError("Payment amount is required.", "INVALID_PAYMENT_AMOUNT");
    return Response.json(await setBinancePaymentAmount(body.amount, typeof body.currency === "string" ? body.currency : undefined));
  } catch (error) { return binancePayErrorResponse(error); }
}
