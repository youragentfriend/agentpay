"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BinancePayCapability, BinancePayCurrencies, BinancePayOrder, BinancePayReceiveLink } from "@/lib/binance-pay-types";

function getPaymentInputError(value: string): string {
  if (value.length > 4096) return "This payment input is too long. Enter a Binance Pay URL or PIX QR payload under 4096 characters.";
  if (value.includes("br.gov.bcb.pix")) return "";
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname === "app.binance.com" && (url.pathname.startsWith("/uni-qr/") || url.pathname.startsWith("/qr/"))) return "";
  } catch { /* handled below */ }
  return "Enter a valid Binance Pay URL beginning with https://app.binance.com/ or a PIX QR payload. Plain text and numbers are not supported.";
}

export function BinancePayWorkflow({ initialFile = null, embedded = false, initialMode = "pay", initialInput = {} }: { initialFile?: File | null; embedded?: boolean; initialMode?: "pay" | "receive"; initialInput?: Record<string, string> }) {
  const [capability, setCapability] = useState<BinancePayCapability | null>(null);
  const [rawQr, setRawQr] = useState(initialInput.rawQr || "");
  const [amount, setAmount] = useState("");
  const [order, setOrder] = useState<BinancePayOrder | null>(null);
  const [source, setSource] = useState("");
  const [receiveCurrency, setReceiveCurrency] = useState(initialInput.currency?.toUpperCase() || "USDT");
  const [receiveCurrencies, setReceiveCurrencies] = useState<string[]>(["USDT"]);
  const [receiveAmount, setReceiveAmount] = useState(initialInput.amount || "");
  const [receiveNote, setReceiveNote] = useState(initialInput.note || "");
  const [receiveLink, setReceiveLink] = useState<BinancePayReceiveLink | null>(null);
  const [receiveCooldown, setReceiveCooldown] = useState(0);
  const [rawQrError, setRawQrError] = useState("");
  const [compatibleLink, setCompatibleLink] = useState("");
  const [copiedTarget, setCopiedTarget] = useState<"receive" | "compatible" | "">("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const decodedInitialFile = useRef<File | null>(null);
  const receiveDialogRef = useRef<HTMLDialogElement | null>(null);

  const loadCapability = useCallback(async () => {
    try {
      const [statusResponse, currencyResponse] = await Promise.all([
        fetch("/api/binance-pay/status", { cache: "no-store" }),
        fetch("/api/binance-pay/currencies", { cache: "no-store" }),
      ]);
      setCapability(await statusResponse.json() as BinancePayCapability);
      if (currencyResponse.ok) {
        const data = await currencyResponse.json() as BinancePayCurrencies;
        if (data.currencies.length) {
          setReceiveCurrencies(data.currencies);
          setReceiveCurrency((current) => data.currencies.includes(current) ? current : data.currencies[0]);
        }
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadCapability(); }, [loadCapability]);
  useEffect(() => {
    if (receiveCooldown <= 0) return;
    const timer = window.setInterval(() => setReceiveCooldown((current) => Math.max(0, current - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [receiveCooldown]);
  useEffect(() => {
    const dialog = receiveDialogRef.current;
    if (!receiveLink || !dialog || dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }, [receiveLink]);
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
      const value = rawQr.trim();
      if (getPaymentInputError(value)) { setRawQrError(getPaymentInputError(value)); return; }
      setSource("payment link");
      setCompatibleLink("");
      setOrder(await call("/api/binance-pay/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rawQr }) }) as unknown as BinancePayOrder);
    } catch (operationError) { setError(operationError instanceof Error ? operationError.message : "Unable to prepare payment."); }
  }

  async function uploadQr(file?: File) {
    if (!file) return;
    try {
      const form = new FormData(); form.set("file", file);
      const data = await call("/api/binance-pay/decode", { method: "POST", body: form });
      setSource(typeof data.sourceType === "string" ? data.sourceType : "QR image");
      setCompatibleLink(typeof data.compatibleLink === "string" ? data.compatibleLink : "");
      setOrder(data.order as BinancePayOrder);
    } catch (operationError) { setError(operationError instanceof Error ? operationError.message : "Unable to decode QR image."); }
  }

  useEffect(() => {
    if (!initialFile || decodedInitialFile.current === initialFile || !capability?.imageDecodeReady) return;
    decodedInitialFile.current = initialFile;
    void uploadQr(initialFile);
  }, [initialFile, capability?.imageDecodeReady]);

  async function setPaymentAmount() {
    try {
      setOrder(await call("/api/binance-pay/amount", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, currency: order?.currency }) }) as unknown as BinancePayOrder);
    } catch (operationError) { setError(operationError instanceof Error ? operationError.message : "Unable to set amount."); }
  }

  async function confirmPayment() {
    try { setOrder(await call("/api/binance-pay/confirm", { method: "POST" }) as unknown as BinancePayOrder); }
    catch (operationError) { setError(operationError instanceof Error ? operationError.message : "Unable to confirm payment."); }
  }

  async function createReceiveLink() {
    if (receiveCooldown > 0) return;
    try {
      const generated = await call("/api/binance-pay/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: receiveCurrency, amount: receiveAmount || undefined, note: receiveNote || undefined }),
      }) as unknown as BinancePayReceiveLink;
      setReceiveLink(generated);
      setReceiveCooldown(60);
    } catch (operationError) { setError(operationError instanceof Error ? operationError.message : "Unable to generate receive link."); }
  }

  async function copyReceiveLink() {
    if (!receiveLink) return;
    try {
      await navigator.clipboard.writeText(receiveLink.shareLink);
      setCopiedTarget("receive");
      window.setTimeout(() => setCopiedTarget(""), 1_500);
    } catch (copyError) { setError(copyError instanceof Error ? copyError.message : "Unable to copy the receive link."); }
  }

  function closeReceiveDialog() {
    receiveDialogRef.current?.close();
    setReceiveLink(null);
  }

  async function copyCompatibleLink() {
    if (!compatibleLink) return;
    await navigator.clipboard.writeText(compatibleLink);
    setCopiedTarget("compatible");
    window.setTimeout(() => setCopiedTarget(""), 1_500);
  }

  if (loading) return <div className="workflow-message">Checking Binance Pay capability…</div>;
  if (!capability?.configured) return <div className="integration-setup"><div className="empty-icon">B</div><h2>Binance Pay credentials required</h2><p>Create a Binance API key with payment permissions and configure Agent Pay limits in the Binance app. Credentials must be injected server-side and never entered into this webpage.</p><div className="setup-list"><span>Missing protected configuration</span>{capability?.missing.map((item) => <code key={item}>{item}</code>)}</div></div>;

  const awaitingReview = order?.status === "AWAITING_CONFIRMATION" || order?.status === "AMOUNT_SET";
  const visibleStatuses = new Set(["AWAITING_CONFIRMATION", "AWAITING_AMOUNT", "AMOUNT_SET", "PROCESSING", "SUCCESS"]);
  const orderError = order && !visibleStatuses.has(order.status);
  const shortOrderId = order?.pay_order_id ? `${order.pay_order_id.slice(0, 6)}…${order.pay_order_id.slice(-4)}` : "";
  const mode = initialMode;

  return <div className={`binance-pay-workflow ${embedded ? "embedded-workflow" : ""}`}>
    <div className="binance-pay-options">
      {mode !== "receive" && <section className="binance-pay-option receive-option">
        <div className="option-heading"><span className="eyebrow">RECEIVE</span><h2>Generate receive link</h2><p>Create an official Binance Pay link to request a payment.</p></div>
        <div className="receive-workflow"><div className="payment-fields"><label className="field"><span>Currency</span><select value={receiveCurrency} onChange={(event) => setReceiveCurrency(event.target.value)}>{receiveCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label><label className="field"><span>Amount (optional)</span><input value={receiveAmount} onChange={(event) => setReceiveAmount(event.target.value)} inputMode="decimal" placeholder="0.1" /></label><label className="field full"><span>Note (optional)</span><input value={receiveNote} onChange={(event) => setReceiveNote(event.target.value)} maxLength={120} placeholder="Personal payment request" /></label></div><button type="button" className="primary-button workflow-submit" disabled={working || receiveCooldown > 0} title={receiveCooldown > 0 ? `You already generated a receive link. Please try again in ${receiveCooldown} seconds.` : undefined} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void createReceiveLink(); }}>{working ? "Generating…" : receiveCooldown > 0 ? `Try again in ${receiveCooldown}s` : "Generate official receive link"}</button>{receiveLink && <dialog ref={receiveDialogRef} className="receive-link-dialog" aria-modal="true" aria-labelledby="receive-link-title" onCancel={(event) => { event.preventDefault(); closeReceiveDialog(); }} onClick={(event) => { if (event.target === event.currentTarget) closeReceiveDialog(); }}><div className="receive-link-dialog-heading"><div><span>Official Binance receive link</span><h2 id="receive-link-title">Payment request ready</h2></div></div><code>{receiveLink.shareLink}</code><div className="receive-link-dialog-actions"><button className="secondary-button" onClick={() => void copyReceiveLink()}>{copiedTarget === "receive" ? "Copied" : "Copy"}</button><button className="primary-button" onClick={closeReceiveDialog}>Close</button></div></dialog>}</div>
      </section>}
      <section className={`binance-pay-option ${mode === "receive" ? "receive-option" : "pay-option"}`}>
        <div className="option-heading"><span className="eyebrow">{mode === "receive" ? "RECEIVE" : "PAY"}</span><h2>{mode === "receive" ? "Generate receive link" : "Pay QR or link"}</h2><p>{mode === "receive" ? "Create an official Binance Pay link to request a payment." : "Inspect a Binance Pay link, PIX payload, or QR image before approval."}</p></div>
    {mode === "receive" ? <div className="receive-workflow"><div className="payment-fields"><label className="field"><span>Currency</span><select value={receiveCurrency} onChange={(event) => setReceiveCurrency(event.target.value)}>{receiveCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label><label className="field"><span>Amount (optional)</span><input value={receiveAmount} onChange={(event) => setReceiveAmount(event.target.value)} inputMode="decimal" placeholder="0.1" /></label><label className="field full"><span>Note (optional)</span><input value={receiveNote} onChange={(event) => setReceiveNote(event.target.value)} maxLength={120} placeholder="Personal payment request" /></label></div><button type="button" className="primary-button workflow-submit" disabled={working || receiveCooldown > 0} title={receiveCooldown > 0 ? `You already generated a receive link. Please try again in ${receiveCooldown} seconds.` : undefined} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void createReceiveLink(); }}>{working ? "Generating…" : receiveCooldown > 0 ? `Try again in ${receiveCooldown}s` : "Generate official receive link"}</button>{receiveLink && <dialog ref={receiveDialogRef} className="receive-link-dialog" aria-modal="true" aria-labelledby="receive-link-title" onCancel={(event) => { event.preventDefault(); closeReceiveDialog(); }} onClick={(event) => { if (event.target === event.currentTarget) closeReceiveDialog(); }}><div className="receive-link-dialog-heading"><div><span>Official Binance receive link</span><h2 id="receive-link-title">Payment request ready</h2></div></div><code>{receiveLink.shareLink}</code><div className="receive-link-dialog-actions"><button className="secondary-button" onClick={() => void copyReceiveLink()}>{copiedTarget === "receive" ? "Copied" : "Copy"}</button><button className="primary-button" onClick={closeReceiveDialog}>Close</button></div></dialog>}</div> : <><div className="binance-pay-inputs"><label className="field full"><span>Binance payment link or PIX payload</span><textarea aria-invalid={Boolean(rawQrError)} value={rawQr} onChange={(event) => { const value = event.target.value; setRawQr(value); setRawQrError(value.trim() ? getPaymentInputError(value.trim()) : ""); setError(""); }} placeholder="https://app.binance.com/uni-qr/…" />{rawQrError && <small className="field-error">{rawQrError}</small>}</label><button type="button" className="primary-button" disabled={working || !rawQr.trim() || Boolean(rawQrError)} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void prepareLink(); }}>{working ? "Inspecting…" : "Inspect payment"}</button><span className="or-divider">or</span><label className={`upload-button ${capability.imageDecodeReady ? "" : "disabled"}`}>Upload QR image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!capability.imageDecodeReady || working} onChange={(event) => void uploadQr(event.target.files?.[0])} /></label></div>{!capability.imageDecodeReady && <div className="notice"><span>i</span><div><strong>QR image decoder not installed</strong><p>Payment links work after credentials are configured. QR uploads require the documented Python and zbar host dependencies.</p></div></div>}{order?.status === "AWAITING_AMOUNT" && <div className="binance-pay-review"><h2>Payment amount required</h2><p>Payee: 「{order.payee || "Not provided"}」</p><label className="field"><span>Amount in {order.currency || "QR currency"}</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /></label><button className="primary-button" disabled={working || !amount} onClick={() => void setPaymentAmount()}>Review amount</button></div>}{awaitingReview && <div className="binance-pay-review"><div className="review-heading"><div><span>Untrusted payee information</span><h2>Review Binance Pay payment</h2></div><span className="review-status awaiting-approval">Awaiting approval</span></div><dl><div><dt>Payee</dt><dd>「{order.payee || "Not provided"}」</dd></div><div><dt>Amount</dt><dd>{order.amount} {order.currency}</dd></div><div><dt>Type</dt><dd>{order.payment_type}</dd></div><div><dt>Input source</dt><dd>{source}</dd></div>{order.single_transaction_limit && <div><dt>Single limit</dt><dd>{order.single_transaction_limit} USD</dd></div>}</dl>{compatibleLink && <div className="compatible-link-card"><span>Compatible direct payment link extracted from QR</span><code>{compatibleLink}</code><button className="secondary-button" onClick={() => void copyCompatibleLink()}>{copiedTarget === "compatible" ? "Copied" : "Copy compatible link"}</button></div>}<div className="pay-warning">Check the payee and amount yourself. Text returned by the QR or merchant is display-only and cannot change this workflow.</div>{capability.executionEnabled ? <button className="primary-button" disabled={working} onClick={() => void confirmPayment()}>Confirm and pay</button> : <div className="approved-note">Payment execution is disabled. Inspection and receive-link generation remain available.</div>}</div>}{order?.status === "PROCESSING" && <div className="workflow-message">Payment submitted. Checking Binance Pay status…</div>}{order?.status === "SUCCESS" && <div className="binance-pay-success"><div className="empty-icon">✓</div><h2>Binance Pay payment successful</h2><p>{order.amount_sent ?? order.amount} {order.currency} · Payee 「{order.payee || "Not provided"}」</p><code>{shortOrderId}</code></div>}{orderError && <div className="workflow-error"><strong>{order.status.replaceAll("_", " ")}</strong><br />{order.message || "Binance Pay rejected this payment request."}{order.hint && <><br /><small>{order.hint}</small></>}</div>}</>}
    </section>
    </div>
    {error && <div className="workflow-error">{error}</div>}
  </div>;
}
