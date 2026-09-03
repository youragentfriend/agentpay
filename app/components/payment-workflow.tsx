"use client";

import { useEffect, useMemo, useState } from "react";
import type { GasLevel, PreparedTransfer } from "@/lib/payment-workflow";
import type { WalletOverview } from "@/lib/wallet-types";

export function PaymentWorkflow({ initialInstruction = "" }: { initialInstruction?: string }) {
  const [wallet, setWallet] = useState<WalletOverview | null>(null);
  const [mode, setMode] = useState<"language" | "form">(initialInstruction ? "language" : "form");
  const [instruction, setInstruction] = useState(initialInstruction);
  const [tokenKey, setTokenKey] = useState("");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [gasLevel, setGasLevel] = useState<GasLevel>("HIGH");
  const [prepared, setPrepared] = useState<PreparedTransfer | null>(null);
  const [executionEnabled, setExecutionEnabled] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setInstruction(initialInstruction);
    if (initialInstruction) setMode("language");
  }, [initialInstruction]);
  useEffect(() => {
    void fetch("/api/wallet/overview", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load wallet.");
        setWallet(data as WalletOverview);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load wallet."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    void fetch("/api/payments/activity", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setExecutionEnabled(data.executionEnabled === true))
      .catch(() => setExecutionEnabled(false));
  }, []);

  const selectedBalance = useMemo(() => wallet?.balances.find((balance) => `${balance.binanceChainId}:${balance.address}` === tokenKey), [tokenKey, wallet]);

  async function prepare() {
    setSubmitting(true); setError(""); setPrepared(null);
    try {
      const body = mode === "language"
        ? { instruction, gasLevel }
        : { amount, recipient, gasLevel, tokenAddress: selectedBalance?.address, binanceChainId: selectedBalance?.binanceChainId };
      const response = await fetch("/api/payments/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to prepare transfer.");
      setPrepared(data as PreparedTransfer);
    } catch (prepareError) {
      setError(prepareError instanceof Error ? prepareError.message : "Unable to prepare transfer.");
    } finally { setSubmitting(false); }
  }

  async function approve() {
    if (!prepared) return;
    setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/payments/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: prepared.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to approve transfer.");
      setPrepared(data as PreparedTransfer);
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Unable to approve transfer.");
    } finally { setSubmitting(false); }
  }

  async function execute() {
    if (!prepared) return;
    setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/payments/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: prepared.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to execute transfer.");
      setPrepared(data as PreparedTransfer);
    } catch (executeError) { setError(executeError instanceof Error ? executeError.message : "Unable to execute transfer."); }
    finally { setSubmitting(false); }
  }

  async function copyRecipient() {
    if (!prepared) return;
    await navigator.clipboard.writeText(prepared.recipient);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  if (loading) return <div className="workflow-message">Loading connected wallet…</div>;
  if (!wallet || wallet.status !== "CONNECTED") return <div className="notice"><span>i</span><div><strong>Connect Agentic Wallet first</strong><p>Payment preparation requires current wallet chains and balances.</p></div></div>;

  return <div className="payment-workflow">
    <div className="workflow-tabs"><button className={mode === "language" ? "active" : ""} onClick={() => setMode("language")}>Natural language</button><button className={mode === "form" ? "active" : ""} onClick={() => setMode("form")}>Payment form</button></div>
    {mode === "language" ? <label className="field full"><span>Payment instruction</span><textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Send 5 USDT to 0x… on BNB Smart Chain" /></label> : <div className="payment-fields"><label className="field full"><span>Asset and network</span><select value={tokenKey} onChange={(event) => setTokenKey(event.target.value)}><option value="">Select a wallet balance</option>{wallet.balances.map((balance) => { const chain = wallet.chains.find((item) => item.binanceChainId === balance.binanceChainId); return <option key={`${balance.binanceChainId}:${balance.address}`} value={`${balance.binanceChainId}:${balance.address}`}>{balance.symbol} · {chain?.simpleName ?? balance.binanceChainId} · available {balance.balance}</option>; })}</select></label><label className="field"><span>Amount</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="5" /></label><label className="field"><span>Gas priority</span><select value={gasLevel} onChange={(event) => setGasLevel(event.target.value as GasLevel)}><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select><small className="field-help">LOW costs less but may be slower. MEDIUM is recommended. BSC token transfers require BNB for gas.</small></label><label className="field full"><span>Recipient from Binance address book</span><input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" /></label></div>}
    {wallet.balances.length === 0 && <div className="notice"><span>i</span><div><strong>No spendable balances returned</strong><p>Fund the Agentic Wallet before a transfer can be prepared. AgentPay will not invent token data.</p></div></div>}
    {error && <div className="workflow-error">{error}</div>}
    <button className="primary-button workflow-submit" disabled={submitting || wallet.balances.length === 0} onClick={() => void prepare()}>{submitting ? "Checking…" : "Prepare transfer"} <span>→</span></button>
    {prepared && <div className="review-card"><div className="review-heading"><div><span>Payment intent</span><h2>{prepared.status === "approved" ? "Approved for execution" : prepared.status === "submitted" ? "Submitted — awaiting confirmation" : "Review before approval"}</h2></div><span className={`review-status ${prepared.status}`}>{prepared.status.replace("-", " ")}</span></div><dl><div><dt>Amount</dt><dd>{prepared.amount} {prepared.asset}</dd></div><div><dt>Network</dt><dd>{prepared.chainName}</dd></div><div><dt>Recipient</dt><dd className="review-address"><span>{prepared.recipient}</span><button type="button" onClick={() => void copyRecipient()}>{copied ? "Copied" : "Copy"}</button></dd></div><div><dt>Token contract</dt><dd className="review-address"><span>{prepared.tokenAddress}</span></dd></div><div><dt>Gas priority</dt><dd>{prepared.gasLevel}</dd></div><div><dt>Available</dt><dd>{prepared.availableBalance} {prepared.asset}</dd></div>{prepared.txHash && <div><dt>Transaction</dt><dd className="review-address"><span>{prepared.txHash}</span></dd></div>}</dl><ul>{prepared.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>{prepared.status === "awaiting-approval" ? <button className="primary-button" disabled={submitting} onClick={() => void approve()}>Approve this exact intent</button> : prepared.status === "approved" && executionEnabled ? <button className="primary-button" disabled={submitting} onClick={() => void execute()}>{submitting ? "Submitting…" : "Send approved transfer"}</button> : prepared.status === "approved" ? <div className="approved-note">✓ Approval persisted. Wallet execution remains disabled until you explicitly ask to enable real sends.</div> : <div className="approved-note">Transaction broadcast recorded. Check Activity for confirmation before treating it as complete.</div>}</div>}
  </div>;
}
