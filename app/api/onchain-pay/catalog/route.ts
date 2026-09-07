import { getOnchainPayCatalog, onchainPayErrorResponse } from "@/lib/server/onchain-pay";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { try { return Response.json(await getOnchainPayCatalog(), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return onchainPayErrorResponse(error); } }
