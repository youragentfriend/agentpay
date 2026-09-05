"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentPaySettings } from "@/lib/settings-types";

const FRIENDLY_TIME_ZONES = [
  { value: "UTC", label: "GMT / UTC — Coordinated Universal Time" },
  { value: "America/New_York", label: "EST / EDT — New York, Toronto" },
  { value: "America/Chicago", label: "CST / CDT — Chicago, Mexico City" },
  { value: "America/Denver", label: "MST / MDT — Denver, Calgary" },
  { value: "America/Los_Angeles", label: "PST / PDT — Los Angeles, Vancouver" },
  { value: "America/Sao_Paulo", label: "UTC−3 — São Paulo, Buenos Aires" },
  { value: "Europe/London", label: "GMT / BST — London, Dublin" },
  { value: "Europe/Paris", label: "UTC+1 / UTC+2 — Paris, Berlin, Rome" },
  { value: "Asia/Dubai", label: "UTC+4 — Dubai, Abu Dhabi" },
  { value: "Asia/Kolkata", label: "UTC+5:30 — India, Sri Lanka" },
  { value: "Asia/Bangkok", label: "UTC+7 — Bangkok, Jakarta, Hanoi" },
  { value: "Asia/Singapore", label: "UTC+8 — Singapore, Beijing, Manila" },
  { value: "Asia/Tokyo", label: "UTC+9 — Tokyo, Seoul" },
  { value: "Australia/Sydney", label: "UTC+10 / UTC+11 — Sydney, Melbourne" },
] as const;

export function ProfileSettings({ settings, onSaved }: { settings: AgentPaySettings; onSaved: (settings: AgentPaySettings) => void }) {
  const [displayName, setDisplayName] = useState(settings.displayName);
  const [timeZone, setTimeZone] = useState(settings.timeZone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDisplayName(settings.displayName);
    setTimeZone(settings.timeZone);
  }, [settings.displayName, settings.timeZone]);

  const browserTimeZone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
    catch { return "UTC"; }
  }, []);

  const timeZoneOptions = useMemo(() => {
    if (FRIENDLY_TIME_ZONES.some((zone) => zone.value === settings.timeZone)) return FRIENDLY_TIME_ZONES;
    return [{ value: settings.timeZone, label: `Saved timezone — ${settings.timeZone}` }, ...FRIENDLY_TIME_ZONES];
  }, [settings.timeZone]);

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          displayCurrency: "USD",
          timeZone,
          perPaymentUsdLimit: settings.perPaymentUsdLimit,
          dailyUsdLimit: settings.dailyUsdLimit,
          trustedWalletDestinations: settings.trustedWalletDestinations,
          trustedX402Hosts: settings.trustedX402Hosts,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save settings.");
      onSaved(data as AgentPaySettings);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  let datePreview = "Invalid time zone";
  try {
    datePreview = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short", timeZone }).format(new Date());
  } catch { /* server validation will provide the actionable error */ }

  const savedAt = settings.updatedAt && Number.isFinite(Date.parse(settings.updatedAt)) ? `Saved ${new Date(settings.updatedAt).toLocaleString()}` : "Loading saved settings…";

  return <div className="settings-card profile-settings-card">
    <div className="settings-section-heading"><div><strong>Profile and localization</strong><span>Used across the Overview greeting, sidebar, and account controls.</span></div><span className="settings-saved-at">{savedAt}</span></div>
    <div className="settings-fields">
      <label className="field"><span>Display name</span><input value={displayName} maxLength={50} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your display name"/><small className="field-help">Your avatar initials update automatically.</small></label>
      <label className="field"><span>Display currency</span><select value="USD" disabled><option value="USD">USD</option></select><small className="field-help">USD is the currently supported valuation currency.</small></label>
      <label className="field"><span>Time zone</span><div className="timezone-control"><select value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>{timeZoneOptions.map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}</select><button className="secondary-button" type="button" onClick={() => setTimeZone(browserTimeZone)}>Use browser time zone</button></div><small className="field-help">Choose a familiar GMT, UTC, or regional timezone. Preview: {datePreview}</small></label>
    </div>
    {error && <div className="workflow-error">{error}</div>}
    {saved && <div className="settings-success">Settings saved. Your AgentPay identity has been updated.</div>}
    <div className="settings-actions"><button className="primary-button" disabled={saving || !displayName.trim() || !timeZone.trim()} onClick={() => void save()}>{saving ? "Saving…" : "Save settings"}</button></div>
  </div>;
}
