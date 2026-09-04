"use client";

import { useCallback, useEffect, useState } from "react";
import type { PreparedTransfer } from "@/lib/payment-workflow";
import type { BinancePayReceipt } from "@/lib/binance-pay-types";
import type { X402Intent } from "@/lib/x402-types";

export function ActivityWorkflow() {
  const [intents, setIntents] = useState<PreparedTransfer[]>([]);
  const [binancePayReceipts, setBinancePayReceipts] = useState<BinancePayReceipt[]>([]);
  const [x402Intents, setX402Intents] = useState<X402Intent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/payments/activity", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load activity.");
      setIntents(data.intents as PreparedTransfer[]);
      setBinancePayReceipts((data.binancePayReceipts ?? []) as BinancePayReceipt[]);
      setX402Intents((data.x402Intents ?? []) as X402Intent[]);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Unable to load activity."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const pending = intents.filter((intent) => intent.status === "submitted" || intent.status === "submitting");
    if (!pending.length) return;
    const timer = window.setInterval(() => {
      void Promise.all(pending.map((intent) => fetch("/api/payments/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: intent.id }),
      }))).then(() => load());
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [intents, load]);

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
  if (!intents.length && !binancePayReceipts.length && !x402Intents.length) return <div className="empty-state"><div className="empty-icon">◷</div><h2>No payment activity</h2><p>Prepared, approved, submitted, and confirmed workflows will appear here.</p></div>;
  return <div className="activity-list">{error && <div className="workflow-error">{error}</div>}{x402Intents.map((intent) => <article className="activity-card" key={`x402-${intent.id}`}><div><span className={`review-status ${intent.status}`}>{intent.status.replaceAll("-", " ")}</span><h2>x402 · {intent.resourceHost}</h2><p>{intent.selectedIndex ? `Payment option ${intent.selectedIndex}` : "Payment requirement inspected"}</p>{intent.errorMessage && <p className="activity-error">{intent.errorMessage}</p>}</div><div className="activity-side"><small>{new Date(intent.updatedAt).toLocaleString()}</small>{intent.responseStatus && <code>HTTP {intent.responseStatus}</code>}</div></article>)}{binancePayReceipts.map((receipt) => <article className="activity-card" key={`binance-pay-${receipt.id}`}><div><span className={`review-status ${receipt.status.toLowerCase()}`}>{receipt.status.replaceAll("_", " ")}</span><h2>{receipt.amount_sent ?? receipt.amount} {receipt.currency}</h2><p>Binance Pay · Payee 「{receipt.payee || "Not provided"}」</p>{receipt.paid_with?.length ? <p>Paid with {receipt.paid_with.map((item) => `${item.amount} ${item.asset}`).join(" + ")}</p> : null}</div><div className="activity-side"><small>{new Date(receipt.updatedAt).toLocaleString()}</small><code>{receipt.pay_order_id ? `${receipt.pay_order_id.slice(0, 6)}…${receipt.pay_order_id.slice(-4)}` : "Prepared"}</code></div></article>)}{intents.map((intent) => <article className="activity-card" key={intent.id}><div><span className={`review-status ${intent.status}`}>{intent.status.replace("-", " ")}</span><h2>{intent.amount} {intent.asset}</h2><p>{intent.chainName} · <span className="activity-address" title={intent.recipient}>{intent.recipient}</span></p>{intent.txHash && <p className="activity-hash" title={intent.txHash}>{intent.txHash}</p>}{intent.errorMessage && <p className="activity-error">{intent.errorMessage}</p>}</div><div className="activity-side"><small>{new Date(intent.createdAt).toLocaleString()}</small>{intent.txHash && (intent.status === "submitted" || intent.status === "submitting") && <button className="secondary-button" onClick={() => void refresh(intent)}>Refresh status</button>}</div></article>)}</div>;
}
