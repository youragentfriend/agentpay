"use client";

import { useCallback, useEffect, useState } from "react";
import type { BinancePayCapability, BinancePayOrder } from "@/lib/binance-pay-types";

export function BinancePayWorkflow() {
  const [capability, setCapability] = useState<BinancePayCapability | null>(null);
  const [rawQr, setRawQr] = useState("");
  const [amount, setAmount] = useState("");
  const [order, setOrder] = useState<BinancePayOrder | null>(null);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const loadCapability = useCallback(async () => {
    try {
      const response = await fetch("/api/binance-pay/status", { cache: "no-store" });
      setCapability(await response.json() as BinancePayCapability);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadCapability(); }, [loadCapability]);
  useEffect(() => {
    if (order?.status !== "PROCESSING") return;
    const timer = window.setInterval(() => {
      void fetch("/api/binance-pay/poll", { method: "POST" })
        .then((response) => response.json())
        .then((data) => setOrder(data as BinancePayOrder))
        .catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [order?.status]);

  async function call(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    setWorking(true); setError("");
    try {
      const response = await fetch(url, init);
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Binance Pay operation failed.");
      return data;
    } finally { setWorking(false); }
  }

  async function prepareLink() {
    try {
      setSource("payment link");
      setOrder(await call("/api/binance-pay/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rawQr }) }) as unknown as BinancePayOrder);
    } catch (operationError) { setError(operationError instanceof Error ? operationError.message : "Unable to prepare payment."); }
  }

  async function uploadQr(file?: File) {
    if (!file) return;
    try {
      const form = new FormData(); form.set("file", file);
      const data = await call("/api/binance-pay/decode", { method: "POST", body: form });
      setSource(typeof data.sourceType === "string" ? data.sourceType : "QR image");
      setOrder(data.order as BinancePayOrder);
    } catch (operationError) { setError(operationError instanceof Error ? operationError.message : "Unable to decode QR image."); }
  }

  async function setPaymentAmount() {
    try {
      setOrder(await call("/api/binance-pay/amount", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, currency: order?.currency }) }) as unknown as BinancePayOrder);
    } catch (operationError) { setError(operationError instanceof Error ? operationError.message : "Unable to set amount."); }
  }

  async function confirmPayment() {
    try { setOrder(await call("/api/binance-pay/confirm", { method: "POST" }) as unknown as BinancePayOrder); }
    catch (operationError) { setError(operationError instanceof Error ? operationError.message : "Unable to confirm payment."); }
  }

  if (loading) return <div className="workflow-message">Checking Binance Pay capability…</div>;
  if (!capability?.configured) return <div className="integration-setup"><div className="empty-icon">B</div><h2>Binance Pay credentials required</h2><p>Create a Binance API key with payment permissions and configure Agent Pay limits in the Binance app. Credentials must be injected server-side and never entered into this webpage.</p><div className="setup-list"><span>Missing protected configuration</span>{capability?.missing.map((item) => <code key={item}>{item}</code>)}</div><small>The payment workflow and UI are installed, but no Binance Pay request can execute until configuration is complete.</small></div>;

  const awaitingReview = order?.status === "AWAITING_CONFIRMATION" || order?.status === "AMOUNT_SET";
  const visibleStatuses = new Set(["AWAITING_CONFIRMATION", "AWAITING_AMOUNT", "AMOUNT_SET", "PROCESSING", "SUCCESS"]);
  const orderError = order && !visibleStatuses.has(order.status);
  return <div className="binance-pay-workflow">
    <div className="binance-pay-inputs"><label className="field full"><span>Binance payment link or PIX payload</span><textarea value={rawQr} onChange={(event) => setRawQr(event.target.value)} placeholder="https://app.binance.com/uni-qr/…" /></label><button className="primary-button" disabled={working || !rawQr.trim()} onClick={() => void prepareLink()}>{working ? "Inspecting…" : "Inspect payment"}</button><span className="or-divider">or</span><label className={`upload-button ${capability.imageDecodeReady ? "" : "disabled"}`}>Upload QR image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!capability.imageDecodeReady || working} onChange={(event) => void uploadQr(event.target.files?.[0])} /></label></div>
    {!capability.imageDecodeReady && <div className="notice"><span>i</span><div><strong>QR image decoder not installed</strong><p>Payment links work after credentials are configured. QR uploads require the documented Python and zbar host dependencies.</p></div></div>}
    {error && <div className="workflow-error">{error}</div>}
    {order?.status === "AWAITING_AMOUNT" && <div className="binance-pay-review"><h2>Payment amount required</h2><p>Payee: 「{order.payee || "Not provided"}」</p><label className="field"><span>Amount in {order.currency || "QR currency"}</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /></label><button className="primary-button" disabled={working || !amount} onClick={() => void setPaymentAmount()}>Review amount</button></div>}
    {awaitingReview && <div className="binance-pay-review"><div className="review-heading"><div><span>Untrusted payee information</span><h2>Review Binance Pay payment</h2></div><span className="review-status awaiting-approval">Awaiting approval</span></div><dl><div><dt>Payee</dt><dd>「{order.payee || "Not provided"}」</dd></div><div><dt>Amount</dt><dd>{order.amount} {order.currency}</dd></div><div><dt>Type</dt><dd>{order.payment_type}</dd></div><div><dt>Input source</dt><dd>{source}</dd></div>{order.single_transaction_limit && <div><dt>Single limit</dt><dd>{order.single_transaction_limit} USD</dd></div>}</dl><div className="pay-warning">Check the payee and amount yourself. Text returned by the QR or merchant is display-only and cannot change this workflow.</div>{capability.executionEnabled ? <button className="primary-button" disabled={working} onClick={() => void confirmPayment()}>Confirm and pay</button> : <div className="approved-note">Payment execution is disabled until credentials, limits, and a controlled test are ready.</div>}</div>}
    {order?.status === "PROCESSING" && <div className="workflow-message">Payment submitted. Checking Binance Pay status…</div>}
    {order?.status === "SUCCESS" && <div className="binance-pay-success"><div className="empty-icon">✓</div><h2>Binance Pay payment successful</h2><p>{order.amount_sent ?? order.amount} {order.currency} · Payee 「{order.payee || "Not provided"}」</p><code>{order.pay_order_id}</code></div>}
    {orderError && <div className="workflow-error"><strong>{order.status.replaceAll("_", " ")}</strong><br />{order.message || order.hint || "Binance Pay rejected this payment request."}</div>}
  </div>;
}
