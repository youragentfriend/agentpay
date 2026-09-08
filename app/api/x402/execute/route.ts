import { X402Error,x402ErrorResponse } from "@/lib/server/x402";
export const runtime="nodejs";
export async function POST(){return x402ErrorResponse(new X402Error("One-click execution was removed. Use Review, Approve, then Pay as separate actions.","X402_LIFECYCLE_REQUIRED"));}
