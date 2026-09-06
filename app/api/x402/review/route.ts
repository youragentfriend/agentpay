import { reviewX402,X402Error,x402ErrorResponse } from "@/lib/server/x402";
export const runtime="nodejs";
export async function POST(request:Request){try{const body=await request.json() as {id?:unknown;selectedIndex?:unknown};if(typeof body.id!=="string"||typeof body.selectedIndex!=="number")throw new X402Error("Intent ID and option index are required.","INVALID_X402_SELECTION");return Response.json(reviewX402(body.id,body.selectedIndex));}catch(error){return x402ErrorResponse(error);}}
