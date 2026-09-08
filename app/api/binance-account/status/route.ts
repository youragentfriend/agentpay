import { NextResponse } from "next/server";
import { getBinanceAccountStatus } from "@/lib/server/binance-readonly";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getBinanceAccountStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}
