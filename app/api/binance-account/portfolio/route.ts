import { NextResponse } from "next/server";
import { loadBinancePortfolio } from "@/lib/server/binance-readonly";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const portfolio = await loadBinancePortfolio();
    return NextResponse.json(portfolio, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Unable to load the Binance read-only portfolio." }, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
