import { addX402CatalogService, listX402CatalogServices } from "@/lib/server/x402-catalog-store";
import type { X402CatalogServiceInput } from "@/lib/x402-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return Response.json({ services: listX402CatalogServices({ query: url.searchParams.get("q") || undefined, category: url.searchParams.get("category") || undefined, network: url.searchParams.get("network") || undefined }) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  try {
    const input = await request.json() as X402CatalogServiceInput;
    const result = addX402CatalogService({ ...input, origin: "ai-discovered" });
    return Response.json(result, { status: result.added ? 201 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to add this x402 service." }, { status: 400 });
  }
}
