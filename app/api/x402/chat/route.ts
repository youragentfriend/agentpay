import { approveX402, payX402, prepareX402, reviewX402, x402ErrorResponse, X402Error } from "@/lib/server/x402";
import { runX402Agent, type X402AgentCandidate } from "@/lib/server/x402-agent";
import { cancelX402Intent, getX402Intent } from "@/lib/server/x402-store";
import { createX402Chat, getX402Chat, updateX402Chat } from "@/lib/server/x402-chat-store";
import { syncActivityEvents } from "@/lib/server/activity-store";
import type { X402Intent, X402RequestMethod } from "@/lib/x402-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export function isX402Confirmation(text: string) {
  return !/[?]|\b(what|why|how|which|can you|could you|would it|not yet)\b/i.test(text)
    && /\b(proceed|go ahead|continue|purchase|buy|pay|confirm|approved?|yes|do it)\b/i.test(text)
    && !/\b(don't|do not|no|cancel|stop|not yet)\b/i.test(text);
}
export function isX402Decline(text: string) { return /\b(no|cancel|stop|decline|don't|do not|not now)\b/i.test(text); }
function endpointFrom(text: string): { url: string; method: X402RequestMethod } | undefined {
  const match = text.match(/\bhttps:\/\/[^\s<>"']+/i);
  if (!match) return;
  return { url: match[0].replace(/[),.;!?]+$/, ""), method: /\bPOST\b/i.test(text.slice(0, match.index)) ? "POST" : "GET" };
}
function reviewText(intent: X402Intent, name: string): string {
  const option = intent.selectedOption;
  const network = option?.network || String(option?.originalAccept?.network || option?.binanceChainId || "not reported");
  return [`I prepared a live x402 v2 payment review for ${name}.`,`Request: ${intent.requestMethod} ${intent.resourceUrl}`,`Payment: ${option?.amount || "amount not reported"} ${option?.tokenSymbol || "token not reported"}${option?.amountUsd ? ` (USD $${option.amountUsd})` : ""}`,`Network: ${network}`,`Recipient: ${option?.payTo || "not reported"}`,"The protected result is available only after payment. Would you like AgentPay to proceed with this exact purchase?"].join("\n");
}
function syncActivity() { try { syncActivityEvents(); } catch { /* source intent remains durable */ } }
async function prepareCandidate(candidate: X402AgentCandidate, userRequest: string) {
  const prepared = await prepareX402({ url: candidate.endpoint, method: candidate.method, requestBody: candidate.requestBody, source: "agent", userRequest });
  const ready = prepared.options.find(option => option.status === "READY_TO_SIGN");
  if (!ready) throw new X402Error("No supported payment option is ready to sign.", "X402_OPTION_NOT_READY");
  return reviewX402(prepared.id, ready.index);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { sessionId?: unknown; message?: unknown; action?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message && body.action !== "cancel") throw new X402Error("A message is required.", "INVALID_X402_MESSAGE");
    const session = typeof body.sessionId === "string" ? getX402Chat(body.sessionId) : createX402Chat();
    if (message) updateX402Chat(session.id, { message: { role: "user", content: message } });

    if (session.intentId && session.status === "awaiting_confirmation" && (body.action === "cancel" || isX402Decline(message))) {
      const intent = cancelX402Intent(session.intentId); syncActivity();
      return Response.json({ session: updateX402Chat(session.id, { status: "cancelled", message: { role: "assistant", content: "Cancelled. No payment was signed or sent." }, intentId: intent.id }), intent });
    }
    if (session.intentId && isX402Confirmation(message)) {
      const current = getX402Intent(session.intentId);
      if (session.status !== "awaiting_confirmation" || current.status !== "reviewed") return Response.json({ session: updateX402Chat(session.id, { message: { role: "assistant", content: "That purchase is no longer awaiting confirmation. I did not send another payment." } }), intent: current });
      const intent = await payX402(approveX402(current.id).id); syncActivity();
      const content = intent.status === "completed" ? "Payment completed. I saved the purchase in Activity and returned the purchased result below." : `The payment was processed, but delivery failed: ${intent.errorMessage || "The service did not return a valid result."}`;
      return Response.json({ session: updateX402Chat(session.id, { status: intent.status === "completed" ? "completed" : "failed", message: { role: "assistant", content }, intentId: intent.id }), intent });
    }
    if (session.intentId && session.status === "awaiting_confirmation") return Response.json({ session: updateX402Chat(session.id, { message: { role: "assistant", content: "I have not treated that as authorization. Clearly confirm this exact review, cancel it, or ask me to prepare a different purchase." } }), intent: getX402Intent(session.intentId) });

    const direct = endpointFrom(message);
    if (direct) {
      const candidate: X402AgentCandidate = { serviceName: new URL(direct.url).hostname, description: "Endpoint supplied in chat", endpoint: direct.url, method: direct.method, requestBody: direct.method === "POST" ? {} : undefined, x402Version: 2, networks: [], sourceUrls: [] };
      const intent = await prepareCandidate(candidate, message); syncActivity();
      return Response.json({ session: updateX402Chat(session.id, { status: "awaiting_confirmation", message: { role: "assistant", content: reviewText(intent, candidate.serviceName) }, intentId: intent.id }), intent });
    }

    const current = getX402Chat(session.id);
    const result = await runX402Agent(current.messages);
    if (result.action === "answer" || !result.candidate) return Response.json({ session: updateX402Chat(session.id, { status: "active", message: { role: "assistant", content: result.message } }) });
    try {
      const intent = await prepareCandidate(result.candidate, message); syncActivity();
      return Response.json({ session: updateX402Chat(session.id, { status: "awaiting_confirmation", message: { role: "assistant", content: `${result.message}\n\n${reviewText(intent, result.candidate.serviceName)}` }, intentId: intent.id }), intent });
    } catch (error) {
      if (error instanceof X402Error && ["X402_HOST_NOT_ALLOWED", "POLICY_X402_ENDPOINT_NOT_TRUSTED"].includes(error.code)) {
        const content = `${result.message}\n\nI found ${result.candidate.serviceName}: ${result.candidate.method} ${result.candidate.endpoint}. Before I can fetch its live payment requirements, authorize this hostname in the server allowlist and this exact endpoint and method in Trusted x402 Endpoints. No payment was prepared or sent.`;
        return Response.json({ session: updateX402Chat(session.id, { status: "active", message: { role: "assistant", content } }), proposal: result.candidate });
      }
      throw error;
    }
  } catch (error) { syncActivity(); return x402ErrorResponse(error); }
}
