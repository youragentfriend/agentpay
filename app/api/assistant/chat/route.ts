import { runOverviewAgent, type OverviewMessage } from "@/lib/server/overview-agent";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { message?: unknown; history?: unknown };
    if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 4_000) {
      return Response.json({ error: "Enter a valid AgentPay request.", code: "INVALID_ASSISTANT_REQUEST" }, { status: 400 });
    }
    const history: OverviewMessage[] = Array.isArray(body.history) ? body.history.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      return (row.role === "user" || row.role === "assistant") && typeof row.content === "string"
        ? [{ role: row.role, content: row.content.slice(0, 2_000) } as OverviewMessage] : [];
    }).slice(-8) : [];
    return Response.json(await runOverviewAgent([...history, { role: "user", content: body.message.trim() }]));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The AgentPay Overview agent is unavailable.", code: "OVERVIEW_AGENT_UNAVAILABLE" }, { status: 503 });
  }
}
