import { SettingsValidationError, getAgentPaySettings, updateAgentPaySettings } from "@/lib/server/settings-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getAgentPaySettings(), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  try {
    return Response.json(updateAgentPaySettings(await request.json()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SettingsValidationError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "Unable to save AgentPay settings." }, { status: 500 });
  }
}
