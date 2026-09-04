"use client";

import { useCallback, useEffect, useState } from "react";
import type { WalletConnectionStatus, WalletOverview, WalletSignIn } from "@/lib/wallet-types";
import { PaymentWorkflow } from "@/app/components/payment-workflow";
import { ActivityWorkflow } from "@/app/components/activity-workflow";
import { BinancePayWorkflow } from "@/app/components/binance-pay-workflow";
import { X402Workflow } from "@/app/components/x402-workflow";
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "development";

type View = "overview" | "binance" | "binance-pay" | "wallet" | "x402" | "activity" | "settings";
const labels: Record<View,string>={overview:"Overview",binance:"Binance", "binance-pay":"Binance Pay",wallet:"Agentic Wallet",x402:"x402",activity:"Activity",settings:"Settings"};

export default function Home(){
 const [view,setView]=useState<View>("overview"); const [walletStatus,setWalletStatus]=useState<WalletConnectionStatus>("UNCONNECTED"); const [binanceOpen,setBinanceOpen]=useState(true); const [walletOpen,setWalletOpen]=useState(true);
 return <main className="app-shell"><aside className="sidebar"><div className="brand"><img className="brand-mark" src="/brand/agentpay-mark.png" alt=""/><div><strong>AgentPay</strong><span>Payment OS</span></div></div><div className="connection-pill"><span className={`status-dot ${walletStatus==="CONNECTED"?"active-dot":"muted"}`}/><span>{walletStatus==="CONNECTED"?"Wallet connected":"Execution safely disabled"}</span></div><nav className="nav-list" aria-label="Main navigation"><span className="nav-label">WORKSPACE</span><NavButton active={view==="overview"} icon="⌂" label="Overview" onClick={()=>setView("overview")}/><NavParent label="Binance" icon="B" active={view==="binance"||view==="binance-pay"} open={binanceOpen} onNavigate={()=>setView("binance")} onToggle={()=>setBinanceOpen(v=>!v)}/>{binanceOpen&&<div className="nav-submenu"><NavButton active={view==="binance-pay"} icon="▦" label="Binance Pay" onClick={()=>setView("binance-pay")}/></div>}<NavParent label="Agentic Wallet" icon="◈" active={view==="wallet"||view==="x402"} open={walletOpen} onNavigate={()=>setView("wallet")} onToggle={()=>setWalletOpen(v=>!v)}/>{walletOpen&&<div className="nav-submenu"><NavButton active={view==="x402"} icon="402" label="x402" onClick={()=>setView("x402")}/></div>}<NavButton active={view==="activity"} icon="◷" label="Activity" onClick={()=>setView("activity")}/><NavButton active={view==="settings"} icon="⚙" label="Settings" onClick={()=>setView("settings")}/></nav><div className="sidebar-footer"><div className="security-note"><span>◆</span><div><strong>Approval-first</strong><small>Every payment is reviewable</small></div></div><span className="version">Local development · v{appVersion}</span></div></aside><section className="content-area"><header className="topbar"><div className="breadcrumbs"><span>AgentPay</span><b>/</b><strong>{labels[view]}</strong></div><div className="topbar-actions"><span className="environment"><span className="status-dot muted"/> Local</span><button className="avatar" aria-label="Account">M</button></div></header><div className="page-content">{view==="overview"&&<OverviewView onNavigate={setView}/>} {view==="binance"&&<BinanceView/>}{view==="binance-pay"&&<BinancePayView/>}{view==="wallet"&&<WalletView onStatusChange={setWalletStatus}/>} {view==="x402"&&<X402View/>}{view==="activity"&&<ActivityView/>}{view==="settings"&&<SettingsView/>}</div></section></main>;
}
function NavButton({active,icon,label,onClick}:{active:boolean;icon:string;label:string;onClick:()=>void}){return <button className={`nav-item ${active?"active":""}`} onClick={onClick}><span className="nav-icon">{icon}</span><span>{label}</span></button>}
function NavParent({label,icon,active,open,onNavigate,onToggle}:{label:string;icon:string;active:boolean;open:boolean;onNavigate:()=>void;onToggle:()=>void}){return <div className={`nav-parent ${active?"active":""}`}><button className="nav-parent-main" onClick={onNavigate}><span className="nav-icon">{icon}</span><span>{label}</span></button><button className="nav-chevron" aria-label={`${open?"Collapse":"Expand"} ${label}`} onClick={onToggle}>{open?"⌄":"›"}</button></div>}

type ChatTurn = { id: number; role: "user" | "assistant"; text: string; action?: "payment" | "binance-pay" | "binance-balance" | "qr" | "activity" | "balance" | "x402"; file?: File };

function OverviewView({onNavigate}:{onNavigate:(view:View)=>void}){
 const [message,setMessage]=useState(""); const [turns,setTurns]=useState<ChatTurn[]>([]); const [nextId,setNextId]=useState(1);
 function addTurn(text:string, action?:ChatTurn["action"], file?:File){const id=nextId;setNextId(value=>value+1);setTurns(value=>[...value,{id,role:"user",text,action,file},{id:id+0.5,role:"assistant",text:action==="payment"?"I’ll prepare an approval-first Agentic Wallet transfer. Review the exact intent before approving.":action==="binance-pay"?"I’ll open the Binance Pay inspector here so you can paste a link or attach a QR without leaving this conversation.":action==="binance-balance"?"A separate read-only Binance account connection is required before I can show Spot, Funding, Futures, Earn, or Margin balances.":action==="qr"?"I’ll inspect this QR through the shared Binance Pay validation pipeline.":action==="activity"?"Here’s the latest activity, normalized across every payment rail.":action==="balance"?"Here’s the current Agentic Wallet overview, including balances and connection status.":action==="x402"?"I’ll inspect the x402 service here. If your message includes a URL, it is prefilled below.":"I can prepare wallet payments, inspect Binance Pay QR codes, check wallet balances, review activity, or inspect x402 services. Tell me what you’d like to do."}]);}
 function submit(){const value=message.trim();if(!value)return;const lower=value.toLowerCase();const action:ChatTurn["action"]=lower.includes("activity")||lower.includes("history")?"activity":lower.includes("x402")||lower.includes("service")?"x402":lower.includes("binance")&&(lower.includes("balance")||lower.includes("portfolio")||lower.includes("funding")||lower.includes("spot")||lower.includes("futures"))?"binance-balance":lower.includes("binance pay")||lower.includes("payment link")?"binance-pay":lower.includes("balance")||lower.includes("wallet")||lower.includes("holdings")?"balance":"payment";addTurn(value,action);setMessage("")}
 function attach(file:File|undefined){if(file)addTurn("Attached QR: "+file.name,"qr",file)}
 return <div className="overview-page"><div className="overview-heading"><div className="eyebrow"><span className="spark">✦</span> AgentPay command center</div><h1>Move money with confidence.</h1><p className="lead">One calm place to prepare payments, understand your wallet, and inspect every request. AgentPay always pauses for your approval before funds move.</p></div><div className="overview-grid"><section className="assistant-panel"><div className="assistant-status"><span className="status-dot active-dot"/> <span>AgentPay assistant</span><span className="assistant-ready">Ready</span></div><div className="conversation" aria-live="polite">{turns.length===0&&<div className="conversation-empty"><span className="empty-icon">✦</span><div><strong>What should we take care of?</strong><p>Try “send 5 USDT to…”, “show my balance”, “what happened today?”, or “inspect this x402 service”.</p></div></div>}{turns.map(turn=>turn.role==="user"?<div className="chat-bubble user-bubble" key={turn.id}><span>You</span><p>{turn.text}</p></div>:<div className="chat-result" key={turn.id}><div className="assistant-message"><strong>AgentPay</strong><span>{turn.text}</span></div>{turn.action==="payment"&&<PaymentWorkflow initialInstruction={turns.find(item=>item.id===turn.id-0.5)?.text}/>} {turn.action==="binance-pay"&&<BinancePayWorkflow embedded/>}{turn.action==="binance-balance"&&<div className="inline-state"><strong>Connect Binance portfolio</strong><span>Use the Binance page to configure a protected read-only connection. AgentPay will never request API credentials in chat.</span></div>} {turn.action==="qr"&&<QrResult file={turns.find(item=>item.id===turn.id-0.5)?.file} fileName={turns.find(item=>item.id===turn.id-0.5)?.text.replace("Attached QR: ","")||"attached QR"}/>} {turn.action==="activity"&&<InlineActivity/>}{turn.action==="balance"&&<InlineBalance/>}{turn.action==="x402"&&<X402Workflow initialUrl={extractUrl(turns.find(item=>item.id===turn.id-0.5)?.text||"")}/>}</div>)}</div><div className="composer"><textarea className="composer-input" value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submit()}}} placeholder="Ask AgentPay to pay, check balances, review activity, or inspect x402…"/><label className="composer-attach" role="button" tabIndex={0} aria-label="Attach a Binance Pay QR" onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();event.currentTarget.querySelector("input")?.click()}}}><span>＋</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>attach(e.target.files?.[0])}/></label><button className="send-button" onClick={submit} aria-label="Send instruction">↑</button></div><div className="composer-footer"><span>Enter to send · Shift + Enter for a new line</span><span className="approval-note">◆ No funds move without approval</span></div></section><RecentActivity onViewAll={()=>onNavigate("activity")}/></div></div>
}

function extractUrl(text:string){return text.match(/https:\/\/[^\s]+/)?.[0]?.replace(/[),.;]+$/,"")||""}

function QrResult({fileName,file}:{fileName:string;file?:File}){return <div className="qr-result"><div className="inline-empty"><strong>{fileName}</strong><span>QR attached. The shared Binance Pay decoder will validate it when available.</span></div><BinancePayWorkflow initialFile={file} embedded/></div>}

function InlineActivity(){const [events,setEvents]=useState<any[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState("");useEffect(()=>{void fetch("/api/payments/activity?page=1&limit=6&sort=newest",{cache:"no-store"}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"Unable to load activity.");setEvents(Array.isArray(data.events)?data.events:[])}).catch(e=>setError(e instanceof Error?e.message:"Unable to load activity.")).finally(()=>setLoading(false))},[]);if(loading)return <div className="inline-state">Loading your activity…</div>;if(error)return <div className="workflow-error">{error}</div>;if(!events.length)return <div className="inline-state"><strong>No activity yet</strong><span>Approved transfers and payment requests will appear here.</span></div>;return <div className="inline-events">{events.map(event=><div className="inline-event" key={event.id}><span className={"activity-dot "+statusClass(event.statusGroup||event.status)}/><div><strong>{event.title||event.description||event.activityType||"Payment activity"}</strong><small>{event.source||"AgentPay"} · {event.summary||"Activity recorded"}</small></div><span className={"status-text "+statusClass(event.statusGroup||event.status)}>{friendlyStatus(event.statusGroup||event.status)}</span></div>)}</div>}

function InlineBalance(){const [data,setData]=useState<WalletOverview|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState("");useEffect(()=>{void fetch("/api/wallet/overview",{cache:"no-store"}).then(async response=>{const value=await response.json();if(!response.ok)throw new Error(value.error||"Unable to load wallet.");setData(value as WalletOverview)}).catch(e=>setError(e instanceof Error?e.message:"Unable to load wallet.")).finally(()=>setLoading(false))},[]);if(loading)return <div className="inline-state">Loading your Agentic Wallet overview…</div>;if(error)return <div className="workflow-error">{error}</div>;if(!data)return <div className="inline-state">No wallet overview returned.</div>;const total=data.balances.reduce((sum,item)=>sum+(Number(item.value)||0),0);return <div className="inline-balance"><div><span className="metric-label">Agentic Wallet value</span><strong>{data.status==="CONNECTED"?"$"+total.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):"Not connected"}</strong><small>{data.status==="CONNECTED"?data.balances.length+" visible assets · Live data":"Connect in Agentic Wallet to load balances."}</small></div>{data.balances.length>0&&<div className="balance-pills">{data.balances.slice(0,5).map(balance=><span key={balance.binanceChainId+":"+balance.address}><b>{balance.symbol}</b> {balance.balance}</span>)}</div>}</div>}
function RecentActivity({onViewAll}:{onViewAll:()=>void}){const [items,setItems]=useState<Array<{id:string;title:string;status:string;time:string;source:string}>>([]);useEffect(()=>{void fetch('/api/payments/activity',{cache:'no-store'}).then(r=>r.json()).then(data=>{if(Array.isArray(data.events)){setItems(data.events.slice(0,10).map((e:any)=>({id:e.id,title:e.title||e.description||e.activityType,status:e.statusGroup,time:e.occurredAt||e.updatedAt,source:e.source})));return}const list=[...(data.x402Intents||[]).map((x:any)=>({id:'x'+x.id,title:`x402 · ${x.resourceHost}`,status:x.status,time:x.updatedAt,source:'x402'})),...(data.binancePayReceipts||[]).map((x:any)=>({id:'b'+x.id,title:`${x.amount||''} ${x.currency||''}`,status:x.status,time:x.updatedAt,source:'Binance Pay'})),...(data.intents||[]).map((x:any)=>({id:'w'+x.id,title:`${x.amount} ${x.asset}`,status:x.status,time:x.createdAt,source:'Agentic Wallet'}))].sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)).slice(0,10);setItems(list)}).catch(()=>setItems([]))},[]);return <aside className="recent-panel"><div className="panel-heading"><div><span>Timeline</span><h2>Recent Activity</h2></div><button onClick={onViewAll}>View all</button></div><div className="recent-list">{items.length?items.map(item=><div className="recent-item" key={item.id}><span className={`activity-dot ${statusClass(item.status)}`}/><div><strong>{item.title}</strong><small>{item.source} · {new Date(item.time).toLocaleString()}</small></div><span className={`status-text ${statusClass(item.status)}`}>{friendlyStatus(item.status)}</span></div>):<p className="inline-empty">No recent activity yet.</p>}</div></aside>}
function statusClass(status:string){const s=String(status).toLowerCase();if(['failed','failure','rejected'].some(x=>s.includes(x)))return'failed';if(['success','confirmed','completed'].some(x=>s.includes(x)))return'success';if(s.includes('awaiting')||s.includes('approval'))return'awaiting';return'pending'}
function friendlyStatus(status:string){const c=statusClass(status);return c==='success'?'Successful':c==='failed'?'Failed':c==='awaiting'?'Awaiting approval':'Pending'}

function BinanceView(){const [tab,setTab]=useState('All');return <PageFrame eyebrow="Binance account" title="Your Binance portfolio" description="A clean read-only view of Spot, Funding, Futures, Earn, and Margin balances. Trading and withdrawals are intentionally out of scope."><div className="portfolio-summary"><div><span className="metric-label">Estimated total balance</span><strong>— USD</strong><small>Connect a least-privilege read-only Binance account to load balances.</small></div><button className="primary-button">Connect read-only account</button></div><div className="account-tabs">{['All','Spot','Funding','Futures','Earn','Margin'].map(x=><button className={tab===x?'active':''} key={x} onClick={()=>setTab(x)}>{x}</button>)}</div><section className="wallet-section"><div className="section-heading"><h2>{tab} balances</h2><span>Top 10 · assets over $0.10</span></div><div className="portfolio-table-head"><span>Asset</span><span>Available</span><span>Total / equity</span><span>USD value</span></div><div className="portfolio-empty"><strong>Read-only Binance connection required</strong><p>No balances are fabricated. Once connected, this table will paginate ten USD-valued assets at a time.</p></div></section></PageFrame>}
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
  const totalValue = overview.balances.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  return <div className="wallet-dashboard">
    <div className="wallet-summary"><div><span className="metric-label">Portfolio value</span><strong>${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><small>Live balances from Binance Agentic Wallet.</small></div><div className="summary-actions"><button className="primary-button" onClick={()=>setAction("send")}>Send</button><button className="secondary-button" onClick={()=>setAction("receive")}>Receive</button><button className="ghost-button" onClick={() => void onRefresh()}>Refresh</button></div></div>
    {action==="send"&&<PaymentWorkflow/>}{action==="receive"&&<section className="wallet-section receive-addresses"><div className="section-heading"><h2>Receive</h2><button onClick={()=>setAction("")}>Close</button></div><p className="panel-note">Choose the correct network before sharing an address. Sending on the wrong network may permanently lose funds.</p><div className="data-list">{overview.addresses.map(address=><div className="data-row" key={address.binanceChainId}><div><strong>{address.chainName}</strong><small className="mono-value">{address.address}</small></div><button className="secondary-button" onClick={()=>void navigator.clipboard.writeText(address.address)}>Copy</button></div>)}</div></section>}
    <section className="wallet-section"><div className="section-heading"><h2>Balances</h2><span>{overview.balances.length} assets</span></div>{overview.balances.length ? <div className="data-list">{overview.balances.map((balance) => <div className="data-row" key={`${balance.binanceChainId}:${balance.address}`}><div><strong>{balance.symbol}</strong><small>Chain {balance.binanceChainId} · {balance.address}</small></div><div className="amount"><strong>{balance.balance}</strong><small>${Number(balance.value || 0).toFixed(2)}</small></div></div>)}</div> : <p className="inline-empty">No balances above the wallet’s display threshold.</p>}</section>
    <section className="wallet-section"><div className="section-heading"><h2>Recent transactions</h2><span>Last {Math.min(5,overview.transactions.length)}</span></div>{overview.transactions.length ? <div className="data-list">{overview.transactions.slice(0,5).map((transaction) => <div className="data-row" key={transaction.txHash}><div><strong>{transaction.txType || "Transaction"}</strong><small className="mono-value">{transaction.txHash}</small></div><div className="amount"><strong className={`tx-status ${transaction.status}`}>{transaction.status}</strong><small>{transaction.txTime}</small></div></div>)}</div> : <p className="inline-empty">No recent transactions returned.</p>}</section>
  </div>;
}


function BinancePayView(){return <PageFrame eyebrow="Binance Pay" title="Pay or receive with Binance" description="Inspect a supported Binance QR or payment link, review every detail, or generate an official receive link."><BinancePayWorkflow/></PageFrame>}
function X402View(){return <PageFrame eyebrow="Agentic Wallet / x402" title="Discover and purchase agent services" description="Browse BNB-compatible services or inspect a trusted HTTP 402 resource directly."><X402Workflow/></PageFrame>}
function ActivityView(){return <PageFrame eyebrow="Activity" title="All activity" description="Filter approvals, transfers, Binance Pay payments, x402 purchases, successes, pending actions, and failures."><ActivityWorkflow/></PageFrame>}
function SettingsView(){const [tab,setTab]=useState('Rules & approvals');return <PageFrame eyebrow="Settings" title="Control how AgentPay works" description="Manage approval rules, connections, diagnostics, and product preferences without exposing credentials."><div className="settings-tabs">{['Rules & approvals','Connections','Diagnostics','General'].map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x}</button>)}</div>{tab==='Rules & approvals'&&<div className="rule-list"><RuleRow title="Require approval for every payment" description="Enabled and recommended" enabled/><RuleRow title="Per-payment spending limit" description="Configure after redesign validation"/><RuleRow title="Daily spending limit" description="Configure after redesign validation"/><RuleRow title="Trusted destinations and services" description="Server-side allowlists remain enforced"/></div>}{tab==='Connections'&&<div className="connection-list"><ConnectionRow title="Agentic Wallet" detail="Balances, transfers, and x402 signing"/><ConnectionRow title="Binance Pay" detail="QR, payment links, and receive links"/><ConnectionRow title="Binance Account" detail="Future read-only portfolio connection"/></div>}{tab==='Diagnostics'&&<div className="diagnostic-grid"><Diagnostic title="Database" value="SQLite connected" tone="success"/><Diagnostic title="Payment execution" value="Disabled by default" tone="awaiting"/><Diagnostic title="Environment" value="Local development"/><Diagnostic title="Version" value={`v${appVersion}`}/></div>}{tab==='General'&&<div className="settings-card"><label className="field"><span>Display currency</span><select defaultValue="USD"><option>USD</option></select></label><div className="setting-row"><div><strong>Appearance</strong><small>AgentPay light theme</small></div><span className="theme-chip">Light</span></div></div>}</PageFrame>}
function RuleRow({title,description,enabled=false}:{title:string;description:string;enabled?:boolean}){return <div className="rule-row"><div><strong>{title}</strong><span>{description}</span></div><span className={`toggle ${enabled?'on':''}`}><span/></span></div>}
function ConnectionRow({title,detail}:{title:string;detail:string}){return <div className="connection-row"><div className="connection-logo">{title==='Agentic Wallet'?'W':title==='Binance Pay'?'B':'A'}</div><div className="connection-copy"><strong>{title}</strong><span>{detail}</span></div><span className="not-connected">Review connection</span><button className="secondary-button">Manage</button></div>}
function Diagnostic({title,value,tone=''}:{title:string;value:string;tone?:string}){return <div className="diagnostic-card"><span>{title}</span><strong className={tone}>{value}</strong></div>}
function PageFrame({eyebrow,title,description,children}:{eyebrow:string;title:string;description:string;children:React.ReactNode}){return <div className="standard-page"><div className="eyebrow"><span className="spark">✦</span>{eyebrow}</div><h1>{title}</h1><p className="lead">{description}</p>{children}</div>}
