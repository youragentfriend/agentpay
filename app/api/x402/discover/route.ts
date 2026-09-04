import { discoverX402, X402Error, x402ErrorResponse } from "@/lib/server/x402";
export const runtime="nodejs";
export async function POST(request:Request){try{const body=await request.json() as {url?:unknown};if(typeof body.url!=="string")throw new X402Error("Resource URL is required.","INVALID_X402_URL");return Response.json(await discoverX402(body.url));}catch(error){return x402ErrorResponse(error);}}
