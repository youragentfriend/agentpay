"use client";

import { useEffect, useState } from "react";
import type { AgentPaySettings, PaymentRail, SpendingLimits } from "@/lib/settings-types";

const RAILS: Array<{ id: PaymentRail; label: string; perPaymentRange: string; dailyRange: string; minimum: string; perPaymentMaximum: string; dailyMaximum: string; step: string; help: string }> = [
  { id: "binance-pay", label: "Binance Pay", perPaymentRange: "0.0001 - 50", dailyRange: "0.0001 - 100", minimum: "0.0001", perPaymentMaximum: "50", dailyMaximum: "100", step: "0.0001", help: "Applied only to Binance Pay transactions." },
  { id: "x402", label: "x402", perPaymentRange: "0.0001 - 20", dailyRange: "0.0001 - 20", minimum: "0.0001", perPaymentMaximum: "20", dailyMaximum: "20", step: "0.0001", help: "Applied only to approved x402 purchases with a reliable USD valuation." },
  { id: "agentic-wallet", label: "Agentic Wallet", perPaymentRange: "0.00001 - 50", dailyRange: "0.00001 - 100", minimum: "0.00001", perPaymentMaximum: "50", dailyMaximum: "100", step: "0.00001", help: "Applied only to direct Agentic Wallet transfers." },
];

export function RulesSettings({ settings, onSaved }: { settings: AgentPaySettings; onSaved: (settings: AgentPaySettings) => void }) {
  const [activeRail, setActiveRail] = useState<PaymentRail>("binance-pay");
  const [limits, setLimits] = useState<SpendingLimits>(settings.spendingLimits);
  const [walletDestinations, setWalletDestinations] = useState(settings.trustedWalletDestinations.join("\n"));
  const [x402Hosts, setX402Hosts] = useState(settings.trustedX402Hosts.join("\n"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLimits(settings.spendingLimits);
    setWalletDestinations(settings.trustedWalletDestinations.join("\n"));
    setX402Hosts(settings.trustedX402Hosts.join("\n"));
  }, [settings.spendingLimits, settings.trustedWalletDestinations, settings.trustedX402Hosts]);

  function setLimit(field: "perPaymentUsdLimit" | "dailyUsdLimit", value: string) {
    setLimits((current) => ({ ...current, [activeRail]: { ...current[activeRail], [field]: value } }));
  }

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const normalizedLimits = Object.fromEntries(Object.entries(limits).map(([rail, value]) => [rail, {
        perPaymentUsdLimit: value.perPaymentUsdLimit?.trim() || null,
        dailyUsdLimit: value.dailyUsdLimit?.trim() || null,
      }])) as SpendingLimits;
      const response = await fetch("/api/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: settings.displayName, displayCurrency: settings.displayCurrency, timeZone: settings.timeZone,
          spendingLimits: normalizedLimits,
          trustedWalletDestinations: walletDestinations.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean),
          trustedX402Hosts: x402Hosts.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save rules.");
      onSaved(data as AgentPaySettings); setSaved(true);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to save rules."); }
    finally { setSaving(false); }
  }

  const active = limits[activeRail];
  const rail = RAILS.find((item) => item.id === activeRail) as (typeof RAILS)[number];
  return <div className="rules-settings-card">
    <div className="locked-rule settings-card"><div><strong>Require approval for every payment</strong><span>Enforced for Agentic Wallet, Binance Pay, and x402. This safety rule cannot be disabled.</span></div><span className="rule-state success">Locked on</span></div>
    <section className="settings-card spending-rules-card">
      <div className="settings-section-heading"><div><strong>Spending limits</strong><span>Configure independent limits for each payment rail.</span></div></div>
      <div className="spending-limit-tabs" role="tablist" aria-label="Payment rail spending limits">{RAILS.map((item) => <button type="button" role="tab" aria-selected={activeRail === item.id} className={activeRail === item.id ? "active" : ""} key={item.id} onClick={() => setActiveRail(item.id)}>{item.label}</button>)}</div>
      <div className="spending-limit-panel" role="tabpanel">
        <div className="settings-fields two-column-settings">
          <label className="field"><span>Per-payment USD limit</span><div className="money-input"><b>$</b><input type="number" inputMode="decimal" min={rail.minimum} max={rail.perPaymentMaximum} step={rail.step} required value={active.perPaymentUsdLimit ?? ""} onChange={(event) => setLimit("perPaymentUsdLimit", event.target.value)} placeholder={rail.perPaymentRange}/></div><small className="field-help">Allowed range: {rail.perPaymentRange}</small></label>
          <label className="field"><span>Daily USD limit</span><div className="money-input"><b>$</b><input type="number" inputMode="decimal" min={rail.minimum} max={rail.dailyMaximum} step={rail.step} required value={active.dailyUsdLimit ?? ""} onChange={(event) => setLimit("dailyUsdLimit", event.target.value)} placeholder={rail.dailyRange}/></div><small className="field-help">Allowed range: {rail.dailyRange}</small></label>
        </div>
        <small className="field-help">{rail.help} Payments without reliable USD data fail closed when a limit is set.</small>
      </div>
    </section>
    <div className="trusted-rules-grid">
      <section className="settings-card trusted-rule-card"><div className="settings-section-heading"><div><strong>Trusted wallet destinations</strong><span>Agentic Wallet rejects every other destination when this list is populated.</span></div></div><label className="field"><textarea rows={4} value={walletDestinations} onChange={(event) => setWalletDestinations(event.target.value)} placeholder="One EVM or Solana address per line"/></label></section>
      <section className="settings-card trusted-rule-card"><div className="settings-section-heading"><div><strong>Trusted x402 hosts</strong><span>Hostnames only. The server environment allowlist still applies independently.</span></div></div><label className="field"><textarea rows={4} value={x402Hosts} onChange={(event) => setX402Hosts(event.target.value)} placeholder="api.example.com"/></label></section>
    </div>
    {error && <div className="workflow-error">{error}</div>}
    {saved && <div className="settings-success">Rules saved and active on the server.</div>}
    <div className="settings-actions"><button className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save rules"}</button></div>
  </div>;
}
