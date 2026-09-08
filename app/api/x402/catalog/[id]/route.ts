import { removeX402CatalogService } from "@/lib/server/x402-catalog-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!removeX402CatalogService(id)) return Response.json({ error: "Catalog service not found." }, { status: 404 });
  return Response.json({ removed: true });
}
