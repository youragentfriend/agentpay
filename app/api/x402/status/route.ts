import { x402Capability } from "@/lib/server/x402";
import { x402AgentStatus } from "@/lib/server/x402-agent";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){return Response.json({...x402Capability(),ai:x402AgentStatus()},{headers:{"Cache-Control":"no-store"}});}
