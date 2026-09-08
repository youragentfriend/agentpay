"use client";

import { useEffect, useState } from "react";
import type { PaymentExecutionState, PaymentRail } from "@/lib/settings-types";

const RAILS: Array<{ id: PaymentRail; label: string; help: string }> = [
  { id: "agentic-wallet", label: "Agentic Wallet transfers", help: "Controls approval and execution of outgoing wallet transfers." },
  { id: "binance-pay", label: "Binance Pay payments", help: "Controls confirmation of outgoing Binance Pay payments." },
  { id: "x402", label: "x402 purchases", help: "Controls approval, signing, and payment of x402 purchases." },
];

export function PaymentExecutionControls() {
  const [state, setState] = useState<PaymentExecutionState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/settings/payment-execution", { cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load payment controls."); setState(data); })
      .catch(loadError => setError(loadError instanceof Error ? loadError.message : "Unable to load payment controls."));
  }, []);

  async function save(masterEnabled: boolean, rails: Record<PaymentRail, boolean>, enabling: boolean) {
    if (!state || saving) return;
    if (enabling && !window.confirm("Enable payment execution? Existing approval, trust, spending-limit, and server safety checks will still apply.")) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/settings/payment-execution", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterEnabled, rails, confirmEnable: enabling }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update payment controls.");
      setState(data as PaymentExecutionState);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to update payment controls."); }
    finally { setSaving(false); }
  }

  if (!state) return <section className="settings-card payment-controls-card"><div className="settings-section-heading"><div><strong>Payment execution controls</strong><span>Loading emergency-stop status…</span></div></div>{error && <div className="workflow-error">{error}</div>}</section>;
  const anyServerEnabled = Object.values(state.rails).some(rail => rail.serverEnabled);
  return <section className={`settings-card payment-controls-card ${state.masterEnabled ? "enabled" : "stopped"}`}>
    <div className="payment-master-control">
      <div><span className="eyebrow">Emergency stop</span><strong>{state.masterEnabled ? "Payment execution enabled" : "All outgoing payments stopped"}</strong><p>{state.masterEnabled ? "Only individually enabled rails may execute, and every existing safety rule still applies." : "Approvals and execution are blocked. Read-only, inspection, receive, Activity, and Reports features remain available."}</p></div>
      <button type="button" className={state.masterEnabled ? "danger-button" : "secondary-button"} disabled={saving || (!state.masterEnabled && !anyServerEnabled)} onClick={() => void save(!state.masterEnabled, Object.fromEntries(RAILS.map(rail => [rail.id, state.rails[rail.id].userEnabled])) as Record<PaymentRail, boolean>, !state.masterEnabled)}>{saving ? "Updating…" : state.masterEnabled ? "Stop all payments" : anyServerEnabled ? "Enable payments" : "Locked by server"}</button>
    </div>
    <div className="payment-rail-controls">{RAILS.map(rail => {
      const control = state.rails[rail.id];
      return <div className="payment-rail-control" key={rail.id}><div><strong>{rail.label}</strong><span>{rail.help}</span><small>{!control.serverEnabled ? "Unavailable: disabled by server configuration." : !state.masterEnabled ? control.userEnabled ? "Selected, but master emergency stop is active." : "Master emergency stop is active." : control.effectiveEnabled ? "Enabled" : "Disabled"}</small></div><button type="button" role="switch" aria-checked={control.userEnabled} className={`payment-control-switch ${control.userEnabled ? "on" : ""}`} disabled={saving || !control.serverEnabled} onClick={() => { const rails = Object.fromEntries(RAILS.map(item => [item.id, item.id === rail.id ? !control.userEnabled : state.rails[item.id].userEnabled])) as Record<PaymentRail, boolean>; void save(state.masterEnabled, rails, !control.userEnabled); }}><span /></button></div>;
    })}</div>
    <div className="payment-controls-footer"><span>Last changed {new Date(state.updatedAt).toLocaleString()}</span><span>Server controls always override these settings.</span></div>
    {error && <div className="workflow-error">{error}</div>}
  </section>;
}
