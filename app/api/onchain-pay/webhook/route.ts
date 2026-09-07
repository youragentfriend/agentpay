import { onchainPayErrorResponse, processOnchainPayWebhook } from "@/lib/server/onchain-pay";
export const runtime = "nodejs";
export async function POST(request: Request) { try { const order = await processOnchainPayWebhook(await request.text(), request.headers); return Response.json({ returnCode: "SUCCESS", returnMessage: "OK", externalOrderId: order.externalOrderId }); } catch (error) { return onchainPayErrorResponse(error); } }
