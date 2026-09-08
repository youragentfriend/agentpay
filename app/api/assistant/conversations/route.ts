import { countOverviewConversations, createOverviewConversation, deleteOverviewConversation, getOverviewConversation, listOverviewConversations } from "@/lib/server/overview-skill-runtime";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (id) return Response.json({ conversation: getOverviewConversation(id) });
    const rawLimit = url.searchParams.get("limit") ?? "10";
    const rawPage = url.searchParams.get("page") ?? "1";
    if (!/^\d{1,2}$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 50) return Response.json({ error: "Invalid conversation list limit.", code: "INVALID_CONVERSATION_LIMIT" }, { status: 400 });
    if (!/^\d{1,6}$/.test(rawPage) || Number(rawPage) < 1) return Response.json({ error: "Invalid conversation page.", code: "INVALID_CONVERSATION_PAGE" }, { status: 400 });
    const limit = Number(rawLimit);
    const total = countOverviewConversations();
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Number(rawPage), totalPages);
    return Response.json({ conversations: listOverviewConversations(limit, (page - 1) * limit), pagination: { page, pageSize: limit, total, totalPages } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load Overview conversations.", code: "OVERVIEW_CONVERSATION_NOT_FOUND" }, { status: 404 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "A conversation id is required.", code: "INVALID_CONVERSATION_DELETE" }, { status: 400 });
    deleteOverviewConversation(id);
    return Response.json({ deleted: true, id });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete the conversation.", code: "OVERVIEW_CONVERSATION_NOT_FOUND" }, { status: 404 });
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
