import { listPaymentIntents, walletSendEnabled } from "@/lib/server/payment-store";
import { listBinancePayReceipts } from "@/lib/server/binance-pay-store";
import { getBinancePayCapability } from "@/lib/server/binance-pay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const binancePay = await getBinancePayCapability();
  return Response.json({
    executionEnabled: walletSendEnabled(),
    binancePayExecutionEnabled: binancePay.executionEnabled,
    intents: listPaymentIntents(),
    binancePayReceipts: listBinancePayReceipts(),
  }, { headers: { "Cache-Control": "no-store" } });
}
