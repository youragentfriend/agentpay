import { listX402CatalogResources,x402BazaarCapability } from "@/lib/server/x402-bazaar";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){const capability=x402BazaarCapability();if(!capability.sources.length)return Response.json({resources:[],failures:[],sources:[]});return Response.json({...await listX402CatalogResources(),sources:capability.sources.map(value=>new URL(value).hostname)},{headers:{"Cache-Control":"no-store"}});}
