import { getOnchainPayCapability } from "@/lib/server/onchain-pay";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json(await getOnchainPayCapability(), { headers: { "Cache-Control": "no-store" } }); }
