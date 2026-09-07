"use client";

import { useEffect, useMemo, useState } from "react";
import type { OnchainPayCapability, OnchainPayCatalog, OnchainPayOrder } from "@/lib/onchain-pay-types";

function short(value: string) { return value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value; }
function statusLabel(value: string) { return value.replaceAll("-", " ").replace(/\b\w/g, letter => letter.toUpperCase()); }

export function OnchainPayWorkflow() {
  const [capability, setCapability] = useState<OnchainPayCapability | null>(null);
  const [catalog, setCatalog] = useState<OnchainPayCatalog | null>(null);
  const [asset, setAsset] = useState(""); const [network, setNetwork] = useState("");
  const [address, setAddress] = useState(""); const [memo, setMemo] = useState(""); const [amount, setAmount] = useState("");
  const [netReceive, setNetReceive] = useState(false); const [order, setOrder] = useState<OnchainPayOrder | null>(null);
  const [loading, setLoading] = useState(true); const [working, setWorking] = useState(false); const [error, setError] = useState("");

  useEffect(() => { void Promise.all([fetch("/api/onchain-pay/status", { cache: "no-store" }), fetch("/api/onchain-pay/catalog", { cache: "no-store" })]).then(async ([status, options]) => {
    const nextCapability = await status.json() as OnchainPayCapability; const nextCatalog = await options.json() as OnchainPayCatalog;
    setCapability(nextCapability); setCatalog(nextCatalog); const first = nextCatalog.assets[0]; setAsset(first?.asset || ""); setNetwork(first?.networks.find(item => item.withdrawEnabled)?.network || first?.networks[0]?.network || "");
  }).catch(cause => setError(cause instanceof Error ? cause.message : "Unable to load Onchain Pay.")).finally(() => setLoading(false)); }, []);

  const assetOptions = catalog?.assets || [];
  const networks = useMemo(() => assetOptions.find(item => item.asset === asset)?.networks.filter(item => item.withdrawEnabled) || [], [asset, assetOptions]);
  const selectedNetwork = networks.find(item => item.network === network);
  useEffect(() => { if (!networks.some(item => item.network === network)) setNetwork(networks[0]?.network || ""); }, [network, networks]);

  async function call(url: string, body: Record<string, unknown>): Promise<OnchainPayOrder> {
    setWorking(true); setError("");
    try { const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json() as Record<string, unknown>; if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Onchain Pay operation failed."); return data as unknown as OnchainPayOrder; }
    finally { setWorking(false); }
  }
  async function prepare() { try { setOrder(await call("/api/onchain-pay/prepare", { asset, network, address, memo: memo || undefined, amount, netReceive })); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to prepare Onchain Pay order."); } }
  async function approve() { if (!order) return; try { setOrder(await call("/api/onchain-pay/approve", { id: order.id })); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to approve Onchain Pay order."); } }
  async function createLink() { if (!order) return; try { const next = await call("/api/onchain-pay/launch", { id: order.id }); setOrder(next); if (next.orderLink) window.open(next.orderLink, "_blank", "noopener,noreferrer"); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create Binance order link."); } }
  async function refresh() { if (!order) return; try { setOrder(await call("/api/onchain-pay/refresh", { id: order.id })); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to refresh Onchain Pay status."); } }

  if (loading) return <div className="workflow-message">Loading Binance Onchain Pay…</div>;
  return <div className="onchain-pay-workflow">
    <section className="onchain-pay-status-card">
      <div><span className="eyebrow">BINANCE PARTNER CONNECTION</span><h2>{capability?.configured ? "Onchain Pay connected" : "Preview mode"}</h2><p>{capability?.message}</p></div>
      <div className="onchain-capability-grid"><span><small>Partner access</small><strong>{capability?.configured ? "Configured" : "Required"}</strong></span><span><small>Live discovery</small><strong>{capability?.liveDiscoveryEnabled ? "Live" : "Preview"}</strong></span><span><small>Webhook</small><strong>{capability?.webhookReady ? "Ready" : "Not configured"}</strong></span><span><small>Execution</small><strong>{capability?.executionEnabled ? "Enabled" : "Disabled"}</strong></span></div>
    </section>
    {catalog?.warning && <div className="notice"><span>i</span><div><strong>Documented preview catalog</strong><p>{catalog.warning}</p></div></div>}
    {!order || order.status === "failed" || order.status === "expired" ? <section className="onchain-pay-composer">
      <div className="option-heading"><span className="eyebrow">SEND FROM BINANCE</span><h2>Pay an external blockchain address</h2><p>Choose any asset and network currently supported by Binance Onchain Pay. Fixed means the quantity is locked—not that the asset must be a stablecoin.</p></div>
      <div className="onchain-source-destination"><div><small>Funds source</small><strong>Binance balance</strong></div><span>→</span><div><small>Destination</small><strong>External blockchain address</strong></div></div>
      <div className="payment-fields onchain-pay-fields">
        <label className="field"><span>Asset</span><select value={asset} onChange={event => { setAsset(event.target.value); setOrder(null); }}>{assetOptions.map(item => <option key={item.asset} value={item.asset}>{item.asset}</option>)}</select></label>
        <label className="field"><span>Network</span><select value={network} onChange={event => setNetwork(event.target.value)}>{networks.map(item => <option key={item.network} value={item.network}>{item.network}</option>)}</select></label>
        <label className="field"><span>Amount in {asset || "asset"}</span><input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" placeholder={asset === "BNB" ? "0.25" : "25"}/>{selectedNetwork && <small className="field-help">Min {selectedNetwork.withdrawMinAmount} · Max {selectedNetwork.withdrawMaxAmount}</small>}</label>
        <label className="field"><span>Estimated network fee</span><input value={selectedNetwork ? `${selectedNetwork.withdrawFee} ${asset}` : ""} readOnly /></label>
        <label className="field full"><span>Recipient address</span><input value={address} onChange={event => setAddress(event.target.value)} autoComplete="off" spellCheck={false} placeholder={`External ${network || "network"} address`}/></label>
        {selectedNetwork?.memoRegex && <label className="field full"><span>Memo or destination tag</span><input value={memo} onChange={event => setMemo(event.target.value)} autoComplete="off" /></label>}
      </div>
      <label className="onchain-net-receive"><input type="checkbox" checked={netReceive} onChange={event => setNetReceive(event.target.checked)}/><span><strong>Recipient receives the exact amount</strong><small>Where enabled by Binance, additional funds cover the network fee instead of deducting it from the requested amount.</small></span></label>
      <div className="pay-warning">The asset is not limited to stablecoins. BNB, BTC, ETH, SOL, stablecoins, and other tokens appear whenever Binance reports a currently enabled withdrawal network.</div>
      <button className="primary-button workflow-submit" disabled={working || !asset || !network || !address.trim() || !amount.trim()} onClick={() => void prepare()}>{working ? "Validating…" : "Review Onchain Pay order"}</button>
    </section> : <section className="binance-pay-review onchain-pay-review">
      <div className="review-heading"><div><span>External blockchain payment</span><h2>Review Binance Onchain Pay</h2></div><span className={`review-status ${order.status === "completed" ? "green" : "awaiting-approval"}`}>{statusLabel(order.status)}</span></div>
      <dl><div><dt>Funds source</dt><dd>Binance balance</dd></div><div><dt>Amount</dt><dd>{order.amount} {order.asset}</dd></div><div><dt>Network</dt><dd>{order.network}</dd></div><div><dt>Recipient</dt><dd title={order.address}>{short(order.address)}</dd></div>{order.memo && <div><dt>Memo</dt><dd>{order.memo}</dd></div>}<div><dt>Estimated fee</dt><dd>{order.withdrawFee} {order.asset}</dd></div><div><dt>Expected recipient amount</dt><dd>{order.expectedReceive} {order.asset}</dd></div><div><dt>Amount mode</dt><dd>Fixed crypto quantity</dd></div><div><dt>Order ID</dt><dd>{short(order.externalOrderId)}</dd></div>{order.txHash && <div><dt>Transaction hash</dt><dd>{short(order.txHash)}</dd></div>}</dl>
      <div className="pay-warning">Verify the asset, network, and complete destination address. Blockchain transfers cannot be reversed after Binance completes the withdrawal.</div>
      {order.status === "prepared" && <button className="primary-button" disabled={working} onClick={() => void approve()}>{working ? "Approving…" : "Approve this order"}</button>}
      {order.status === "approved" && (capability?.executionEnabled ? <button className="primary-button" disabled={working} onClick={() => void createLink()}>{working ? "Creating link…" : "Continue securely in Binance"}</button> : <div className="approved-note">Order approved for demonstration. Live Binance order creation remains disabled until partner access and controlled execution testing are complete.</div>)}
      {order.orderLink && <div className="onchain-order-actions"><a className="primary-button" href={order.orderLink} target="_blank" rel="noreferrer">Open Binance confirmation</a><button className="secondary-button" disabled={working} onClick={() => void refresh()}>Refresh status</button></div>}
      {order.txHash && <code className="onchain-tx-hash">{order.txHash}</code>}
      <button className="secondary-button" disabled={working} onClick={() => { setOrder(null); setError(""); }}>Start another payment</button>
    </section>}
    {error && <div className="workflow-error">{error}</div>}
  </div>;
}
