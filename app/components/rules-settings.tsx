"use client";

import { useEffect, useState } from "react";
import { SPENDING_LIMIT_RULES, spendingLimitError } from "@/lib/settings-types";
import type { AgentPaySettings, PaymentRail, SpendingLimits } from "@/lib/settings-types";

const RAILS: Array<{ id: PaymentRail; label: string; help: string }> = [
  { id: "binance-pay", label: "Binance Pay", help: "Applied only to Binance Pay transactions." },
  { id: "x402", label: "x402", help: "Applied only to approved x402 purchases with a reliable USD valuation." },
  { id: "agentic-wallet", label: "Agentic Wallet", help: "Applied only to direct Agentic Wallet transfers." },
];

export function RulesSettings({ settings, onSaved }: { settings: AgentPaySettings; onSaved: (settings: AgentPaySettings) => void }) {
  const [activeRail, setActiveRail] = useState<PaymentRail>("binance-pay");
  const [limits, setLimits] = useState<SpendingLimits>(settings.spendingLimits);
  const [walletDestinations, setWalletDestinations] = useState(settings.trustedWalletDestinations.join("\n"));
  const [x402Endpoints, setX402Endpoints] = useState(settings.trustedX402Endpoints.join("\n"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLimits(settings.spendingLimits);
    setWalletDestinations(settings.trustedWalletDestinations.join("\n"));
    setX402Endpoints(settings.trustedX402Endpoints.join("\n"));
  }, [settings.spendingLimits, settings.trustedWalletDestinations, settings.trustedX402Endpoints]);

  function setLimit(field: "perPaymentUsdLimit" | "dailyUsdLimit", value: string) {
    setLimits((current) => ({ ...current, [activeRail]: { ...current[activeRail], [field]: value } }));
  }

  async function save() {
    const invalidRail = RAILS.find(({ id }) => spendingLimitError(id, "perPaymentUsdLimit", limits[id].perPaymentUsdLimit) || spendingLimitError(id, "dailyUsdLimit", limits[id].dailyUsdLimit));
    if (invalidRail) {
      setActiveRail(invalidRail.id);
      setError("Fix the highlighted spending limit before saving.");
      setSaved(false);
      return;
    }
    setSaving(true); setError(""); setSaved(false);
    try {
      const normalizedLimits = Object.fromEntries(Object.entries(limits).map(([rail, value]) => [rail, {
        perPaymentUsdLimit: value.perPaymentUsdLimit?.trim() || null,
        dailyUsdLimit: value.dailyUsdLimit?.trim() || null,
      }])) as SpendingLimits;
      const response = await fetch("/api/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: settings.displayName, profileImageDataUrl: settings.profileImageDataUrl, displayCurrency: settings.displayCurrency, timeZone: settings.timeZone,
          spendingLimits: normalizedLimits,
          trustedWalletDestinations: walletDestinations.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean),
          trustedX402Hosts: settings.trustedX402Hosts,
          trustedX402Endpoints: x402Endpoints.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
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
  const rule = SPENDING_LIMIT_RULES[activeRail];
  const perPaymentError = spendingLimitError(activeRail, "perPaymentUsdLimit", active.perPaymentUsdLimit);
  const dailyError = spendingLimitError(activeRail, "dailyUsdLimit", active.dailyUsdLimit);
  const hasAnyLimitError = RAILS.some(({ id }) => spendingLimitError(id, "perPaymentUsdLimit", limits[id].perPaymentUsdLimit) || spendingLimitError(id, "dailyUsdLimit", limits[id].dailyUsdLimit));
  return <div className="rules-settings-card">
    <div className="locked-rule settings-card"><div><strong>Require approval for every payment</strong><span>Enforced for Agentic Wallet, Binance Pay, and x402. This safety rule cannot be disabled.</span></div><span className="rule-state success">Locked on</span></div>
    <div className="trusted-rules-grid">
      <section className="settings-card trusted-rule-card"><div className="settings-section-heading"><div><strong>Trusted wallet destinations</strong><span>Agentic Wallet rejects every other destination when this list is populated.</span></div></div><label className="field"><textarea rows={4} value={walletDestinations} onChange={(event) => setWalletDestinations(event.target.value)} placeholder="One EVM or Solana address per line"/></label></section>
      <section className="settings-card trusted-rule-card"><div className="settings-section-heading"><div><strong>Trusted x402 endpoints</strong><span>Exact HTTP method and HTTPS URL. The server host allowlist and SSRF checks still apply independently.</span></div></div><label className="field"><textarea rows={4} value={x402Endpoints} onChange={(event) => setX402Endpoints(event.target.value)} placeholder="GET https://api.example.com/resource"/></label>{settings.trustedX402Hosts.length>0&&<small className="field-help">Legacy hosts were retained for migration visibility but do not grant endpoint trust.</small>}</section>
    </div>
    <section className="settings-card spending-rules-card">
      <div className="settings-section-heading"><div><strong>Spending limits</strong><span>Configure independent limits for each payment rail.</span></div></div>
      <div className="spending-limit-tabs" role="tablist" aria-label="Payment rail spending limits">{RAILS.map((item) => { const invalid = Boolean(spendingLimitError(item.id, "perPaymentUsdLimit", limits[item.id].perPaymentUsdLimit) || spendingLimitError(item.id, "dailyUsdLimit", limits[item.id].dailyUsdLimit)); return <button type="button" role="tab" aria-selected={activeRail === item.id} className={`${activeRail === item.id ? "active" : ""}${invalid ? " has-error" : ""}`} key={item.id} onClick={() => setActiveRail(item.id)}>{item.label}</button>; })}</div>
      <div className="spending-limit-panel" role="tabpanel">
        <div className="settings-fields two-column-settings">
          <label className="field"><span>Per-payment USD limit</span><div className={`money-input ${perPaymentError ? "invalid" : ""}`}><b>$</b><input type="number" inputMode="decimal" min={rule.minimum} max={rule.perPaymentMaximum} step={rule.minimum} required aria-invalid={Boolean(perPaymentError)} value={active.perPaymentUsdLimit ?? ""} onChange={(event) => setLimit("perPaymentUsdLimit", event.target.value)} placeholder={`${rule.minimum} - ${rule.perPaymentMaximum}`}/></div>{perPaymentError ? <small className="field-error">{perPaymentError}</small> : <small className="field-help">Allowed range: {rule.minimum} - {rule.perPaymentMaximum}</small>}</label>
          <label className="field"><span>Daily USD limit</span><div className={`money-input ${dailyError ? "invalid" : ""}`}><b>$</b><input type="number" inputMode="decimal" min={rule.minimum} max={rule.dailyMaximum} step={rule.minimum} required aria-invalid={Boolean(dailyError)} value={active.dailyUsdLimit ?? ""} onChange={(event) => setLimit("dailyUsdLimit", event.target.value)} placeholder={`${rule.minimum} - ${rule.dailyMaximum}`}/></div>{dailyError ? <small className="field-error">{dailyError}</small> : <small className="field-help">Allowed range: {rule.minimum} - {rule.dailyMaximum}</small>}</label>
        </div>
        <small className="field-help">{rail.help} Payments without reliable USD data fail closed when a limit is set.</small>
      </div>
    </section>
    {error && <div className="workflow-error">{error}</div>}
    {saved && <div className="settings-success">Rules saved and active on the server.</div>}
    <div className="settings-actions"><button className="primary-button" disabled={saving || hasAnyLimitError} onClick={() => void save()}>{saving ? "Saving…" : "Save rules"}</button></div>
  </div>;
}
