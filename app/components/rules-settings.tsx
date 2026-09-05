"use client";

import { useEffect, useState } from "react";
import type { AgentPaySettings } from "@/lib/settings-types";

export function RulesSettings({ settings, onSaved }: { settings: AgentPaySettings; onSaved: (settings: AgentPaySettings) => void }) {
  const [perPaymentUsdLimit, setPerPaymentUsdLimit] = useState(settings.perPaymentUsdLimit ?? "");
  const [dailyUsdLimit, setDailyUsdLimit] = useState(settings.dailyUsdLimit ?? "");
  const [walletDestinations, setWalletDestinations] = useState(settings.trustedWalletDestinations.join("\n"));
  const [x402Hosts, setX402Hosts] = useState(settings.trustedX402Hosts.join("\n"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPerPaymentUsdLimit(settings.perPaymentUsdLimit ?? "");
    setDailyUsdLimit(settings.dailyUsdLimit ?? "");
    setWalletDestinations(settings.trustedWalletDestinations.join("\n"));
    setX402Hosts(settings.trustedX402Hosts.join("\n"));
  }, [settings.perPaymentUsdLimit, settings.dailyUsdLimit, settings.trustedWalletDestinations, settings.trustedX402Hosts]);

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: settings.displayName,
          displayCurrency: settings.displayCurrency,
          timeZone: settings.timeZone,
          perPaymentUsdLimit: perPaymentUsdLimit.trim() || null,
          dailyUsdLimit: dailyUsdLimit.trim() || null,
          trustedWalletDestinations: walletDestinations.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean),
          trustedX402Hosts: x402Hosts.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save rules.");
      onSaved(data as AgentPaySettings);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save rules.");
    } finally { setSaving(false); }
  }

  return <div className="settings-card rules-settings-card">
    <div className="locked-rule"><div><strong>Require approval for every payment</strong><span>Enforced for Agentic Wallet, Binance Pay, and x402. This safety rule cannot be disabled.</span></div><span className="rule-state success">Locked on</span></div>
    <div className="settings-fields">
      <label className="field"><span>Per-payment USD limit</span><div className="money-input"><b>$</b><input inputMode="decimal" value={perPaymentUsdLimit} onChange={(event) => setPerPaymentUsdLimit(event.target.value)} placeholder="No limit"/></div><small className="field-help">Leave blank for no limit. Payments without reliable USD data fail closed when set.</small></label>
      <label className="field"><span>Daily USD limit</span><div className="money-input"><b>$</b><input inputMode="decimal" value={dailyUsdLimit} onChange={(event) => setDailyUsdLimit(event.target.value)} placeholder="No limit"/></div><small className="field-help">UTC day, across all payment rails. Leave blank for no limit.</small></label>
      <label className="field full"><span>Trusted wallet destinations</span><textarea rows={4} value={walletDestinations} onChange={(event) => setWalletDestinations(event.target.value)} placeholder="One EVM or Solana address per line"/><small className="field-help">When populated, Agentic Wallet transfers to every other address are rejected.</small></label>
      <label className="field full"><span>Trusted x402 hosts</span><textarea rows={4} value={x402Hosts} onChange={(event) => setX402Hosts(event.target.value)} placeholder="api.example.com"/><small className="field-help">Hostnames only. The server environment allowlist still applies independently.</small></label>
    </div>
    {error && <div className="workflow-error">{error}</div>}
    {saved && <div className="settings-success">Rules saved and active on the server.</div>}
    <div className="settings-actions"><button className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save rules"}</button></div>
  </div>;
}
