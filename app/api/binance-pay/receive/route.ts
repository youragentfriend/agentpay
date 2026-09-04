import { BinancePayError, binancePayErrorResponse, createBinancePayReceiveLink } from "@/lib/server/binance-pay";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { currency?: unknown; amount?: unknown; note?: unknown };
    for (const [name, value] of Object.entries(body)) {
      if (value !== undefined && typeof value !== "string") throw new BinancePayError(`${name} must be text.`, "INVALID_RECEIVE_INPUT");
    }
    return Response.json(await createBinancePayReceiveLink(body.currency as string | undefined, body.amount as string | undefined, body.note as string | undefined));
  } catch (error) { return binancePayErrorResponse(error); }
}
