import { listBscBazaarResources, x402BazaarCapability } from "@/lib/server/x402-bazaar";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(){const capability=x402BazaarCapability(); if(!capability.sources.length)return Response.json({resources:[],failures:[],sources:[]}); return Response.json({...await listBscBazaarResources(),sources:capability.sources.map(value=>new URL(value).hostname)},{headers:{"Cache-Control":"no-store"}});}
