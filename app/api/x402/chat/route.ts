import { approveX402, payX402, prepareX402, reviewX402, x402ErrorResponse, X402Error } from "@/lib/server/x402";
import { discoverWithAi } from "@/lib/server/x402-llm";
import { listX402CatalogResources } from "@/lib/server/x402-bazaar";
import { cancelX402Intent, getX402Intent } from "@/lib/server/x402-store";
import { createX402Chat, getX402Chat, updateX402Chat } from "@/lib/server/x402-chat-store";
import { syncActivityEvents } from "@/lib/server/activity-store";
import type { X402CatalogResource, X402Intent, X402RequestMethod } from "@/lib/x402-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export function isX402Confirmation(text: string) {
  return !/[?]|\b(what|why|how|which|can you|could you|would it|not yet)\b/i.test(text)
    && /\b(proceed|go ahead|continue|purchase|buy|pay|confirm|approved?|yes|do it)\b/i.test(text)
    && !/\b(don't|do not|no|cancel|stop|not yet)\b/i.test(text);
}
export function isX402Decline(text: string) { return /\b(no|cancel|stop|decline|don't|do not|not now)\b/i.test(text); }
function informational(text: string) {
  return /\b(what is|what's|explain|how does|how do|tell me about)\b/i.test(text) && /\bx402\b/i.test(text);
}
function endpointFrom(text: string): { url: string; method: X402RequestMethod } | undefined {
  const match = text.match(/\bhttps:\/\/[^\s<>"']+/i);
  if (!match) return;
  return { url: match[0].replace(/[),.;!?]+$/, ""), method: /\bPOST\b/i.test(text.slice(0, match.index)) ? "POST" : "GET" };
}
function reviewText(intent: X402Intent, resource?: X402CatalogResource): string {
  const option = intent.selectedOption;
  const network = option?.network || String(option?.originalAccept?.network || option?.binanceChainId || "not reported");
  return [
    `I prepared a live x402 v2 payment review for ${resource?.description || intent.resourceHost}.`,
    `Request: ${intent.requestMethod} ${intent.resourceUrl}`,
    `Payment: ${option?.amount || "amount not reported"} ${option?.tokenSymbol || "token not reported"}${option?.amountUsd ? ` (USD $${option.amountUsd})` : ""}`,
    `Network: ${network}`,
    `Recipient: ${option?.payTo || "not reported"}`,
    "The protected result is available only after payment. Would you like AgentPay to proceed with this exact purchase?",
  ].join("\n");
}
function syncActivity() { try { syncActivityEvents(); } catch { /* the source intent remains durable */ } }

export async function POST(request: Request) {
  try {
    const body = await request.json() as { sessionId?: unknown; message?: unknown; action?: unknown; candidateId?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message && body.action !== "cancel" && typeof body.candidateId !== "string") throw new X402Error("A message is required.", "INVALID_X402_MESSAGE");
    const session = typeof body.sessionId === "string" ? getX402Chat(body.sessionId) : createX402Chat();
    if (message) updateX402Chat(session.id, { message: { role: "user", content: message } });

    if (session.intentId && session.status === "awaiting_confirmation" && (body.action === "cancel" || isX402Decline(message))) {
      const intent = cancelX402Intent(session.intentId);
      syncActivity();
      const updated = updateX402Chat(session.id, { status: "cancelled", message: { role: "assistant", content: "Cancelled. No payment was signed or sent." }, intentId: intent.id });
      return Response.json({ session: updated, intent });
    }

    if (session.intentId && isX402Confirmation(message)) {
      const current = getX402Intent(session.intentId);
      if (session.status !== "awaiting_confirmation" || current.status !== "reviewed") {
        const updated = updateX402Chat(session.id, { message: { role: "assistant", content: "That purchase is no longer awaiting confirmation. I did not send another payment." } });
        return Response.json({ session: updated, intent: current });
      }
      const approved = approveX402(current.id);
      const intent = await payX402(approved.id);
      syncActivity();
      const content = intent.status === "completed"
        ? "Payment completed. I saved the purchase in Activity and returned the purchased result below."
        : `The payment was processed, but delivery failed: ${intent.errorMessage || "The service did not return a valid result."}`;
      const updated = updateX402Chat(session.id, { status: intent.status === "completed" ? "completed" : "failed", message: { role: "assistant", content }, intentId: intent.id });
      return Response.json({ session: updated, intent });
    }

    if (session.intentId && session.status === "awaiting_confirmation") {
      const updated = updateX402Chat(session.id, { message: { role: "assistant", content: "I have not treated that as payment authorization. Please clearly confirm this exact review, cancel it, or ask me to prepare a different purchase." } });
      return Response.json({ session: updated, intent: getX402Intent(session.intentId) });
    }

    if (informational(message)) {
      const content = "x402 is an HTTP payment protocol for paid APIs and digital services. AgentPay can search supported services or inspect a pasted endpoint, prepare a live payment review, enforce your trusted-endpoint and spending rules, ask for confirmation, pay through the connected Agentic Wallet, and return the purchased result. This AgentPay integration accepts x402 v2 on BSC, Base, and supported Solana networks only.";
      return Response.json({ session: updateX402Chat(session.id, { status: "active", message: { role: "assistant", content } }), candidates: [] });
    }

    const catalog = await listX402CatalogResources();
    const pasted = endpointFrom(message);
    const chosen = typeof body.candidateId === "string" ? catalog.resources.find(item => item.id === body.candidateId) : undefined;
    if (typeof body.candidateId === "string" && !chosen) throw new X402Error("That service is no longer available in the validated x402 search results.", "X402_SERVICE_NOT_FOUND");

    if (chosen || pasted) {
      const target = chosen ? { url: chosen.resourceUrl, method: chosen.method, requestBody: chosen.requestBody } : { ...pasted, requestBody: pasted?.method === "POST" ? {} : undefined };
      if (!target?.url) throw new X402Error("A valid x402 endpoint is required.", "INVALID_X402_URL");
      const prepared = await prepareX402({ url: target.url, method: target.method, requestBody: target.requestBody, source: "ai", catalogResourceId: chosen?.id, userRequest: message || chosen?.description });
      const ready = prepared.options.find(option => option.status === "READY_TO_SIGN");
      if (!ready) throw new X402Error("No supported payment option is ready to sign.", "X402_OPTION_NOT_READY");
      const intent = reviewX402(prepared.id, ready.index);
      syncActivity();
      const updated = updateX402Chat(session.id, { status: "awaiting_confirmation", message: { role: "assistant", content: reviewText(intent, chosen) }, intentId: intent.id });
      return Response.json({ session: updated, intent, candidates: [] });
    }

    const discovery = await discoverWithAi(message, catalog.resources);
    const updated = updateX402Chat(session.id, { status: "active", message: { role: "assistant", content: discovery.message } });
    return Response.json({ session: updated, discovery, candidates: discovery.candidates, catalogFailures: catalog.failures.length });
  } catch (error) { syncActivity(); return x402ErrorResponse(error); }
}
