"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentPayDiagnostics } from "@/lib/diagnostics-types";

type Destination = "binance" | "binance-pay" | "wallet" | "x402";

type DiagnosticsSettingsProps = {
  mode: "connections" | "diagnostics";
  onNavigate: (destination: Destination) => void;
};

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function tone(value: string) {
  if (["available", "connected", "configured", "ready", "operational"].includes(value)) return "success";
  if (["unavailable", "error", "degraded"].includes(value)) return "failed";
  return "awaiting";
}

function executionLabel(enabled: boolean) {
  return enabled ? "Execution enabled" : "Execution disabled · safe state";
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function DiagnosticsSettings({ mode, onNavigate }: DiagnosticsSettingsProps) {
  const [data, setData] = useState<AgentPayDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/diagnostics", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error("Diagnostics are temporarily unavailable.");
      setData(body as AgentPayDiagnostics);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Diagnostics are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return <div className="live-settings">
    <div className="diagnostics-toolbar">
      <div>
        <strong>{loading && !data ? "Checking live status…" : data ? `Last checked ${new Date(data.generatedAt).toLocaleString()}` : "Status not checked"}</strong>
        <span>Checks run server-side and never return credentials, balances, addresses, or provider error details.</span>
      </div>
      <button className="secondary-button" onClick={() => void refresh()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
    </div>
    {error && <div className="workflow-error">{error} <button onClick={() => void refresh()}>Retry</button></div>}
    {mode === "connections" && data && <ConnectionCards data={data} onNavigate={onNavigate}/>}
    {mode === "diagnostics" && data && <DiagnosticCards data={data}/>}
    {loading && !data && <div className="workflow-message">Loading connection and capability checks…</div>}
  </div>;
}

function ConnectionCards({ data, onNavigate }: { data: AgentPayDiagnostics; onNavigate: DiagnosticsSettingsProps["onNavigate"] }) {
  const wallet = data.connections.agenticWallet;
  const pay = data.connections.binancePay;
  const account = data.connections.binanceAccount;
  const x402 = data.connections.x402;
  const healthySources = account.sources.filter((source) => source.state === "available" || source.state === "empty").length;
  return <div className="connection-list live-connection-list">
    <ConnectionCard icon="W" title="Agentic Wallet" detail="Balances, transfers, and x402 signing" state={titleCase(wallet.state)} stateTone={tone(wallet.state)} facts={[executionLabel(wallet.executionEnabled)]} action="Manage" onClick={() => onNavigate("wallet")}/>
    <ConnectionCard icon="B" title="Binance Pay" detail="Payment links, receive links, and QR inspection" state={titleCase(pay.state)} stateTone={tone(pay.state)} facts={[pay.imageDecodeReady ? "QR decoder ready" : "QR decoder unavailable", executionLabel(pay.executionEnabled)]} action="Open" onClick={() => onNavigate("binance-pay")}/>
    <ConnectionCard icon="B" title="Binance Account" detail="Read-only Spot, Funding, Futures, Earn, and Margin visibility" state={titleCase(account.state)} stateTone={tone(account.state)} facts={["Read only", account.sources.length ? `${healthySources}/${account.sources.length} sources responding` : "Source health not checked"]} action="Manage" onClick={() => onNavigate("binance")}/>
    <ConnectionCard icon="×" title="x402" detail="Allowlisted service discovery and Agentic Wallet signing" state={titleCase(x402.state)} stateTone={tone(x402.state)} facts={[`${x402.allowedHostCount} allowed host${x402.allowedHostCount === 1 ? "" : "s"}`, executionLabel(x402.executionEnabled)]} action="Open" onClick={() => onNavigate("x402")}/>
  </div>;
}

function ConnectionCard({ icon, title, detail, state, stateTone, facts, action, onClick }: { icon: string; title: string; detail: string; state: string; stateTone: string; facts: string[]; action: string; onClick: () => void }) {
  return <div className="connection-row live-connection-row">
    <div className="connection-logo">{icon}</div>
    <div className="connection-copy"><strong>{title}</strong><span>{detail}</span><div className="connection-facts">{facts.map((fact) => <small key={fact}>{fact}</small>)}</div></div>
    <span className={`connection-state ${stateTone}`}>{state}</span>
    <button className="secondary-button" onClick={onClick}>{action}</button>
  </div>;
}

function DiagnosticCards({ data }: { data: AgentPayDiagnostics }) {
  const account = data.connections.binanceAccount;
  const availableSources = account.sources.filter((source) => source.state === "available" || source.state === "empty").length;
  const cards = [
    ["Aggregate status", titleCase(data.state), tone(data.state)],
    ["SQLite", titleCase(data.database.state), tone(data.database.state)],
    ["Agentic Wallet", titleCase(data.connections.agenticWallet.state), tone(data.connections.agenticWallet.state)],
    ["Binance Pay", titleCase(data.connections.binancePay.state), tone(data.connections.binancePay.state)],
    ["QR decoder", data.connections.binancePay.imageDecodeReady ? "Ready" : "Unavailable", data.connections.binancePay.imageDecodeReady ? "success" : "awaiting"],
    ["Binance Account", titleCase(account.state), tone(account.state)],
    ["Binance sources", account.sources.length ? `${availableSources}/${account.sources.length} responding` : "Not checked", account.sources.length && availableSources === account.sources.length ? "success" : "awaiting"],
    ["x402 capability", titleCase(data.connections.x402.state), tone(data.connections.x402.state)],
    ["x402 allowlist", `${data.connections.x402.allowedHostCount} host${data.connections.x402.allowedHostCount === 1 ? "" : "s"}`, data.connections.x402.allowedHostCount ? "success" : "awaiting"],
    ["Approval requirement", data.execution.approvalRequired ? "Locked on" : "Unavailable", data.execution.approvalRequired ? "success" : "failed"],
    ["Agentic Wallet execution", executionLabel(data.execution.agenticWallet), data.execution.agenticWallet ? "success" : "neutral"],
    ["Binance Pay execution", executionLabel(data.execution.binancePay), data.execution.binancePay ? "success" : "neutral"],
    ["x402 execution", executionLabel(data.execution.x402), data.execution.x402 ? "success" : "neutral"],
    ["Environment", titleCase(data.system.environment), "neutral"],
    ["Version", `v${data.system.buildVersion}`, "neutral"],
    ["Process uptime", formatUptime(data.system.uptimeSeconds), "neutral"],
  ] as const;
  return <div className="diagnostic-grid">{cards.map(([title, value, cardTone]) => <div className="diagnostic-card" key={title}><span>{title}</span><strong className={cardTone}>{value}</strong></div>)}</div>;
}
