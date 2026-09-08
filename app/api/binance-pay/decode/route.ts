import { BinancePayError, binancePayErrorResponse, decodeBinanceQr, getCompatibleBinancePayLink, prepareBinancePayment } from "@/lib/server/binance-pay";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new BinancePayError("A QR image is required.", "QR_IMAGE_REQUIRED");
    const decoded = await decodeBinanceQr(file);
    if (!decoded.qr_data) throw new BinancePayError(decoded.message ?? "The QR image could not be decoded.", "QR_DECODE_FAILED");
    return Response.json({ sourceType: decoded.source_type, compatibleLink: getCompatibleBinancePayLink(decoded.qr_data), order: await prepareBinancePayment(decoded.qr_data) });
  } catch (error) { return binancePayErrorResponse(error); }
}
