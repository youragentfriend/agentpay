"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { X402CatalogService, X402ChatSession, X402Intent } from "@/lib/x402-types";

type Status = { executionEnabled: boolean; supportedNetworks: string[]; ai: { configured: boolean; provider: string | null; model: string | null } };
type MobilePanel = "chat" | "services";
const NETWORKS = [{ value: "", label: "All networks" }, { value: "eip155:56", label: "BSC" }, { value: "eip155:8453", label: "Base" }, { value: "solana:*", label: "Solana" }];
function networkLabel(network: string) { return network === "eip155:56" ? "BSC" : network === "eip155:8453" ? "Base" : network.startsWith("solana:") ? "Solana" : network; }
function selectionPrompt(service: X402CatalogService) { return `I want to use ${service.title} with the endpoint ${service.method} ${service.endpoint}.\n\nUse this service to `; }

export function X402Workflow({ initialUrl = "", initialMessage = "" }: { initialUrl?: string; initialMessage?: string } = {}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [chat, setChat] = useState<X402ChatSession | null>(null);
  const [intent, setIntent] = useState<X402Intent | null>(null);
  const [message, setMessage] = useState(initialUrl ? `Pay for this x402 endpoint: ${initialUrl}` : initialMessage);
  const [services, setServices] = useState<X402CatalogService[]>([]);
  const [selectedService, setSelectedService] = useState<X402CatalogService | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [network, setNetwork] = useState("");
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("chat");
  const [error, setError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [working, setWorking] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { void Promise.all([
    fetch("/api/x402/status", { cache: "no-store" }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load x402 capabilities."); setStatus(data); }),
    loadCatalog(),
  ]).catch(loadError => setError(loadError instanceof Error ? loadError.message : "Unable to load x402.")); }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }); }, [chat?.messages.length, intent?.status]);

  async function loadCatalog() {
    const response = await fetch("/api/x402/catalog", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load the x402 service catalog.");
    setServices(data.services);
  }
  async function removeService(service: X402CatalogService) {
    setCatalogError("");
    const response = await fetch(`/api/x402/catalog/${service.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) { setCatalogError(data.error || "Unable to remove this service."); return; }
    setServices(current => current.filter(item => item.id !== service.id));
    if (selectedService?.id === service.id) clearSelection();
  }
  function useService(service: X402CatalogService) {
    setSelectedService(service);
    setMessage(selectionPrompt(service));
    setMobilePanel("chat");
    requestAnimationFrame(() => { composerRef.current?.focus(); composerRef.current?.setSelectionRange(selectionPrompt(service).length, selectionPrompt(service).length); });
  }
  function clearSelection() {
    if (selectedService && message.startsWith(selectionPrompt(selectedService))) setMessage("");
    setSelectedService(null);
  }
  async function send(nextMessage = message.trim()) {
    if (!nextMessage) return;
    setWorking(true); setError("");
    try {
      const response = await fetch("/api/x402/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: chat?.id, message: nextMessage }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to continue the x402 conversation.");
      setChat(data.session); if (data.intent) setIntent(data.intent); setMessage(""); setSelectedService(null);
    } catch (sendError) { setError(sendError instanceof Error ? sendError.message : "Unable to continue the x402 conversation."); }
    finally { setWorking(false); }
  }

  const categories = useMemo(() => [...new Set(services.map(service => service.category))].sort(), [services]);
  const filtered = useMemo(() => services.filter(service => {
    const haystack = `${service.title} ${service.description} ${service.endpoint}`.toLowerCase();
    return (!query.trim() || haystack.includes(query.trim().toLowerCase())) && (!category || service.category === category) && (!network || service.networks.some(item => network === "solana:*" ? item.startsWith("solana:") : item === network));
  }), [services, query, category, network]);

  return <div className="binance-pay-workflow x402-workflow">
    <div className="x402-mobile-tabs" role="tablist" aria-label="x402 workspace">
      <button className={mobilePanel === "chat" ? "active" : ""} onClick={() => setMobilePanel("chat")}>Chat</button>
      <button className={mobilePanel === "services" ? "active" : ""} onClick={() => setMobilePanel("services")}>Services <span>{services.length}</span></button>
    </div>
    <div className="x402-workspace">
      <section className={`x402-finder-panel x402-chat-panel ${mobilePanel === "chat" ? "mobile-active" : ""}`}>
        <div className="x402-agent-heading">
          <img src="/brand/assistant-badge.svg" alt="AgentPay Assistant" />
          <div><strong>Ask AgentPay</strong><p>Choose a service or describe the x402 resource you need.</p></div>
          <span className={`rail-status ${status?.executionEnabled ? "success" : "neutral"}`}>{status?.executionEnabled ? "Payments ready" : "Payment disabled"}</span>
        </div>
        <div className="x402-chat-log" ref={logRef} aria-live="polite">
          {chat?.messages.length ? chat.messages.map(item => <div className={`x402-chat-message ${item.role}`} key={item.id}><strong>{item.role === "assistant" ? "AgentPay" : "You"}</strong><p>{item.content}</p></div>) : <div className="x402-chat-empty"><strong>What would you like to use?</strong><span>Pick a verified service from the catalog, ask a question, or paste an x402 endpoint.</span></div>}
          {intent && ["reviewed", "approved"].includes(intent.status) && <PaymentReview intent={intent} />}
          {intent?.status === "completed" && <Result intent={intent} />}
          {intent?.status === "failed" && <div className="workflow-error"><strong>Purchase not delivered</strong><br />{intent.errorMessage}</div>}
        </div>
        <div className="x402-composer">
          {selectedService && <div className="x402-selected-service"><div><span>Selected service</span><strong>{selectedService.title}</strong><code>{selectedService.method} {selectedService.endpoint}</code></div><button aria-label="Remove selected service" onClick={clearSelection}>×</button></div>}
          {error && <div className="workflow-error">{error}</div>}
          <label className="field full"><span>Message AgentPay</span><textarea ref={composerRef} rows={3} value={message} onChange={event => setMessage(event.target.value)} placeholder="Choose a service, describe what you need, or paste an endpoint…" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} /></label>
          <button className="primary-button workflow-submit" disabled={!message.trim() || working} onClick={() => void send()}>{working ? "AgentPay is working…" : "Send message"}</button>
          <small className="x402-chat-note">Catalog entries help choose an endpoint; they never create trust or authorize payment. AgentPay revalidates every request.</small>
        </div>
      </section>

      <aside className={`x402-catalog-panel ${mobilePanel === "services" ? "mobile-active" : ""}`}>
        <div className="x402-catalog-heading"><div><span className="eyebrow">x402 catalog</span><h2>Discover services</h2><p>Browse first. AI search is optional.</p></div><button className="secondary-button" onClick={() => setDiscoverOpen(value => !value)}>{discoverOpen ? "Close" : "Discover more"}</button></div>
        {discoverOpen && <div className="x402-discover-shell"><strong>Find another service</strong><input value={discoverQuery} onChange={event => setDiscoverQuery(event.target.value)} placeholder="e.g. historical crypto market data" /><p>Optional AI discovery will be connected after the catalog foundation. Your existing services remain available without it.</p><div><button className="primary-button" disabled>Search with AI</button><button className="secondary-button" onClick={() => { setDiscoverOpen(false); setDiscoverQuery(""); }}>Cancel</button></div></div>}
        <div className="x402-catalog-filters">
          <label><span>Search</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search services" /></label>
          <div><label><span>Category</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(item => <option key={item}>{item}</option>)}</select></label><label><span>Network</span><select value={network} onChange={event => setNetwork(event.target.value)}>{NETWORKS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
        </div>
        {catalogError && <div className="workflow-error">{catalogError}</div>}
        <div className="x402-service-list">
          {filtered.length ? filtered.map(service => <article className={`x402-service-card ${selectedService?.id === service.id ? "selected" : ""}`} key={service.id}>
            <div className="x402-service-title"><div><span>{service.category}</span><h3>{service.title}</h3></div><span className="x402-verified">{service.verificationStatus === "verified" ? "Verified" : "Candidate"}</span></div>
            <p>{service.description}</p>
            <div className="x402-network-chips">{service.networks.map(item => <span key={item}>{networkLabel(item)}</span>)}</div>
            <code>{service.method} {service.endpoint}</code>
            <small>Verified from live x402 v2 discovery metadata</small>
            <div className="x402-service-actions"><button className="primary-button" onClick={() => useService(service)}>{selectedService?.id === service.id ? "Selected" : "Use service"}</button><button className="secondary-button danger" onClick={() => void removeService(service)}>Remove</button></div>
          </article>) : <div className="x402-chat-empty"><strong>No matching services</strong><span>Clear a filter or discover another service later.</span></div>}
        </div>
      </aside>
    </div>
  </div>;
}

function optionNetwork(intent: X402Intent) { const option = intent.selectedOption; return option?.network || String(option?.originalAccept?.network || option?.binanceChainId || "Network not reported"); }
function PaymentReview({ intent }: { intent: X402Intent }) { const option = intent.selectedOption; return <div className="x402-inline-review"><span className="review-status reviewed">Awaiting confirmation</span><strong>{option?.amount || "—"} {option?.tokenSymbol || "Token"}{option?.amountUsd ? ` · $${option.amountUsd}` : ""}</strong><small>{optionNetwork(intent)} · {intent.requestMethod} {intent.resourceUrl}</small><code>{option?.payTo || "Recipient not reported"}</code><p>Reply clearly to confirm this exact purchase, or cancel it. Questions and ambiguous replies will not authorize payment.</p></div>; }
function Result({ intent }: { intent: X402Intent }) { let body: unknown = intent.responseBody; try { if (intent.responseKind === "json" && intent.responseBody) body = JSON.parse(intent.responseBody); } catch { /* keep safe raw text */ } return <div className="x402-result"><div className="settings-success"><strong>Service delivered</strong> · HTTP {intent.responseStatus}</div><div className="x402-provenance"><span>Source</span><code>{intent.requestMethod} {intent.resourceUrl}</code>{intent.settlementTxHash && <><span>Settlement</span><code>{intent.settlementTxHash}</code></>}</div><pre>{typeof body === "string" ? body : JSON.stringify(body, null, 2)}</pre>{intent.resultTruncated && <small>Stored result was truncated to the safe display limit.</small>}</div>; }
