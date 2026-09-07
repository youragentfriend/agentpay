import { approveOnchainPayOrder, OnchainPayError, onchainPayErrorResponse } from "@/lib/server/onchain-pay";
export const runtime = "nodejs";
export async function POST(request: Request) { try { const body = await request.json() as { id?: unknown }; if (typeof body.id !== "string") throw new OnchainPayError("Order ID is required.", "INVALID_ONCHAIN_PAY_INPUT"); return Response.json(approveOnchainPayOrder(body.id)); } catch (error) { return onchainPayErrorResponse(error); } }
