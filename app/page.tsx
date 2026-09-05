"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WalletConnectionStatus, WalletOverview, WalletSignIn } from "@/lib/wallet-types";
import { isSolanaChain } from "@/lib/payment-validation";
import { PaymentWorkflow } from "@/app/components/payment-workflow";
import { ActivityWorkflow } from "@/app/components/activity-workflow";
import { BinancePayWorkflow } from "@/app/components/binance-pay-workflow";
import { BinancePortfolioView } from "@/app/components/binance-portfolio";
import { DiagnosticsSettings } from "@/app/components/diagnostics-settings";
import { ProfileSettings } from "@/app/components/profile-settings";
import { RulesSettings } from "@/app/components/rules-settings";
import { X402Workflow } from "@/app/components/x402-workflow";
import type { AgentPaySettings } from "@/lib/settings-types";
import { DEFAULT_AGENTPAY_SETTINGS } from "@/lib/settings-types";
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "development";

type View = "overview" | "binance" | "binance-pay" | "wallet" | "x402" | "activity" | "settings";
type SettingsTab = "Rules & approvals" | "Connections" | "Diagnostics" | "General";
const labels: Record<View,string>={overview:"Overview",binance:"Binance", "binance-pay":"Binance Pay",wallet:"Agentic Wallet",x402:"x402",activity:"Activity",settings:"Settings"};

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [walletStatus, setWalletStatus] = useState<WalletConnectionStatus>("UNCONNECTED");
  const [binanceOpen, setBinanceOpen] = useState(true);
  const [walletOpen, setWalletOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("Rules & approvals");
  const [settings, setSettings] = useState<AgentPaySettings>({ ...DEFAULT_AGENTPAY_SETTINGS, requireApproval: true, updatedAt: new Date(0).toISOString() });

  useEffect(() => {
    void fetch("/api/settings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        setSettings(await response.json() as AgentPaySettings);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void fetch("/api/wallet/overview", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as WalletOverview;
        setWalletStatus(data.status);
      })
      .catch(() => undefined);
  }, []);

  const navigate = (nextView: View) => {
    setView(nextView);
    setMenuOpen(false);
  };
  const avatarInitials = settings.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "A";

  return <main className="app-shell">
    <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
      <div className="brand-row">
        <div className="brand"><img className="brand-symbol" src="/brand/agentpay-logo.png" alt="AgentPay"/><div><strong>AgentPay</strong></div></div>
        <button className="mobile-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}>×</button>
      </div>
      <div className="safe-state"><span className={`status-dot ${walletStatus === "CONNECTED" ? "active-dot" : ""}`}/><div><strong>{walletStatus === "CONNECTED" ? "Wallet connected" : "Approval mode"}</strong><small>Funds move only after review</small></div></div>
      <nav className="nav-list" aria-label="Main navigation">
        <span className="nav-label">Workspace</span>
        <NavButton active={view === "overview"} icon="⌂" label="Overview" onClick={() => navigate("overview")}/>
        <NavParent label="Binance" icon="B" active={view === "binance" || view === "binance-pay"} open={binanceOpen} onNavigate={() => navigate("binance")} onToggle={() => setBinanceOpen((value) => !value)}/>
        {binanceOpen && <div className="nav-submenu"><NavButton active={view === "binance-pay"} icon="" label="Binance Pay" onClick={() => navigate("binance-pay")}/></div>}
        <NavParent label="Agentic Wallet" icon="◇" active={view === "wallet" || view === "x402"} open={walletOpen} onNavigate={() => navigate("wallet")} onToggle={() => setWalletOpen((value) => !value)}/>
        {walletOpen && <div className="nav-submenu"><NavButton active={view === "x402"} icon="" label="x402 services" onClick={() => navigate("x402")}/></div>}
        <NavButton active={view === "activity"} icon="◷" label="Activity" onClick={() => navigate("activity")}/>
        <span className="nav-label manage-label">Manage</span>
        <NavButton active={view === "settings"} icon="⚙" label="Settings" onClick={() => { setSettingsTab("Rules & approvals"); navigate("settings"); }}/>
      </nav>
      <div className="sidebar-footer">
        <button className="profile" onClick={() => { setSettingsTab("General"); navigate("settings"); }}><span className="profile-avatar">{avatarInitials}</span><span><strong>{settings.displayName}</strong><small>Approval-first account</small></span></button>
        <span className="version">AgentPay · v{appVersion}</span>
      </div>
    </aside>
    <section className="content-area">
      <header className="topbar">
        <button className="menu-button" aria-label="Open menu" onClick={() => setMenuOpen(true)}>☰</button>
        <div className="breadcrumbs"><span>AgentPay</span><b>/</b><strong>{labels[view]}</strong></div>
        <button className="avatar" aria-label={`${settings.displayName} account settings`} onClick={() => { setSettingsTab("General"); navigate("settings"); }}>{avatarInitials}</button>
      </header>
      <div className="page-content">
        {view === "overview" && <OverviewView onNavigate={navigate} walletStatus={walletStatus} displayName={settings.displayName} timeZone={settings.timeZone}/>}
        {view === "binance" && <BinanceView/>}
        {view === "binance-pay" && <BinancePayView/>}
        {view === "wallet" && <WalletView onStatusChange={setWalletStatus}/>}
        {view === "x402" && <X402View/>}
        {view === "activity" && <ActivityView/>}
        {view === "settings" && <SettingsView tab={settingsTab} onTabChange={setSettingsTab} settings={settings} onSettingsChange={setSettings} onNavigate={navigate}/>}
      </div>
    </section>
  </main>;
}
function NavButton({active,icon,label,onClick}:{active:boolean;icon:string;label:string;onClick:()=>void}){return <button className={`nav-item ${active?"active":""}`} onClick={onClick}><span className="nav-icon">{icon}</span><span>{label}</span></button>}
function NavParent({label,icon,active,open,onNavigate,onToggle}:{label:string;icon:string;active:boolean;open:boolean;onNavigate:()=>void;onToggle:()=>void}){return <div className={`nav-parent ${active?"active":""}`}><button className="nav-parent-main" onClick={onNavigate}><span className="nav-icon">{icon}</span><span>{label}</span></button><button className="nav-chevron" aria-label={`${open?"Collapse":"Expand"} ${label}`} onClick={onToggle}>{open?"⌄":"›"}</button></div>}

type ChatTurn = { id: number; role: "user" | "assistant"; text: string; action?: "payment" | "binance-pay" | "payment-link" | "binance-balance" | "qr" | "activity" | "balance" | "x402"; file?: File };
type StoredConversation = { id: string; title: string; savedAt: string; turns: Array<Omit<ChatTurn, "file">> };

function OverviewView({ onNavigate, walletStatus, displayName, timeZone }: { onNavigate: (view: View) => void; walletStatus: WalletConnectionStatus; displayName: string; timeZone: string }) {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [nextId, setNextId] = useState(1);
  const [recentConversations, setRecentConversations] = useState<StoredConversation[]>([]);
  const [welcome, setWelcome] = useState({ greeting: `Welcome back, ${displayName}.` });
  const conversationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const now = new Date();
    let hour = now.getHours();
    try { hour = Number(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", timeZone }).format(now)); } catch { /* use browser-local hour */ }
    setWelcome({
      greeting: `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ${displayName}.`,
    });
  }, [displayName, timeZone]);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [turns]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("agentpay-conversations") || "[]") as StoredConversation[];
      if (Array.isArray(saved)) setRecentConversations(saved);
    } catch { setRecentConversations([]); }
  }, []);

  function addTurn(text: string, action?: ChatTurn["action"], file?: File) {
    const id = nextId;
    setNextId((value) => value + 1);
    const responses: Partial<Record<NonNullable<ChatTurn["action"]>, string>> = {
      payment: "I’ll prepare an approval-first Agentic Wallet transfer. Review the exact intent before approving.",
      "binance-pay": "I’ll open the Binance Pay inspector here so you can paste a link or attach a QR without leaving this conversation.",
      "payment-link": "I’ll open the live Binance Pay receive-link workflow here. You choose the amount and review the link before sharing it.",
      "binance-balance": "A separate read-only Binance account connection is required before I can show Spot, Funding, Futures, Earn, or Margin balances.",
      qr: "I’ll inspect this QR through the shared Binance Pay validation pipeline.",
      activity: "Here’s the latest activity, normalized across every payment rail.",
      balance: "Here’s the current Agentic Wallet overview, including balances and connection status.",
      x402: "I’ll inspect the x402 service here. If your message includes a URL, it is prefilled below.",
    };
    setTurns((value) => [...value, { id, role: "user", text, action, file }, { id: id + 0.5, role: "assistant", text: action ? responses[action] ?? "Tell me what you’d like to do." : "Tell me what you’d like to do." }]);
  }

  function submit() {
    const value = message.trim();
    if (!value) return;
    const lower = value.toLowerCase();
    const action: ChatTurn["action"] = lower.includes("activity") || lower.includes("history") ? "activity" : lower.includes("x402") || lower.includes("service") ? "x402" : lower.includes("binance") && ["balance", "portfolio", "funding", "spot", "futures"].some((term) => lower.includes(term)) ? "binance-balance" : (lower.includes("create") || lower.includes("generate")) && lower.includes("payment link") ? "payment-link" : lower.includes("binance pay") || lower.includes("payment link") ? "binance-pay" : lower.includes("balance") || lower.includes("wallet") || lower.includes("holdings") ? "balance" : "payment";
    addTurn(value, action);
    setMessage("");
  }

  function attach(file: File | undefined) {
    if (file) addTurn(`Attached QR: ${file.name}`, "qr", file);
  }

  function newConversation() {
    if (!turns.length) return;
    const firstRequest = turns.find((turn) => turn.role === "user");
    if (!firstRequest) return;
    const saved: StoredConversation = { id: String(Date.now()), title: firstRequest.text, savedAt: new Date().toISOString(), turns: turns.map(({ file: _file, ...turn }) => turn) };
    const next = [saved, ...recentConversations].slice(0, 10);
    setRecentConversations(next);
    localStorage.setItem("agentpay-conversations", JSON.stringify(next));
    setTurns([]);
    setNextId(1);
    setMessage("");
  }

  function openConversation(conversation: StoredConversation) {
    setTurns(conversation.turns);
    setNextId(Math.max(...conversation.turns.map((turn) => turn.id), 0) + 1);
  }

  const actions: Array<{ label: string; description: string; icon: string; action: ChatTurn["action"] }> = [
    { label: "Prepare a transfer", description: "Send USDT with approval", icon: "↗", action: "payment" },
    { label: "Explore an x402 service", description: "Review a service before purchase", icon: "↗", action: "x402" },
    { label: "Check wallet", description: "Balances and connection status", icon: "◇", action: "balance" },
    { label: "Create a payment link", description: "Request money with a shareable link", icon: "↗", action: "payment-link" },
  ];

  return <div className="overview-page">
    <section className="welcome">
      <h1>{welcome.greeting}</h1>
      <p className="lead">What would you like AgentPay to take care of?</p>
    </section>
    <section className="overview-primary-grid">
      <section className="assistant-workspace">
      <section className={`assistant-panel${turns.length ? " has-messages" : " empty"}`}>
        <div className="assistant-status"><div className="assistant-identity"><img className="assistant-badge" src="/brand/assistant-badge.svg" alt=""/><div><strong>AgentPay Assistant</strong><small><span className="status-dot active-dot"/> Ready for an instruction</small></div></div></div>
        <div className="quick-actions">{actions.map((action) => <button key={action.label} onClick={() => addTurn(action.label, action.action)}><span className="quick-action-icon">{action.icon}</span><span><strong>{action.label}</strong><small>{action.description}</small></span><b>→</b></button>)}</div>
        <div className={`conversation${turns.length ? " has-messages" : " empty"}`} ref={conversationRef} aria-live="polite">{turns.length ? turns.map((turn) => turn.role === "user" ? <div className="chat-bubble user-bubble" key={turn.id}><span>You</span><p>{turn.text}</p></div> : <div className="chat-result" key={turn.id}><div className="assistant-message"><strong>AgentPay</strong><span>{turn.text}</span></div>{turn.action === "payment" && <PaymentWorkflow/>} {turn.action === "binance-pay" && <BinancePayWorkflow embedded/>}{turn.action === "payment-link" && <BinancePayWorkflow embedded initialMode="receive"/>}{turn.action === "binance-balance" && <div className="inline-state"><strong>Connect Binance portfolio</strong><span>Use the Binance page to configure a protected read-only connection. AgentPay will never request API credentials in chat.</span></div>} {turn.action === "qr" && <QrResult file={turns.find((item) => item.id === turn.id - 0.5)?.file} fileName={turns.find((item) => item.id === turn.id - 0.5)?.text.replace("Attached QR: ", "") || "attached QR"}/>} {turn.action === "activity" && <InlineActivity/>}{turn.action === "balance" && <InlineBalance/>}{turn.action === "x402" && <X402Workflow initialUrl={extractUrl(turns.find((item) => item.id === turn.id - 0.5)?.text || "")}/>}</div>) : <div className="conversation-placeholder"><strong>Conversation preview</strong><span>Your messages and AgentPay responses will appear here.</span></div>}</div>
        <div className="composer-wrap"><div className="composer"><textarea className="composer-input" rows={2} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder="Ask AgentPay to prepare, inspect, check, or review…"/><div className="composer-actions"><label className="composer-attach" role="button" tabIndex={0} aria-label="Attach a Binance Pay QR"><span>＋ <b>Attach QR</b></span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => attach(event.target.files?.[0])}/></label><div><button className="new-conversation-button" onClick={newConversation} disabled={!turns.length}>New conversation</button><button className="send-button" onClick={submit} aria-label="Send instruction">↑</button></div></div></div><p className="approval-note"><span>◆</span> AgentPay prepares actions for review. Nothing executes without your explicit approval.</p></div>
      </section>
      <RecentChats conversations={recentConversations} onSelect={openConversation}/>
      </section>
    </section>
    <section className="overview-secondary-grid">
      <RecentActivity onViewAll={() => onNavigate("activity")}/>
      <PaymentRails walletStatus={walletStatus} onNavigate={onNavigate}/>
    </section>
  </div>;
}
function extractUrl(text:string){return text.match(/https:\/\/[^\s]+/)?.[0]?.replace(/[),.;]+$/,"")||""}

function QrResult({fileName,file}:{fileName:string;file?:File}){return <div className="qr-result"><div className="inline-empty"><strong>{fileName}</strong><span>QR attached. The shared Binance Pay decoder will validate it when available.</span></div><BinancePayWorkflow initialFile={file} embedded/></div>}

function InlineActivity(){const [events,setEvents]=useState<any[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState("");useEffect(()=>{void fetch("/api/payments/activity?page=1&limit=6&sort=newest",{cache:"no-store"}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"Unable to load activity.");setEvents(Array.isArray(data.events)?data.events:[])}).catch(e=>setError(e instanceof Error?e.message:"Unable to load activity.")).finally(()=>setLoading(false))},[]);if(loading)return <div className="inline-state">Loading your activity…</div>;if(error)return <div className="workflow-error">{error}</div>;if(!events.length)return <div className="inline-state"><strong>No activity yet</strong><span>Approved transfers and payment requests will appear here.</span></div>;return <div className="inline-events">{events.map(event=><div className="inline-event" key={event.id}><span className={"activity-dot "+statusClass(event.statusGroup||event.status)}/><div><strong>{event.title||event.description||event.activityType||"Payment activity"}</strong><small>{event.source||"AgentPay"} · {event.summary||"Activity recorded"}</small></div><span className={"status-text "+statusClass(event.statusGroup||event.status)}>{friendlyStatus(event.statusGroup||event.status)}</span></div>)}</div>}

function InlineBalance(){const [data,setData]=useState<WalletOverview|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState("");useEffect(()=>{void fetch("/api/wallet/overview",{cache:"no-store"}).then(async response=>{const value=await response.json();if(!response.ok)throw new Error(value.error||"Unable to load wallet.");setData(value as WalletOverview)}).catch(e=>setError(e instanceof Error?e.message:"Unable to load wallet.")).finally(()=>setLoading(false))},[]);if(loading)return <div className="inline-state">Loading your Agentic Wallet overview…</div>;if(error)return <div className="workflow-error">{error}</div>;if(!data)return <div className="inline-state">No wallet overview returned.</div>;const total=data.balances.reduce((sum,item)=>sum+(Number(item.value)||0),0);return <div className="inline-balance"><div><span className="metric-label">Agentic Wallet value</span><strong>{data.status==="CONNECTED"?"$"+total.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):"Not connected"}</strong><small>{data.status==="CONNECTED"?data.balances.length+" visible assets · Live data":"Connect in Agentic Wallet to load balances."}</small></div>{data.balances.length>0&&<div className="balance-pills">{data.balances.slice(0,5).map(balance=><span key={balance.binanceChainId+":"+balance.address}><b>{balance.symbol}</b> {balance.balance}</span>)}</div>}</div>}
function RecentChats({conversations,onSelect}:{conversations:StoredConversation[];onSelect:(conversation:StoredConversation)=>void}){return <aside className="recent-chats-panel"><div className="panel-heading"><div><h2>Recent Chats</h2><p>Saved on this browser</p></div></div><div className="recent-chat-list">{conversations.length?conversations.map((conversation)=><button className="recent-chat-item" key={conversation.id} onClick={()=>onSelect(conversation)}><img className="recent-chat-icon" src="/brand/assistant-badge.svg" alt=""/><span><strong>{conversation.title}</strong><small>{new Date(conversation.savedAt).toLocaleString()}</small></span></button>):<div className="recent-chat-empty"><span>✦</span><strong>No saved conversations</strong><p>Click New conversation after chatting to save it here.</p></div>}</div></aside>}
function RecentActivity({onViewAll}:{onViewAll:()=>void}){const [items,setItems]=useState<Array<{id:string;title:string;status:string;time:string;source:string}>>([]);useEffect(()=>{void fetch('/api/payments/activity?page=1&limit=10&sort=newest',{cache:'no-store'}).then(r=>r.json()).then(data=>{if(Array.isArray(data.events)){setItems(data.events.slice(0,10).map((e:any)=>({id:e.id,title:e.title||e.description||e.activityType,status:e.statusGroup,time:e.occurredAt||e.updatedAt,source:e.source})));return}const list=[...(data.x402Intents||[]).map((x:any)=>({id:'x'+x.id,title:`x402 · ${x.resourceHost}`,status:x.status,time:x.updatedAt,source:'x402'})),...(data.binancePayReceipts||[]).map((x:any)=>({id:'b'+x.id,title:`${x.amount||''} ${x.currency||''}`,status:x.status,time:x.updatedAt,source:'Binance Pay'})),...(data.intents||[]).map((x:any)=>({id:'w'+x.id,title:`${x.amount} ${x.asset}`,status:x.status,time:x.createdAt,source:'Agentic Wallet'}))].sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)).slice(0,10);setItems(list)}).catch(()=>setItems([]))},[]);return <aside className="recent-panel"><div className="panel-heading"><h2>Recent Activity</h2><button onClick={onViewAll}>View all</button></div><div className="recent-list">{items.length?items.map(item=><div className="recent-item" key={item.id}><span className={`activity-dot ${statusClass(item.status)}`}/><div><strong>{item.title}</strong><small>{item.source} · {new Date(item.time).toLocaleString()}</small></div><span className={`status-text ${statusClass(item.status)}`}>{friendlyStatus(item.status)}</span></div>):<div className="recent-empty"><span>◷</span><strong>No activity yet</strong><p>Approved transfers and inspected payment requests will appear here.</p></div>}</div></aside>}
function PaymentRails({walletStatus,onNavigate}:{walletStatus:WalletConnectionStatus;onNavigate:(view:View)=>void}){const[binancePay,setBinancePay]=useState<"checking"|"ready"|"setup"|"unavailable">("checking");const[binanceAccount,setBinanceAccount]=useState<"checking"|"configured"|"setup"|"unavailable">("checking");useEffect(()=>{void fetch("/api/binance-pay/status",{cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error();const data=await response.json();setBinancePay(data.configured?"ready":"setup")}).catch(()=>setBinancePay("unavailable"));void fetch("/api/binance-account/status",{cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error();const data=await response.json();setBinanceAccount(data.configured?"configured":"setup")}).catch(()=>setBinanceAccount("unavailable"))},[]);return <section className="payment-rails"><div className="rails-heading"><div><span className="eyebrow">CONNECTIONS</span><h2>Payment rails</h2></div><button onClick={()=>onNavigate("settings")}>Manage</button></div><div className="rail-list"><button className="rail-row" onClick={()=>onNavigate("wallet")}><span className="rail-logo">◇</span><span><strong>Agentic Wallet</strong><small>Balances, transfers, and x402 signing</small></span><span className={`rail-status ${walletStatus==="CONNECTED"?"success":"neutral"}`}>{walletStatus==="CONNECTED"?"Connected":"Not connected"}</span><b>Open →</b></button><button className="rail-row" onClick={()=>onNavigate("binance-pay")}><span className="rail-logo signal">B</span><span><strong>Binance Pay</strong><small>QR, payment links, and receive links</small></span><span className={`rail-status ${binancePay==="ready"?"success":"neutral"}`}>{binancePay==="checking"?"Checking":binancePay==="ready"?"Ready":binancePay==="setup"?"Setup required":"Unavailable"}</span><b>Open →</b></button><button className="rail-row" onClick={()=>onNavigate("binance")}><span className="rail-logo dark">B</span><span><strong>Binance Account</strong><small>Read-only portfolio overview</small></span><span className={`rail-status ${binanceAccount==="configured"?"success":"neutral"}`}>{binanceAccount==="checking"?"Checking":binanceAccount==="configured"?"Configured":binanceAccount==="setup"?"Setup required":"Unavailable"}</span><b>Review →</b></button></div></section>}
function statusClass(status:string){const s=String(status).toLowerCase();if(['failed','failure','rejected'].some(x=>s.includes(x)))return'failed';if(['success','confirmed','completed'].some(x=>s.includes(x)))return'success';if(s.includes('awaiting')||s.includes('approval'))return'awaiting';return'pending'}
function friendlyStatus(status:string){const c=statusClass(status);return c==='success'?'Successful':c==='failed'?'Failed':c==='awaiting'?'Awaiting approval':'Pending'}

function BinanceView(){return <PageFrame eyebrow="Binance account" title="Your Binance portfolio" description="Balances across your Binance account sources, with each source checked independently."><BinancePortfolioView/></PageFrame>}
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
  const [action,setAction]=useState<""|"send"|"receive">("");
  const [sort,setSort]=useState<"high"|"low">("high");
  const [copiedReceiveAddress,setCopiedReceiveAddress]=useState("");
  const sendDialogRef=useRef<HTMLDialogElement|null>(null);
  const receiveDialogRef=useRef<HTMLDialogElement|null>(null);
  useEffect(()=>{
    const dialog=action==="send"?sendDialogRef.current:action==="receive"?receiveDialogRef.current:null;
    if(!dialog||dialog.open)return;
    if(typeof dialog.showModal==="function")dialog.showModal();
    else dialog.setAttribute("open","");
  },[action]);
  function closeWalletDialog(){sendDialogRef.current?.close();receiveDialogRef.current?.close();setCopiedReceiveAddress("");setAction("");}
  async function copyReceiveAddress(address:string){await navigator.clipboard.writeText(address);setCopiedReceiveAddress(address);window.setTimeout(()=>setCopiedReceiveAddress(current=>current===address?"":current),1500);}
  const totalValue = overview.balances.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  const balances = [...overview.balances].sort((left, right) => {
    const leftValue = Number(left.value);
    const rightValue = Number(right.value);
    if (!Number.isFinite(leftValue) && Number.isFinite(rightValue)) return 1;
    if (Number.isFinite(leftValue) && !Number.isFinite(rightValue)) return -1;
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return left.symbol.localeCompare(right.symbol);
    return sort === "high" ? rightValue - leftValue : leftValue - rightValue;
  });
  const receiveFamilies=groupWalletReceiveAddresses(overview);
  return <div className="wallet-dashboard">
    <div className="wallet-summary"><div><span className="metric-label">Portfolio value</span><strong>${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><small>Live balances from Binance Agentic Wallet.</small></div><div className="summary-actions"><button type="button" className="primary-button" onClick={()=>setAction("send")}>Send</button><button type="button" className="secondary-button" onClick={()=>setAction("receive")}>Receive</button><button type="button" className="ghost-button wallet-refresh-button" onClick={() => void onRefresh()}>Refresh</button></div></div>
    {action==="send"&&<dialog ref={sendDialogRef} className="receive-link-dialog wallet-send-dialog" aria-modal="true" aria-labelledby="wallet-send-title" onCancel={(event)=>{event.preventDefault();closeWalletDialog();}} onClick={(event)=>{if(event.target===event.currentTarget)closeWalletDialog();}}><div className="receive-link-dialog-heading"><div><span>Agentic Wallet</span><h2 id="wallet-send-title">Prepare a transfer</h2></div></div><PaymentWorkflow onClose={closeWalletDialog}/></dialog>}{action==="receive"&&<dialog ref={receiveDialogRef} className="receive-link-dialog wallet-receive-dialog" aria-modal="true" aria-labelledby="wallet-receive-title" onCancel={(event)=>{event.preventDefault();closeWalletDialog();}} onClick={(event)=>{if(event.target===event.currentTarget)closeWalletDialog();}}><div className="receive-link-dialog-heading"><div><span>Agentic Wallet</span><h2 id="wallet-receive-title">Receive assets</h2></div></div><div className="wallet-receive-content"><div className="wallet-receive-warning"><strong>Choose the correct network</strong><span>EVM networks may share an address format, but assets must still be sent on a supported network.</span></div>{receiveFamilies.length?<div className="wallet-receive-families">{receiveFamilies.map(family=><section className="wallet-receive-family" key={family.id}><div className="wallet-receive-family-heading"><span className={`wallet-family-badge ${family.id}`}>{family.label}</span><p>{family.description}</p></div><div className="wallet-receive-addresses">{family.groups.map(group=><div className="wallet-receive-address" key={`${family.id}:${group.address}`}><div className="wallet-network-chips">{group.networks.map(network=><span key={network}>{network}</span>)}</div><code>{group.address}</code><button type="button" className="primary-button" onClick={()=>void copyReceiveAddress(group.address)}>{copiedReceiveAddress===group.address?"Copied":"Copy address"}</button></div>)}</div></section>)}</div>:<div className="inline-empty">No receive addresses were returned by Agentic Wallet.</div>}</div><div className="receive-link-dialog-actions"><button type="button" className="secondary-button" onClick={closeWalletDialog}>Close</button></div></dialog>}
    <div className="wallet-data-grid"><section className="wallet-section"><div className="section-heading wallet-section-heading"><div><h2>Balances</h2><span>{overview.balances.length} assets</span></div><select aria-label="Sort wallet balances" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="high">Highest to lowest</option><option value="low">Lowest to highest</option></select></div>{balances.length ? <div className="data-list">{balances.map((balance) => <div className="data-row" key={`${balance.binanceChainId}:${balance.address}`}><div><strong>{balance.symbol}</strong><small>Chain {balance.binanceChainId} · {balance.address}</small></div><div className="amount"><strong>{balance.balance}</strong><small>${Number(balance.value || 0).toFixed(2)}</small></div></div>)}</div> : <p className="inline-empty">No balances above the wallet’s display threshold.</p>}</section>
    <section className="wallet-section"><div className="section-heading"><h2>Recent transactions</h2><span>Last {Math.min(5,overview.transactions.length)}</span></div>{overview.transactions.length ? <div className="data-list">{overview.transactions.slice(0,5).map((transaction) => <div className="data-row" key={transaction.txHash}><div><strong>{transaction.txType || "Transaction"}</strong><small className="mono-value">{transaction.txHash}</small></div><div className="amount"><strong className={`tx-status ${transaction.status}`}>{transaction.status}</strong><small>{transaction.txTime}</small></div></div>)}</div> : <p className="inline-empty">No recent transactions returned.</p>}</section></div>
  </div>;
}

function groupWalletReceiveAddresses(overview: WalletOverview) {
  const makeGroups=(solana:boolean)=>{
    const grouped=new Map<string,{address:string;networks:string[]}>();
    for(const item of overview.addresses){
      if(isSolanaChain(item.binanceChainId)!==solana)continue;
      const key=solana?item.address:item.address.toLowerCase();
      const chain=overview.chains.find(candidate=>candidate.binanceChainId===item.binanceChainId);
      const network=item.chainName||chain?.simpleName||chain?.name||item.binanceChainId;
      const existing=grouped.get(key);
      if(existing){if(!existing.networks.includes(network))existing.networks.push(network);}
      else grouped.set(key,{address:item.address,networks:[network]});
    }
    return [...grouped.values()].map(group=>({...group,networks:group.networks.sort()}));
  };
  return [
    {id:"evm",label:"EVM",description:"Use this address only on one of the supported EVM networks shown below.",groups:makeGroups(false)},
    {id:"solana",label:"Solana",description:"Use this address only for transfers sent through the Solana network.",groups:makeGroups(true)},
  ].filter(family=>family.groups.length>0);
}


function BinancePayView(){return <PageFrame eyebrow="Binance Pay" title="Pay or receive with Binance" description="Inspect a supported Binance QR or payment link, review every detail, or generate an official receive link."><BinancePayWorkflow/></PageFrame>}
function X402View(){return <PageFrame eyebrow="Agentic Wallet / x402" title="Discover and purchase agent services" description="Browse BNB-compatible services or inspect a trusted HTTP 402 resource directly."><X402Workflow/></PageFrame>}
function ActivityView(){return <PageFrame eyebrow="Activity" title="All activity" description="Filter approvals, transfers, Binance Pay payments, x402 purchases, successes, pending actions, and failures."><ActivityWorkflow/></PageFrame>}
function SettingsView({tab,onTabChange,settings,onSettingsChange,onNavigate}:{tab:SettingsTab;onTabChange:(tab:SettingsTab)=>void;settings:AgentPaySettings;onSettingsChange:(settings:AgentPaySettings)=>void;onNavigate:(view:View)=>void}){const tabs:SettingsTab[]=['Rules & approvals','Connections','Diagnostics','General'];return <PageFrame eyebrow="Settings" title="Control how AgentPay works" description="Manage approval rules, connections, diagnostics, and product preferences without exposing credentials."><div className="settings-tabs">{tabs.map(x=><button key={x} className={tab===x?'active':''} onClick={()=>onTabChange(x)}>{x}</button>)}</div>{tab==='Rules & approvals'&&<RulesSettings settings={settings} onSaved={onSettingsChange}/>} {tab==='Connections'&&<DiagnosticsSettings mode="connections" onNavigate={onNavigate}/>} {tab==='Diagnostics'&&<DiagnosticsSettings mode="diagnostics" onNavigate={onNavigate}/>} {tab==='General'&&<ProfileSettings settings={settings} onSaved={onSettingsChange}/>}</PageFrame>}
function PageFrame({eyebrow,title,description,children}:{eyebrow:string;title:string;description:string;children:React.ReactNode}){return <div className="standard-page"><div className="eyebrow"><span className="spark">✦</span>{eyebrow}</div><h1>{title}</h1><p className="lead">{description}</p>{children}</div>}
