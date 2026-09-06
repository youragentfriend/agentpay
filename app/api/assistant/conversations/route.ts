import { createOverviewConversation, getOverviewConversation, listOverviewConversations } from "@/lib/server/overview-skill-runtime";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (id) return Response.json({ conversation: getOverviewConversation(id) });
    const rawLimit = url.searchParams.get("limit") ?? "20";
    if (!/^\d{1,2}$/.test(rawLimit)) return Response.json({ error: "Invalid conversation list limit.", code: "INVALID_CONVERSATION_LIMIT" }, { status: 400 });
    return Response.json({ conversations: listOverviewConversations(Number(rawLimit)) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load Overview conversations.", code: "OVERVIEW_CONVERSATION_NOT_FOUND" }, { status: 404 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (Object.keys(body).length) return Response.json({ error: "Conversation creation does not accept fields.", code: "INVALID_CONVERSATION_CREATE" }, { status: 400 });
    return Response.json({ conversation: createOverviewConversation() }, { status: 201 });
  } catch {
    return Response.json({ error: "Unable to create an Overview conversation.", code: "OVERVIEW_CONVERSATION_CREATE_FAILED" }, { status: 500 });
  }
}
