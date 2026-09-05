import { getAgentPayDiagnostics } from "@/lib/server/diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getAgentPayDiagnostics(), {
    headers: { "Cache-Control": "no-store" },
  });
}
