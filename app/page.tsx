"use client";

import { useCallback, useEffect, useState } from "react";
import type { PaymentRail } from "@/lib/domain";
import type { WalletConnectionStatus, WalletOverview, WalletSignIn } from "@/lib/wallet-types";
import { PaymentWorkflow } from "@/app/components/payment-workflow";
import { ActivityWorkflow } from "@/app/components/activity-workflow";
import { BinancePayWorkflow } from "@/app/components/binance-pay-workflow";
import { X402Workflow } from "@/app/components/x402-workflow";

type View = "chat" | "wallet" | "pay" | "binance-pay" | "x402" | "activity" | "rules" | "settings";

const navItems: Array<{ id: View; label: string; icon: string }> = [
  { id: "chat", label: "Chat", icon: "✦" },
  { id: "wallet", label: "Agentic Wallet", icon: "◈" },
  { id: "pay", label: "Pay", icon: "↗" },
  { id: "binance-pay", label: "Binance Pay", icon: "▦" },
  { id: "x402", label: "x402", icon: "402" },
  { id: "activity", label: "Activity", icon: "◷" },
  { id: "rules", label: "Rules", icon: "⌘" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

const railLabels: Record<PaymentRail, string> = {
  "agentic-wallet": "Agentic Wallet",
  "binance-pay": "Binance Pay",
  x402: "x402 service",
  "onchain-pay": "Onchain Pay",
};

export default function Home() {
  const [view, setView] = useState<View>("chat");
  const [walletStatus, setWalletStatus] = useState<WalletConnectionStatus>("UNCONNECTED");
  const [paymentInstruction, setPaymentInstruction] = useState("");

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src="/brand/agentpay-mark.png" alt="" aria-hidden="true" />
          <div>
            <strong>AgentPay</strong>
            <span>Payment OS</span>
          </div>
        </div>

        <div className="connection-pill">
          <span className={`status-dot ${walletStatus === "CONNECTED" ? "active-dot" : "muted"}`} />
          <span>{walletStatus === "CONNECTED" ? "Wallet connected" : walletStatus === "CREATING" ? "Wallet initializing" : "Wallet not connected"}</span>
        </div>

        <nav className="nav-list" aria-label="Main navigation">
          <span className="nav-label">WORKSPACE</span>
          {navItems.map((item) => (
            <button
              className={`nav-item ${view === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => setView(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {item.id === "activity" && <span className="nav-count">0</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="security-note">
            <span>▣</span>
            <div>
              <strong>Approval-first</strong>
              <small>Every payment is reviewable</small>
            </div>
          </div>
          <span className="version">Local development · v0.1</span>
        </div>
      </aside>

      <section className="content-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>AgentPay</span><b>/</b><strong>{navItems.find((item) => item.id === view)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <span className="environment"><span className="status-dot muted" /> Local</span>
            <button className="avatar" aria-label="Account">M</button>
          </div>
        </header>

        <div className="page-content">
          {view === "chat" && <ChatView onNavigate={setView} onPaymentInstruction={setPaymentInstruction} />}
          {view === "wallet" && <WalletView onStatusChange={setWalletStatus} />}
          {view === "pay" && <PayView initialInstruction={paymentInstruction} />}
          {view === "binance-pay" && <BinancePayView />}
          {view === "x402" && <X402View />}
          {view === "activity" && <ActivityView />}
          {view === "rules" && <RulesView />}
          {view === "settings" && <SettingsView />}
        </div>
      </section>
    </main>
  );
}

function ChatView({ onNavigate, onPaymentInstruction }: { onNavigate: (view: View) => void; onPaymentInstruction: (instruction: string) => void }) {
  const [message, setMessage] = useState("");

  function submitPaymentInstruction() {
    if (!message.trim()) return;
    onPaymentInstruction(message.trim());
    onNavigate("pay");
  }

  return (
    <div className="chat-page">
      <div className="eyebrow"><span className="spark">✦</span> AgentPay assistant</div>
      <h1>What would you like<br /><em>to pay for?</em></h1>
      <p className="lead">Describe a payment goal. AgentPay will identify the right rail, check your rules, and ask for approval before any funds move.</p>

      <div className="chat-card">
        <div className="chat-header"><span className="status-dot active-dot" /> Ready for an instruction</div>
        <div className="suggestion-row">
          <button onClick={() => onNavigate("pay")}>Pay a QR or link <span>↗</span></button>
          <button onClick={() => onNavigate("wallet")}>View wallet <span>◈</span></button>
          <button onClick={() => onNavigate("rules")}>Set a payment rule <span>⌘</span></button>
        </div>
        <div className="composer">
          <textarea className="composer-input" value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submitPaymentInstruction(); } }} placeholder="e.g. Send 5 USDT to 0x… on BNB Smart Chain" aria-label="Payment instruction" />
          <button className="send-button" aria-label="Prepare payment" onClick={submitPaymentInstruction}>↑</button>
        </div>
        <div className="composer-hint"><span>↗</span> Attach QR or payment link <span className="hint-right">No payment will happen without your approval</span></div>
      </div>

      <div className="rail-grid">
        <RailCard rail="agentic-wallet" title="Wallet transfers" description="Send supported assets to approved destinations." />
        <RailCard rail="binance-pay" title="Binance Pay" description="Pay a supported QR code or payment link." />
        <RailCard rail="x402" title="Agent services" description="Pay an HTTP 402 service and receive its result." />
      </div>
    </div>
  );
}

function RailCard({ rail, title, description }: { rail: PaymentRail; title: string; description: string }) {
  return <div className="rail-card"><div className="rail-card-top"><span className="rail-symbol">{rail === "x402" ? "402" : rail === "binance-pay" ? "QR" : "W"}</span><span className="rail-available">Not connected</span></div><strong>{title}</strong><p>{description}</p><span className="rail-name">{railLabels[rail]} <span>→</span></span></div>;
}

function WalletView({ onStatusChange }: { onStatusChange: (status: WalletConnectionStatus) => void }) {
  const [overview, setOverview] = useState<WalletOverview | null>(null);
  const [signIn, setSignIn] = useState<WalletSignIn | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/wallet/overview", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load Agentic Wallet.");
      setOverview(data as WalletOverview);
      onStatusChange((data as WalletOverview).status);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Agentic Wallet.");
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  async function startConnection() {
    setConnecting(true);
    setError("");
    try {
      const response = await fetch("/api/wallet/connect", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to start wallet sign-in.");
      if (data.status === "ALREADY_CONNECTED") return void loadOverview();
      setSignIn(data as WalletSignIn);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Unable to start wallet sign-in.");
    } finally {
      setConnecting(false);
    }
  }

  async function verifyConnection() {
    if (!signIn?.qrCodeId) return;
    setConnecting(true);
    setError("");
    try {
      const response = await fetch("/api/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrCodeId: signIn.qrCodeId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Wallet verification failed.");
      setSignIn(null);
      await loadOverview();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Wallet verification failed.");
    } finally {
      setConnecting(false);
    }
  }

  return <PageFrame eyebrow="Agentic Wallet" title="Your wallet, under your control" description="Live balances, addresses, chains, and transaction history from Binance Agentic Wallet.">
    {loading && <WalletMessage icon="◌" title="Loading wallet" text="Checking the local Agentic Wallet connection…" />}
    {!loading && error && <WalletMessage icon="!" title="Wallet unavailable" text={error} action={<button className="secondary-button" onClick={() => void loadOverview()}>Retry</button>} />}
    {!loading && !error && overview?.status === "CREATING" && <WalletMessage icon="◌" title="Wallet is being created" text="Binance is still preparing the Agentic Wallet. Retry shortly." action={<button className="secondary-button" onClick={() => void loadOverview()}>Check again</button>} />}
    {!loading && !error && overview?.status === "UNCONNECTED" && !signIn && <WalletMessage icon="◈" title="Connect your Agentic Wallet" text="Sign in through Binance Wallet to load real wallet data. Credentials and signing material stay in the server-side wallet session." action={<button className="primary-button" disabled={connecting} onClick={() => void startConnection()}>{connecting ? "Starting…" : "Connect wallet"} <span>→</span></button>} />}
    {!loading && !error && signIn && <div className="wallet-connect-card"><div className="empty-icon">◈</div><h2>Confirm in Binance Wallet</h2><p>Open the official Binance sign-in page, verify that this pairing code matches, then approve it in the Binance Wallet app.</p><div className="pairing-code" aria-label="Pairing code">{signIn.pairingCode}</div><div className="wallet-actions">{signIn.urlForWeb && <a className="primary-button link-button" href={signIn.urlForWeb} target="_blank" rel="noreferrer">Open Binance sign-in ↗</a>}<button className="secondary-button" disabled={connecting} onClick={() => void verifyConnection()}>{connecting ? "Waiting for confirmation…" : "I approved it"}</button></div></div>}
    {!loading && !error && overview?.status === "CONNECTED" && <ConnectedWallet overview={overview} onRefresh={loadOverview} />}
  </PageFrame>;
}

function WalletMessage({ icon, title, text, action }: { icon: string; title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty-state large"><div className="empty-icon">{icon}</div><h2>{title}</h2><p>{text}</p>{action}</div>;
}

function ConnectedWallet({ overview, onRefresh }: { overview: WalletOverview; onRefresh: () => Promise<void> }) {
  const totalValue = overview.balances.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  return <div className="wallet-dashboard">
    <div className="wallet-summary"><div><span className="metric-label">Portfolio value</span><strong>${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><small>Only balances worth at least $0.01 are returned by the wallet CLI.</small></div><button className="secondary-button" onClick={() => void onRefresh()}>Refresh</button></div>
    <section className="wallet-section"><div className="section-heading"><h2>Balances</h2><span>{overview.balances.length} assets</span></div>{overview.balances.length ? <div className="data-list">{overview.balances.map((balance) => <div className="data-row" key={`${balance.binanceChainId}:${balance.address}`}><div><strong>{balance.symbol}</strong><small>Chain {balance.binanceChainId} · {balance.address}</small></div><div className="amount"><strong>{balance.balance}</strong><small>${Number(balance.value || 0).toFixed(2)}</small></div></div>)}</div> : <p className="inline-empty">No balances above the wallet’s $0.01 display threshold.</p>}</section>
    <section className="wallet-section"><div className="section-heading"><h2>Addresses</h2><span>{overview.addresses.length} networks</span></div><div className="data-list">{overview.addresses.map((address) => <div className="data-row" key={address.binanceChainId}><div><strong>{address.chainName}</strong><small className="mono-value">{address.address}</small></div><span className="chain-badge">{address.binanceChainId}</span></div>)}</div></section>
    <section className="wallet-section"><div className="section-heading"><h2>Recent transactions</h2><span>Last {overview.transactions.length}</span></div>{overview.transactions.length ? <div className="data-list">{overview.transactions.map((transaction) => <div className="data-row" key={transaction.txHash}><div><strong>{transaction.txType || "Transaction"}</strong><small className="mono-value">{transaction.txHash}</small></div><div className="amount"><strong className={`tx-status ${transaction.status}`}>{transaction.status}</strong><small>{transaction.txTime}</small></div></div>)}</div> : <p className="inline-empty">No recent transactions returned.</p>}</section>
  </div>;
}

function PayView({ initialInstruction }: { initialInstruction: string }) {
  return <PageFrame eyebrow="Payment workspace" title="Prepare a payment" description="AgentPay validates the wallet, asset, network, balance, and destination before asking for approval."><PaymentWorkflow initialInstruction={initialInstruction} /><div className="pay-options secondary-options"><PayOption icon="▦" title="Binance Pay QR" text="Available in the Binance Pay tab" /><PayOption icon="402" title="x402 service" text="Coming in Phase 4" /></div></PageFrame>;
}

function BinancePayView() {
  return <PageFrame eyebrow="Binance Pay" title="Pay a QR code or payment link" description="Inspect a supported Binance C2C link or PIX QR, review the payee and amount, then explicitly confirm through Binance Pay."><BinancePayWorkflow /></PageFrame>;
}

function X402View() {
  return <PageFrame eyebrow="x402" title="Purchase an HTTP resource" description="Inspect a trusted service’s HTTP 402 requirement, choose a signable Agentic Wallet option, approve it, and return the purchased response."><X402Workflow /></PageFrame>;
}

function PayOption({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <button className="pay-option"><span className="pay-option-icon">{icon}</span><span><strong>{title}</strong><small>{text}</small></span><span className="arrow">→</span></button>;
}

function ActivityView() {
  return <PageFrame eyebrow="Activity" title="Payment history" description="Prepared intents, approvals, broadcasts, confirmations, and failures are persisted here."><ActivityWorkflow /></PageFrame>;
}

function RulesView() {
  return <PageFrame eyebrow="Rules & security" title="Decide what AgentPay can do" description="Policies are checked before a payment is prepared. Provider and wallet safety requirements still apply."><div className="rule-list"><RuleRow title="Require approval for every payment" description="Recommended for the first setup" enabled /><RuleRow title="Per-payment spending limit" description="Not configured" /><RuleRow title="Daily spending limit" description="Not configured" /><RuleRow title="Trusted destinations and services" description="No allowlist configured" /></div></PageFrame>;
}

function RuleRow({ title, description, enabled = false }: { title: string; description: string; enabled?: boolean }) {
  return <div className="rule-row"><div><strong>{title}</strong><span>{description}</span></div><span className={`toggle ${enabled ? "on" : ""}`}><span /></span></div>;
}

function SettingsView() {
  return <PageFrame eyebrow="Settings" title="Connections & diagnostics" description="Connect capabilities here. Secrets belong in the server-side environment, never in the browser."><div className="connection-list"><ConnectionRow title="Agentic Wallet" detail="Balances, transfers, and x402 signing" /><ConnectionRow title="Binance Pay" detail="QR and payment-link execution" /><ConnectionRow title="Onchain Pay" detail="Optional partner API integration" /></div></PageFrame>;
}

function ConnectionRow({ title, detail }: { title: string; detail: string }) {
  return <div className="connection-row"><div className="connection-logo">{title === "Agentic Wallet" ? "W" : title === "Binance Pay" ? "B" : "O"}</div><div className="connection-copy"><strong>{title}</strong><span>{detail}</span></div><span className="not-connected">Not connected</span><button className="secondary-button">Connect</button></div>;
}

function PageFrame({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <div className="standard-page"><div className="eyebrow"><span className="spark">✦</span> {eyebrow}</div><h1>{title}</h1><p className="lead">{description}</p>{children}</div>;
}
