import { x402Capability } from "@/lib/server/x402";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(){return Response.json(x402Capability(),{headers:{"Cache-Control":"no-store"}});}
