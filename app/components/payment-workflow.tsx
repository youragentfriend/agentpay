"use client";

import { useEffect, useMemo, useState } from "react";
import type { GasLevel, PaymentApiError, PreparedTransfer } from "@/lib/payment-workflow";
import { amountValidationError, isSolanaChain, recipientValidationError } from "@/lib/payment-validation";
import type { WalletOverview } from "@/lib/wallet-types";

const AMOUNT_ERROR_CODES = new Set([
  "INVALID_AMOUNT",
  "INSUFFICIENT_BALANCE",
  "POLICY_AMOUNT_USD_REQUIRED",
  "POLICY_PER_PAYMENT_LIMIT_EXCEEDED",
  "POLICY_DAILY_LIMIT_EXCEEDED",
  "POLICY_DAILY_SPEND_UNAVAILABLE",
]);
const RECIPIENT_ERROR_CODES = new Set(["INVALID_RECIPIENT", "POLICY_DESTINATION_NOT_TRUSTED"]);

export function PaymentWorkflow() {
  const [wallet, setWallet] = useState<WalletOverview | null>(null);
  const [asset, setAsset] = useState("");
  const [networkKey, setNetworkKey] = useState("");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [gasLevel, setGasLevel] = useState<GasLevel>("MEDIUM");
  const [prepared, setPrepared] = useState<PreparedTransfer | null>(null);
  const [executionEnabled, setExecutionEnabled] = useState(false);
  const [error, setError] = useState("");
  const [amountServerError, setAmountServerError] = useState("");
  const [recipientServerError, setRecipientServerError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [amountTouched, setAmountTouched] = useState(false);
  const [recipientTouched, setRecipientTouched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const assets = useMemo(() => {
    return [...new Set(wallet?.balances.map((balance) => balance.symbol.toUpperCase()) ?? [])].sort();
  }, [wallet]);

  const networkOptions = useMemo(() => {
    if (!wallet || !asset) return [];
    const options = new Map<string, { key: string; chainId: string; label: string; balance: WalletOverview["balances"][number] }>();
    for (const balance of wallet.balances) {
      if (balance.symbol.toUpperCase() !== asset) continue;
      const chain = wallet.chains.find((item) => item.binanceChainId === balance.binanceChainId);
      const key = `${balance.binanceChainId}:${balance.address}`;
      if (!options.has(balance.binanceChainId)) {
        options.set(balance.binanceChainId, {
          key,
          chainId: balance.binanceChainId,
          label: chain?.simpleName || chain?.name || balance.binanceChainId,
          balance,
        });
      }
    }
    return [...options.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [asset, wallet]);

  const selectedOption = networkOptions.find((option) => option.key === networkKey);
  const selectedBalance = selectedOption?.balance;
  const selectedChainId = selectedOption?.chainId ?? "";
  const assetError = attempted && !asset ? "Select an asset." : "";
  const networkError = attempted && !selectedBalance ? "Select a network for this asset." : "";
  const amountError = amountServerError || ((attempted || amountTouched) ? amountValidationError(amount) : "");
  const recipientError = recipientServerError || ((attempted || recipientTouched) ? recipientValidationError(recipient, selectedChainId) : "");

  function resetPrepared() {
    setPrepared(null);
    setError("");
  }

  function handleAssetChange(value: string) {
    setAsset(value);
    setNetworkKey("");
    setRecipientServerError("");
    resetPrepared();
  }

  function handleNetworkChange(value: string) {
    setNetworkKey(value);
    setRecipientServerError("");
    resetPrepared();
  }

  async function prepare() {
    setAttempted(true);
    setAmountServerError("");
    setRecipientServerError("");
    setError("");
    const localAmountError = amountValidationError(amount);
    const localRecipientError = recipientValidationError(recipient, selectedChainId);
    if (!asset || !selectedBalance || localAmountError || localRecipientError) return;

    setSubmitting(true);
    setPrepared(null);
    try {
      const response = await fetch("/api/payments/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          recipient,
          gasLevel,
          tokenAddress: selectedBalance.address,
          binanceChainId: selectedBalance.binanceChainId,
        }),
      });
      const data = await response.json() as Partial<PreparedTransfer> & Partial<PaymentApiError>;
      if (!response.ok) {
        const message = data.error ?? "Unable to prepare transfer.";
        if (data.code && AMOUNT_ERROR_CODES.has(data.code)) setAmountServerError(message);
        else if (data.code && RECIPIENT_ERROR_CODES.has(data.code)) setRecipientServerError(message);
        else setError(message);
        return;
      }
      setPrepared(data as PreparedTransfer);
    } catch (prepareError) {
      setError(prepareError instanceof Error ? prepareError.message : "Unable to prepare transfer.");
    } finally {
      setSubmitting(false);
    }
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

  const recipientHelp = selectedChainId
    ? isSolanaChain(selectedChainId)
      ? "Solana network selected. Enter a base58 Solana address already saved in Binance Wallet."
      : "EVM network selected. Enter a 0x address already saved in Binance Wallet."
    : "Select a network first; the recipient format will be validated for that chain.";

  return <div className="payment-workflow">
    <div className="payment-fields">
      <label className="field"><span>Asset</span><select aria-invalid={Boolean(assetError)} value={asset} onChange={(event) => handleAssetChange(event.target.value)} title={assetError || "Choose an asset held in the connected wallet."}><option value="">Select asset</option>{assets.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}</select>{assetError && <small className="field-error">{assetError}</small>}</label>
      <label className="field"><span>Network</span><select aria-invalid={Boolean(networkError)} value={networkKey} disabled={!asset} onChange={(event) => handleNetworkChange(event.target.value)} title={networkError || (asset ? "Choose a network where this asset has a balance." : "Select an asset first.")}><option value="">Select network</option>{networkOptions.map((option) => <option key={option.key} value={option.key}>{option.label} · available {option.balance.balance}</option>)}</select>{networkError && <small className="field-error">{networkError}</small>}</label>
      <label className="field"><span>Amount</span><input type="number" inputMode="decimal" min="0" max={selectedBalance?.balance} step="any" aria-invalid={Boolean(amountError)} aria-describedby="wallet-amount-help" value={amount} onBlur={() => setAmountTouched(true)} onKeyDown={(event) => { if (["e", "E", "+", "-"].includes(event.key)) event.preventDefault(); }} onChange={(event) => { setAmount(event.target.value); setAmountServerError(""); resetPrepared(); }} placeholder="0.00" title={amountError || "Enter numbers only. The amount must be positive and within your balance and spending limits."}/>{amountError ? <small id="wallet-amount-help" className="field-error">{amountError}</small> : <small id="wallet-amount-help" className="field-help">{selectedBalance ? `Available: ${selectedBalance.balance} ${selectedBalance.symbol}.` : "Select an asset and network first."}</small>}</label>
      <label className="field"><span>Gas priority</span><select value={gasLevel} onChange={(event) => { setGasLevel(event.target.value as GasLevel); resetPrepared(); }}><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM (Recommended)</option><option value="HIGH">HIGH</option></select><small className="field-help">LOW may be slower. BSC token transfers require BNB for gas.</small></label>
      <label className="field full"><span>Recipient from Binance address book</span><input aria-invalid={Boolean(recipientError)} aria-describedby="wallet-recipient-help" value={recipient} onBlur={() => setRecipientTouched(true)} onChange={(event) => { setRecipient(event.target.value); setRecipientServerError(""); resetPrepared(); }} placeholder={isSolanaChain(selectedChainId) ? "Solana address" : "0x…"} title={recipientError || recipientHelp}/>{recipientError ? <small id="wallet-recipient-help" className="field-error">{recipientError}</small> : <small id="wallet-recipient-help" className="field-help">{recipientHelp}</small>}</label>
    </div>
    {wallet.balances.length === 0 && <div className="notice"><span>i</span><div><strong>No spendable balances returned</strong><p>Fund the Agentic Wallet before a transfer can be prepared. AgentPay will not invent token data.</p></div></div>}
    {error && <div className="workflow-error">{error}</div>}
    <button type="button" className="primary-button workflow-submit" disabled={submitting || wallet.balances.length === 0} onClick={() => void prepare()}>{submitting ? "Checking…" : "Prepare transfer"} <span>→</span></button>
    {prepared && <div className="review-card"><div className="review-heading"><div><span>Payment intent</span><h2>{prepared.status === "approved" ? "Approved for execution" : prepared.status === "submitted" ? "Submitted — awaiting confirmation" : "Review before approval"}</h2></div><span className={`review-status ${prepared.status}`}>{prepared.status.replace("-", " ")}</span></div><dl><div><dt>Amount</dt><dd>{prepared.amount} {prepared.asset}</dd></div><div><dt>Network</dt><dd>{prepared.chainName}</dd></div><div><dt>Recipient</dt><dd className="review-address"><span>{prepared.recipient}</span><button type="button" onClick={() => void copyRecipient()}>{copied ? "Copied" : "Copy"}</button></dd></div><div><dt>Token contract</dt><dd className="review-address"><span>{prepared.tokenAddress}</span></dd></div><div><dt>Gas priority</dt><dd>{prepared.gasLevel}</dd></div><div><dt>Available</dt><dd>{prepared.availableBalance} {prepared.asset}</dd></div>{prepared.txHash && <div><dt>Transaction</dt><dd className="review-address"><span>{prepared.txHash}</span></dd></div>}</dl><ul>{prepared.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>{prepared.status === "awaiting-approval" ? <button type="button" className="primary-button" disabled={submitting} onClick={() => void approve()}>Approve this exact intent</button> : prepared.status === "approved" && executionEnabled ? <button type="button" className="primary-button" disabled={submitting} onClick={() => void execute()}>{submitting ? "Submitting…" : "Send approved transfer"}</button> : prepared.status === "approved" ? <div className="approved-note">✓ Approval persisted. Wallet execution remains disabled until you explicitly ask to enable real sends.</div> : <div className="approved-note">Transaction broadcast recorded. Check Activity for confirmation before treating it as complete.</div>}</div>}
  </div>;
}
