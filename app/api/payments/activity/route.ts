import { listPaymentIntents, walletSendEnabled } from "@/lib/server/payment-store";
import { listBinancePayReceipts } from "@/lib/server/binance-pay-store";
import { getBinancePayCapability } from "@/lib/server/binance-pay";
import { listX402Intents } from "@/lib/server/x402-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const binancePay = await getBinancePayCapability();
  return Response.json({
    executionEnabled: walletSendEnabled(),
    binancePayExecutionEnabled: binancePay.executionEnabled,
    intents: listPaymentIntents(),
    binancePayReceipts: listBinancePayReceipts(),
    x402Intents: listX402Intents(),
  }, { headers: { "Cache-Control": "no-store" } });
}
