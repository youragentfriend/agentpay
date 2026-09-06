import { discoverWithAi } from "@/lib/server/x402-llm";
import { listX402CatalogResources } from "@/lib/server/x402-bazaar";
import { x402ErrorResponse } from "@/lib/server/x402";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:Request){try{const body=await request.json() as {query?:unknown};const catalog=await listX402CatalogResources();return Response.json({...await discoverWithAi(body.query,catalog.resources),catalogFailures:catalog.failures.length});}catch(error){return x402ErrorResponse(error);}}
