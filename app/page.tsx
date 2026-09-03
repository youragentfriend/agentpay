"use client";

import { useState } from "react";
import type { PaymentRail } from "@/lib/domain";

type View = "chat" | "wallet" | "pay" | "activity" | "rules" | "settings";

const navItems: Array<{ id: View; label: string; icon: string }> = [
  { id: "chat", label: "Chat", icon: "✦" },
  { id: "wallet", label: "Agentic Wallet", icon: "◈" },
  { id: "pay", label: "Pay", icon: "↗" },
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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <strong>AgentPay</strong>
            <span>Payment OS</span>
          </div>
        </div>

        <div className="connection-pill">
          <span className="status-dot muted" />
          <span>Wallet not connected</span>
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
          {view === "chat" && <ChatView onNavigate={setView} />}
          {view === "wallet" && <WalletView onNavigate={setView} />}
          {view === "pay" && <PayView />}
          {view === "activity" && <ActivityView />}
          {view === "rules" && <RulesView />}
          {view === "settings" && <SettingsView />}
        </div>
      </section>
    </main>
  );
}

function ChatView({ onNavigate }: { onNavigate: (view: View) => void }) {
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
          <span className="composer-placeholder">e.g. Send 5 USDT to a saved destination…</span>
          <button className="send-button" aria-label="Send message">↑</button>
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

function WalletView({ onNavigate }: { onNavigate: (view: View) => void }) {
  return <PageFrame eyebrow="Agentic Wallet" title="Your wallet, under your control" description="Connect an Agentic Wallet to load live balances, addresses, history, and approval status."><div className="empty-state large"><div className="empty-icon">◈</div><h2>Connect your Agentic Wallet</h2><p>Balances and transaction history will appear here after a real wallet connection. AgentPay will never invent or estimate wallet data.</p><button className="primary-button" onClick={() => onNavigate("settings")}>Go to connections <span>→</span></button></div></PageFrame>;
}

function PayView() {
  return <PageFrame eyebrow="Payment workspace" title="Choose a payment input" description="All payment rails share one validation, approval, execution, and receipt flow."><div className="pay-options"><PayOption icon="▦" title="Scan or upload QR" text="Binance Pay, supported QR formats" /><PayOption icon="↗" title="Paste a payment link" text="Let AgentPay inspect and route it" /><PayOption icon="→" title="Send to a destination" text="Supported wallet destinations only" /><PayOption icon="402" title="Call an x402 service" text="Pay an HTTP 402 resource" /></div><div className="notice"><span>i</span><div><strong>Nothing is connected yet</strong><p>Payment execution will be enabled after the relevant Binance capability is connected and verified.</p></div></div></PageFrame>;
}

function PayOption({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <button className="pay-option"><span className="pay-option-icon">{icon}</span><span><strong>{title}</strong><small>{text}</small></span><span className="arrow">→</span></button>;
}

function ActivityView() {
  return <PageFrame eyebrow="Activity" title="Payment history" description="Every attempt, approval, and receipt will be recorded here."><div className="empty-state"><div className="empty-icon">◷</div><h2>No payment activity</h2><p>Completed and pending payment workflows will appear here. This view will use real provider status, not simulated transactions.</p></div></PageFrame>;
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
