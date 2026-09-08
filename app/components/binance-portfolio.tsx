"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BinanceAccountStatus,
  BinanceBalance,
  BinancePortfolio,
  BinancePortfolioSource,
} from "@/lib/binance-portfolio-types";

const TABS: Array<{ value: "all" | BinancePortfolioSource; label: string }> = [
  { value: "all", label: "All" },
  { value: "spot", label: "Spot" },
  { value: "funding", label: "Funding" },
  { value: "futures", label: "Futures" },
  { value: "earn", label: "Earn" },
  { value: "margin", label: "Margin" },
];
const PAGE_SIZE = 10;

function usd(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function quantity(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(amount);
}

function sourceTone(state: string) {
  return state === "available" ? "success" : state === "empty" ? "neutral" : "failed";
}

function sourceState(state: string) {
  return state === "available" ? "Available" : state === "empty" ? "No balance" : state === "error" ? "Error" : "Unavailable";
}

export function BinancePortfolioView() {
  const [portfolio, setPortfolio] = useState<BinancePortfolio | null>(null);
  const [tab, setTab] = useState<"all" | BinancePortfolioSource>("all");
  const [sort, setSort] = useState<"high" | "low">("high");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/binance-account/portfolio", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load Binance portfolio.");
      setPortfolio(data as BinancePortfolio);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Binance portfolio.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [tab]);

  const filtered = useMemo(() => {
    const balances = portfolio?.balances.filter((balance) => tab === "all" || balance.source === tab) ?? [];
    return [...balances].sort((left, right) => {
      if (left.usdValue === null && right.usdValue !== null) return 1;
      if (left.usdValue !== null && right.usdValue === null) return -1;
      if (left.usdValue === null || right.usdValue === null) return left.asset.localeCompare(right.asset);
      const leftValue = left.usdValue;
      const rightValue = right.usdValue;
      return sort === "high" ? rightValue - leftValue : leftValue - rightValue;
    });
  }, [portfolio, sort, tab]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return <div className="binance-portfolio-page">
    <div className="portfolio-summary binance-summary">
      <div>
        <span className="metric-label">Estimated total balance</span>
        <strong>{portfolio?.configured ? usd(portfolio.estimatedTotalUsd) : "— USD"}</strong>
        <small>{portfolio?.refreshedAt ? `Estimated from Binance market prices · Refreshed ${new Date(portfolio.refreshedAt).toLocaleString()}` : "Connect a separate least-privilege API key to load balances."}</small>
      </div>
      <div className="summary-actions">
        <button className="primary-button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh balances"}</button>
      </div>
    </div>

    {error && <div className="workflow-error">{error}</div>}

    {portfolio?.configured && <div className="binance-source-grid" aria-label="Binance source health">
      {portfolio.sources.map((source) => <div className="binance-source-card" key={source.source}>
        <div><strong>{source.label}</strong><small>{source.itemCount} balance{source.itemCount === 1 ? "" : "s"}</small></div>
        <span className={`source-health ${sourceTone(source.state)}`}>{sourceState(source.state)}</span>
        {source.message && <p>{source.message}</p>}
      </div>)}
    </div>}

    {!loading && portfolio && !portfolio.configured ? <BinanceSetup/> : <>
      <section className="wallet-section binance-balance-section">
        <div className="section-heading">
          <div><h2>{TABS.find((item) => item.value === tab)?.label} balances</h2><span>{portfolio ? `${filtered.length} visible · assets under ${usd(portfolio.dustThresholdUsd)} hidden` : "Loading balances"}</span></div>
          <div className="binance-balance-controls">
            <select id="binance-source" aria-label="Account source" value={tab} onChange={(event) => setTab(event.target.value as typeof tab)}>
              {TABS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
            </select>
            <select id="binance-sort" aria-label="Sort balances" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
              <option value="high">Highest to lowest</option>
              <option value="low">Lowest to highest</option>
            </select>
          </div>
        </div>
        <div className="binance-table-head"><span>Asset</span><span>Account</span><span className="numeric-heading">Available</span><span className="numeric-heading">Total / equity</span><span className="numeric-heading">Estimated USD</span></div>
        {loading && !portfolio ? <div className="portfolio-empty"><strong>Loading your Binance portfolio…</strong><p>Each account source is checked independently.</p></div> : visible.length ? <div className="binance-balance-list">
          {visible.map((balance) => <BalanceRow balance={balance} key={balance.id}/>) }
        </div> : <div className="portfolio-empty"><strong>No {tab === "all" ? "visible" : TABS.find((item) => item.value === tab)?.label} balances</strong><p>{portfolio?.connection === "error" ? "The configured key could not read any account source. Check its reading permission and IP restriction." : "There are no priced balances above the configured dust threshold for this view."}</p></div>}
      </section>
      {filtered.length > PAGE_SIZE && <div className="activity-pagination"><span>Page {page} of {pages} · {filtered.length} balances</span><div><button className="ghost-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="ghost-button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>}
      {portfolio && portfolio.unpricedAssetCount > 0 && <p className="binance-valuation-note">{portfolio.unpricedAssetCount} balance{portfolio.unpricedAssetCount === 1 ? " is" : "s are"} shown without a USD estimate because no supported Binance market pair was available.</p>}
    </>}
  </div>;
}

function BalanceRow({ balance }: { balance: BinanceBalance }) {
  return <div className="binance-balance-row">
    <span className="asset-cell"><strong>{balance.asset}</strong></span>
    <span><strong>{balance.sourceLabel}</strong><small>{balance.source === "margin" ? "Net equity" : balance.valuation === "derived" ? "Derived estimate" : "Account balance"}</small></span>
    <span className="numeric-cell">{quantity(balance.available)}</span>
    <span className="numeric-cell">{quantity(balance.total)}</span>
    <span className="numeric-cell"><strong>{balance.usdValue === null ? "Not priced" : usd(balance.usdValue)}</strong>{balance.priceUsd !== null && <small>{usd(balance.priceUsd)} / {balance.asset}</small>}</span>
  </div>;
}

function BinanceSetup() {
  return <section className="binance-setup-card">
    <span className="empty-icon">B</span>
    <h2>Connect your Binance account</h2>
    <p>Connect your Binance account to load balances from each supported account source. Binance Pay credentials remain separate.</p>
    <div className="binance-secret-names"><code>BINANCE_READONLY_API_KEY</code><code>BINANCE_READONLY_API_SECRET</code></div>
    <small>Credentials must be injected through protected server configuration—never pasted into chat or a browser form.</small>
  </section>;
}

export function BinanceAccountConnectionRow() {
  const [status, setStatus] = useState<BinanceAccountStatus | null>(null);
  useEffect(() => {
    void fetch("/api/binance-account/status", { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as BinanceAccountStatus : null)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);
  return <div className="connection-row"><span className="connection-logo">B</span><div className="connection-copy"><strong>Binance Account</strong><span>Read-only Spot, Funding, Futures, Earn, and Margin visibility</span></div><span className={`connection-state ${status?.configured ? "success" : "neutral"}`}>{status?.configured ? "Configured" : "Setup required"}</span></div>;
}
