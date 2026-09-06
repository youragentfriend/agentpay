"use client";

import { useEffect, useRef, useState } from "react";
import type { X402ChatSession, X402Intent } from "@/lib/x402-types";

type Status = {
  executionEnabled: boolean;
  supportedNetworks: string[];
  ai: { configured: boolean; provider: string | null; model: string | null };
};

export function X402Workflow({ initialUrl = "" }: { initialUrl?: string } = {}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [chat, setChat] = useState<X402ChatSession | null>(null);
  const [intent, setIntent] = useState<X402Intent | null>(null);
  const [message, setMessage] = useState(initialUrl ? `Pay for this x402 endpoint: ${initialUrl}` : "");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/x402/status", { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load x402 capabilities.");
        setStatus(data);
      })
      .catch(loadError => setError(loadError instanceof Error ? loadError.message : "Unable to load x402 capabilities."));
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [chat?.messages.length, intent?.status]);

  async function send(nextMessage = message.trim()) {
    if (!nextMessage) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/x402/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: chat?.id, message: nextMessage }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to continue the x402 conversation.");
      setChat(data.session);
      if (data.intent) setIntent(data.intent);
      setMessage("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to continue the x402 conversation.");
    } finally {
      setWorking(false);
    }
  }

  return <div className="binance-pay-workflow x402-workflow x402-chat-only">
    <section className="x402-finder-panel">
      <div className="x402-agent-heading">
        <img src="/brand/assistant-badge.svg" alt="AgentPay Assistant" />
        <div>
          <strong>Ask AgentPay</strong>
          <p>Find and pay for supported x402 services through one conversation.</p>
        </div>
        <span className={`rail-status ${status?.executionEnabled ? "success" : "neutral"}`}>
          {status?.executionEnabled ? "Payments ready" : "Payment disabled"}
        </span>
      </div>

      <div className="x402-chat-log" ref={logRef} aria-live="polite">
        {chat?.messages.length ? chat.messages.map(item => <div className={`x402-chat-message ${item.role}`} key={item.id}>
          <strong>{item.role === "assistant" ? "AgentPay" : "You"}</strong>
          <p>{item.content}</p>
        </div>) : <div className="x402-chat-empty">
          <strong>What x402 service do you need?</strong>
          <span>Ask for pay-per-call market data, premium API access, digital services, or paste an x402 endpoint.</span>
        </div>}

        {intent && ["reviewed", "approved"].includes(intent.status) && <PaymentReview intent={intent} />}
        {intent?.status === "completed" && <Result intent={intent} />}
        {intent?.status === "failed" && <div className="workflow-error"><strong>Purchase not delivered</strong><br />{intent.errorMessage}</div>}
      </div>

      {error && <div className="workflow-error">{error}</div>}
      {!status?.ai.configured && <div className="inline-state"><strong>Live-search agent requires configuration</strong><span>Connect a protected Gemini or OpenAI API key to let AgentPay search the live web for x402 services. Pasted endpoints can still be validated directly.</span></div>}
      <label className="field full">
        <span>Message AgentPay</span>
        <textarea
          rows={3}
          value={message}
          onChange={event => setMessage(event.target.value)}
          placeholder="Find pay-per-call Bitcoin market data, explain x402, or paste an endpoint…"
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
      </label>
      <button className="primary-button workflow-submit" disabled={!message.trim() || working} onClick={() => void send()}>
        {working ? "AgentPay is working…" : "Send message"}
      </button>
      <small className="x402-chat-note">AgentPay supports x402 v2 on BSC, Base, and supported Solana networks. It will not sign until you confirm an exact payment review.</small>
    </section>
  </div>;
}

function optionNetwork(intent: X402Intent) {
  const option = intent.selectedOption;
  return option?.network || String(option?.originalAccept?.network || option?.binanceChainId || "Network not reported");
}
function PaymentReview({ intent }: { intent: X402Intent }) {
  const option = intent.selectedOption;
  return <div className="x402-inline-review">
    <span className="review-status reviewed">Awaiting confirmation</span>
    <strong>{option?.amount || "—"} {option?.tokenSymbol || "Token"}{option?.amountUsd ? ` · $${option.amountUsd}` : ""}</strong>
    <small>{optionNetwork(intent)} · {intent.requestMethod} {intent.resourceUrl}</small>
    <code>{option?.payTo || "Recipient not reported"}</code>
    <p>Reply clearly to confirm this exact purchase, or cancel it. Questions and ambiguous replies will not authorize payment.</p>
  </div>;
}
function Result({ intent }: { intent: X402Intent }) {
  let body: unknown = intent.responseBody;
  try { if (intent.responseKind === "json" && intent.responseBody) body = JSON.parse(intent.responseBody); } catch { /* keep safe raw text */ }
  return <div className="x402-result">
    <div className="settings-success"><strong>Service delivered</strong> · HTTP {intent.responseStatus}</div>
    <div className="x402-provenance"><span>Source</span><code>{intent.requestMethod} {intent.resourceUrl}</code>{intent.settlementTxHash && <><span>Settlement</span><code>{intent.settlementTxHash}</code></>}</div>
    <pre>{typeof body === "string" ? body : JSON.stringify(body, null, 2)}</pre>
    {intent.resultTruncated && <small>Stored result was truncated to the safe display limit.</small>}
  </div>;
}
