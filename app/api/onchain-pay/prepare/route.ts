import { OnchainPayError, onchainPayErrorResponse, prepareOnchainPayOrder } from "@/lib/server/onchain-pay";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    for (const field of ["asset", "network", "address", "amount"] as const) if (typeof body[field] !== "string") throw new OnchainPayError(`${field} is required.`, "INVALID_ONCHAIN_PAY_INPUT");
    if (body.memo !== undefined && typeof body.memo !== "string") throw new OnchainPayError("memo must be text.", "INVALID_ONCHAIN_PAY_INPUT");
    if (body.netReceive !== undefined && typeof body.netReceive !== "boolean") throw new OnchainPayError("netReceive must be true or false.", "INVALID_ONCHAIN_PAY_INPUT");
    return Response.json(await prepareOnchainPayOrder({ asset: body.asset as string, network: body.network as string, address: body.address as string, amount: body.amount as string, memo: body.memo as string | undefined, netReceive: body.netReceive as boolean | undefined }));
  } catch (error) { return onchainPayErrorResponse(error); }
}
