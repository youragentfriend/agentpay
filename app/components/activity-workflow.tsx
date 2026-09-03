"use client";

import { useCallback, useEffect, useState } from "react";
import type { PreparedTransfer } from "@/lib/payment-workflow";

export function ActivityWorkflow() {
  const [intents, setIntents] = useState<PreparedTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/payments/activity", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load activity.");
      setIntents(data.intents as PreparedTransfer[]);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Unable to load activity."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function refresh(intent: PreparedTransfer) {
    setError("");
    try {
      const response = await fetch("/api/payments/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: intent.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to refresh transaction.");
      await load();
    } catch (refreshError) { setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh transaction."); }
  }

  if (loading) return <div className="workflow-message">Loading payment activity…</div>;
  if (!intents.length) return <div className="empty-state"><div className="empty-icon">◷</div><h2>No payment activity</h2><p>Prepared, approved, submitted, and confirmed workflows will appear here.</p></div>;
  return <div className="activity-list">{error && <div className="workflow-error">{error}</div>}{intents.map((intent) => <article className="activity-card" key={intent.id}><div><span className={`review-status ${intent.status}`}>{intent.status.replace("-", " ")}</span><h2>{intent.amount} {intent.asset}</h2><p>{intent.chainName} · <span className="mono-value">{intent.recipient}</span></p>{intent.txHash && <p className="mono-value">{intent.txHash}</p>}{intent.errorMessage && <p className="activity-error">{intent.errorMessage}</p>}</div><div className="activity-side"><small>{new Date(intent.createdAt).toLocaleString()}</small>{intent.txHash && intent.status !== "confirmed" && <button className="secondary-button" onClick={() => void refresh(intent)}>Refresh status</button>}</div></article>)}</div>;
}
