import { approveX402,X402Error,x402ErrorResponse } from "@/lib/server/x402";
export const runtime="nodejs";
export async function POST(request:Request){try{const body=await request.json() as {id?:unknown};if(typeof body.id!=="string")throw new X402Error("Intent ID is required.","INVALID_X402_INTENT");return Response.json(approveX402(body.id));}catch(error){return x402ErrorResponse(error);}}
