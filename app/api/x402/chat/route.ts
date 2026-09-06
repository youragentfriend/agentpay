import { approveX402, payX402, x402ErrorResponse, X402Error } from "@/lib/server/x402";
import { discoverWithAi } from "@/lib/server/x402-llm";
import { listX402CatalogResources } from "@/lib/server/x402-bazaar";
import { cancelX402Intent } from "@/lib/server/x402-store";
import { createX402Chat, getX402Chat, updateX402Chat } from "@/lib/server/x402-chat-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function confirmation(text: string) { return /\b(proceed|go ahead|continue|purchase|buy|pay|confirm|yes)\b/i.test(text) && !/\b(don't|do not|no|cancel|stop)\b/i.test(text); }
function decline(text: string) { return /\b(no|cancel|stop|decline|don't|do not)\b/i.test(text); }

export async function POST(request: Request) {
  try {
    const body = await request.json() as { sessionId?: unknown; message?: unknown; action?: unknown; intentId?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message && body.action !== "cancel") throw new X402Error("A message is required.", "INVALID_X402_MESSAGE");
    const session = typeof body.sessionId === "string" ? getX402Chat(body.sessionId) : createX402Chat();
    if (body.action === "cancel" && typeof body.intentId === "string") {
      const intent = cancelX402Intent(body.intentId);
      const updated = updateX402Chat(session.id, { status: "cancelled", message: { role: "assistant", content: "Cancelled. No payment was signed or sent." }, intentId: intent.id });
      return Response.json({ session: updated, intent });
    }
    updateX402Chat(session.id, { message: { role: "user", content: message } });
    if (typeof body.intentId === "string" && confirmation(message)) {
      const approved = approveX402(body.intentId);
      const intent = await payX402(approved.id);
      const updated = updateX402Chat(session.id, { status: intent.status === "completed" ? "completed" : "failed", message: { role: "assistant", content: intent.status === "completed" ? "Payment completed and the purchased result is ready below." : `Payment failed: ${intent.errorMessage || "The service did not deliver a result."}` }, intentId: intent.id });
      return Response.json({ session: updated, intent });
    }
    if (typeof body.intentId === "string" && decline(message)) {
      const intent = cancelX402Intent(body.intentId);
      const updated = updateX402Chat(session.id, { status: "cancelled", message: { role: "assistant", content: "Understood. I cancelled this purchase without signing or sending payment." }, intentId: intent.id });
      return Response.json({ session: updated, intent });
    }
    const catalog = await listX402CatalogResources();
    const discovery = await discoverWithAi(message, catalog.resources);
    const text = discovery.configured ? discovery.message : "Discover with AgentPay AI is not configured yet. Browse Services remains available, and no payment can be made from this chat.";
    const updated = updateX402Chat(session.id, { status: "active", message: { role: "assistant", content: text } });
    return Response.json({ session: updated, discovery, catalogFailures: catalog.failures.length });
  } catch (error) { return x402ErrorResponse(error); }
}
