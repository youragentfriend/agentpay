import { listPaymentIntents, walletSendEnabled } from "@/lib/server/payment-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ executionEnabled: walletSendEnabled(), intents: listPaymentIntents() }, { headers: { "Cache-Control": "no-store" } });
}
