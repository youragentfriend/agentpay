import { payX402,X402Error,x402ErrorResponse } from "@/lib/server/x402";
export const runtime="nodejs";export const maxDuration=180;
export async function POST(request:Request){try{const body=await request.json() as {id?:unknown};if(typeof body.id!=="string")throw new X402Error("Intent ID is required.","INVALID_X402_INTENT");return Response.json(await payX402(body.id));}catch(error){return x402ErrorResponse(error);}}
