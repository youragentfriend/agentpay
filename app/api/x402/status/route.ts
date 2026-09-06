import { x402Capability } from "@/lib/server/x402";
import { x402LlmStatus } from "@/lib/server/x402-llm";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){return Response.json({...x402Capability(),ai:x402LlmStatus()},{headers:{"Cache-Control":"no-store"}});}
