import { runOverviewSkillRuntime } from "@/lib/server/overview-agent";

export const runtime = "nodejs";
export const maxDuration = 75;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { message?: unknown; conversationId?: unknown };
    if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 4_000) {
      return Response.json({ error: "Enter a valid AgentPay request.", code: "INVALID_ASSISTANT_REQUEST" }, { status: 400 });
    }
    if (body.conversationId !== undefined && (typeof body.conversationId !== "string" || body.conversationId.length > 100)) {
      return Response.json({ error: "The Overview conversation is invalid.", code: "INVALID_OVERVIEW_CONVERSATION" }, { status: 400 });
    }
    return Response.json(await runOverviewSkillRuntime(body.message.trim(), body.conversationId as string | undefined));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The AgentPay Overview agent is unavailable.", code: "OVERVIEW_AGENT_UNAVAILABLE" }, { status: 503 });
  }
}
