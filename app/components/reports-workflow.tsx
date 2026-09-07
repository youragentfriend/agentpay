"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SpendingRangePreset, SpendingReport } from "@/lib/report-types";

const EMPTY: SpendingReport = { generatedAt: "", timezone: "UTC", range: { preset: "month", from: "", to: "", label: "" }, filters: { sources: [], includePending: false }, summary: { settledTotalUsd: "0.00", pendingTotalUsd: "0.00", transactionCount: 0, pendingCount: 0, averageUsd: "0.00", largestUsd: "0.00", unvaluedCount: 0 }, bySource: [], byAsset: [], trend: [], calendar: { month: "", label: "", days: [] }, transactions: [] };
const PRESETS: Array<{ value: SpendingRangePreset; label: string }> = [{ value: "today", label: "Today" }, { value: "week", label: "7 days" }, { value: "month", label: "This month" }, { value: "quarter", label: "3 months" }, { value: "year", label: "This year" }, { value: "custom", label: "Custom" }];
const SOURCE_COLORS: Record<string, string> = { "agentic-wallet": "#171815", "binance-pay": "#f5cd45", x402: "#5f7c70" };
function usd(value: string) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0)); }
function monthShift(value: string, delta: number) { const [year, month] = value.split("-").map(Number); const date = new Date(Date.UTC(year, month - 1 + delta, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; }
function dateParts(date: Date, timeZone: string) { const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date); const get = (type: string) => parts.find(part => part.type === type)?.value || ""; return `${get("year")}-${get("month")}-${get("day")}`; }
function sourceLabel(source: string) { return source === "agentic-wallet" ? "Agentic Wallet" : source === "binance-pay" ? "Binance Pay" : "x402"; }

export function ReportsWorkflow({ timeZone }: { timeZone: string }) {
  const [report, setReport] = useState(EMPTY);
  const [range, setRange] = useState<SpendingRangePreset>("month");
  const [source, setSource] = useState("");
  const [asset, setAsset] = useState("");
  const [includePending, setIncludePending] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [calendarMonth, setCalendarMonth] = useState("");
  const [view, setView] = useState<"trend" | "calendar">("trend");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ range, timezone: timeZone, includePending: String(includePending) });
      if (source) params.set("source", source); if (asset) params.set("asset", asset); if (calendarMonth) params.set("calendarMonth", calendarMonth);
      if (range === "custom" && from) params.set("from", from); if (range === "custom" && to) params.set("to", to);
      const response = await fetch(`/api/reports/spending?${params}`, { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load spending reports.");
      setReport(data); if (!calendarMonth) setCalendarMonth(data.calendar.month);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Unable to load spending reports."); }
    finally { setLoading(false); }
  }, [asset, calendarMonth, from, includePending, range, source, timeZone, to]);
  useEffect(() => { void load(); }, [load]);

  const currentMonth = dateParts(new Date(), timeZone).slice(0, 7);
  const assetOptions = useMemo(() => report.byAsset.map(item => item.key).filter(key => key !== "unknown"), [report.byAsset]);
  function chooseDate(date: string, future: boolean) { if (future) return; setFrom(date); setTo(date); setRange("custom"); }
  function clearDay() { setFrom(""); setTo(""); setRange("month"); }

  return <section className="reports-workspace">
    <div className="reports-toolbar no-print">
      <div className="reports-presets" aria-label="Report period">{PRESETS.map(item => <button key={item.value} className={range === item.value ? "active" : ""} onClick={() => setRange(item.value)}>{item.label}</button>)}</div>
      <div className="reports-filter-row">
        <label><span>Payment rail</span><select value={source} onChange={event => setSource(event.target.value)}><option value="">All rails</option><option value="agentic-wallet">Agentic Wallet</option><option value="binance-pay">Binance Pay</option><option value="x402">x402</option></select></label>
        <label><span>Asset</span><select value={asset} onChange={event => setAsset(event.target.value)}><option value="">All assets</option>{assetOptions.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="reports-pending-toggle"><input type="checkbox" checked={includePending} onChange={event => setIncludePending(event.target.checked)} /><span>Include pending transactions</span></label>
        <button className="secondary-button" onClick={() => window.print()}>Print report</button>
      </div>
      {range === "custom" && <div className="reports-custom-range"><label><span>From</span><input type="date" max={dateParts(new Date(), timeZone)} value={from} onChange={event => setFrom(event.target.value)} /></label><label><span>To</span><input type="date" max={dateParts(new Date(), timeZone)} value={to} onChange={event => setTo(event.target.value)} /></label>{from && to && from === to && <button className="ghost-button" onClick={clearDay}>Clear selected day</button>}</div>}
    </div>

    <header className="reports-print-heading"><div><span className="eyebrow">AgentPay analytics</span><h2>Spending report</h2><p>{report.range.label} · {report.timezone}</p></div><div><strong>{usd(report.summary.settledTotalUsd)}</strong><span>Settled spending</span></div></header>
    {error && <div className="workflow-error">{error}</div>}
    {loading && !report.generatedAt ? <div className="workflow-message">Building your spending report…</div> : <>
      <div className="reports-summary-grid">
        <Metric label="Total spent" value={usd(report.summary.settledTotalUsd)} note={report.summary.pendingCount ? `${usd(report.summary.pendingTotalUsd)} pending` : "Settled transactions only"} />
        <Metric label="Transactions" value={String(report.summary.transactionCount)} note={report.summary.pendingCount ? `${report.summary.pendingCount} pending` : "Completed spending"} />
        <Metric label="Average payment" value={usd(report.summary.averageUsd)} note="Settled average" />
        <Metric label="Largest payment" value={usd(report.summary.largestUsd)} note="Within selected period" />
      </div>
      {report.summary.unvaluedCount > 0 && <div className="reports-unvalued">{report.summary.unvaluedCount} matching transaction{report.summary.unvaluedCount === 1 ? " has" : "s have"} no reliable USD value and {report.summary.unvaluedCount === 1 ? "is" : "are"} excluded from totals.</div>}

      <div className="reports-grid">
        <article className="reports-card reports-primary-card">
          <div className="reports-card-heading"><div><span className="eyebrow">Spending activity</span><h3>{view === "trend" ? "Spending over time" : report.calendar.label}</h3></div><div className="reports-view-toggle no-print"><button className={view === "trend" ? "active" : ""} onClick={() => setView("trend")}>Trend</button><button className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}>Calendar</button></div></div>
          {view === "trend" ? <SpendingTrend report={report} /> : <SpendingCalendar report={report} currentMonth={currentMonth} onPrevious={() => setCalendarMonth(monthShift(report.calendar.month, -1))} onNext={() => setCalendarMonth(monthShift(report.calendar.month, 1))} onSelect={chooseDate} />}
        </article>
        <article className="reports-card reports-rail-card"><div className="reports-card-heading"><div><span className="eyebrow">Payment rails</span><h3>Spending by rail</h3></div></div><RailDonut report={report} /></article>
        <article className="reports-card reports-assets-card"><div className="reports-card-heading"><div><span className="eyebrow">Assets</span><h3>Spending by asset</h3></div></div><AssetBars report={report} /></article>
      </div>

      <article className="reports-card reports-transactions"><div className="reports-card-heading"><div><span className="eyebrow">Included activity</span><h3>Matching transactions</h3></div><span>{report.transactions.length} shown</span></div>{report.transactions.length ? <div className="reports-transaction-list">{report.transactions.map(item => <div className="reports-transaction" key={item.id}><span className={`reports-source-dot ${item.source}`} /><div><strong>{item.title}</strong><small>{sourceLabel(item.source)} · {item.summary}</small></div><div><strong>{usd(item.amountUsd)}</strong><small>{new Date(item.occurredAt).toLocaleString("en-US", { timeZone: report.timezone })}{item.spendState === "pending" ? " · Pending" : ""}</small></div></div>)}</div> : <div className="reports-empty"><strong>No settled spending for this period</strong><span>Prepared, approved, cancelled, and failed-before-payment requests are not counted as spending.</span></div>}</article>
      <footer className="reports-print-footer">Generated {report.generatedAt ? new Date(report.generatedAt).toLocaleString("en-US", { timeZone: report.timezone }) : "—"} · Pending and unvalued activity is shown separately and never silently added to settled totals.</footer>
    </>}
  </section>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <article className="reports-metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function SpendingTrend({ report }: { report: SpendingReport }) { const points = report.trend; const max = Math.max(1, ...points.map(point => Number(point.totalUsd) + Number(point.pendingUsd))); return <div className="reports-trend"><div className="reports-y-label">{usd(String(max))}</div><div className="reports-bars" aria-label="Spending over time chart">{points.map(point => <div className="reports-bar-column" key={point.date} title={`${point.date}: ${usd(point.totalUsd)} settled${Number(point.pendingUsd) ? `, ${usd(point.pendingUsd)} pending` : ""}`}><div className="reports-bar-stack"><span className="reports-bar pending" style={{ height: `${Number(point.pendingUsd) / max * 100}%` }} /><span className="reports-bar settled" style={{ height: `${Number(point.totalUsd) / max * 100}%` }} /></div><small>{report.range.preset === "year" ? point.date.slice(5, 7) : points.length <= 14 ? point.date.slice(5) : point.date.slice(8)}</small></div>)}</div>{!points.some(point => Number(point.totalUsd) || Number(point.pendingUsd)) && <div className="reports-chart-empty">No spending to chart for this period.</div>}</div>; }
function SpendingCalendar({ report, currentMonth, onPrevious, onNext, onSelect }: { report: SpendingReport; currentMonth: string; onPrevious: () => void; onNext: () => void; onSelect: (date: string, future: boolean) => void }) { const [year, month] = report.calendar.month.split("-").map(Number), offset = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); return <div className="reports-calendar"><div className="reports-calendar-nav no-print"><button onClick={onPrevious} aria-label="Previous month">‹</button><strong>{report.calendar.label}</strong><button onClick={onNext} disabled={report.calendar.month >= currentMonth} aria-label="Next month">›</button></div><div className="reports-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day}>{day}</span>)}</div><div className="reports-calendar-grid">{Array.from({ length: offset }, (_, index) => <span className="reports-calendar-blank" key={`blank-${index}`} />)}{report.calendar.days.map(day => <button key={day.date} disabled={day.future} className={`${day.future ? "future" : ""} ${report.range.from === day.date && report.range.to === day.date ? "selected" : ""}`} onClick={() => onSelect(day.date, day.future)}><span>{day.day}</span><strong>{day.count ? usd(day.totalUsd) : "—"}</strong></button>)}</div></div>; }
function RailDonut({ report }: { report: SpendingReport }) { const total = Number(report.summary.settledTotalUsd); let position = 0; const stops = report.bySource.map(item => { const start = position; position += item.percentage; return `${SOURCE_COLORS[item.key] || "#a4a69f"} ${start}% ${position}%`; }); return <div className="reports-donut-wrap"><div className="reports-donut" style={{ background: stops.length ? `conic-gradient(${stops.join(",")})` : "#ecebe4" }}><div><strong>{usd(String(total))}</strong><span>Total spent</span></div></div><div className="reports-breakdown">{report.bySource.length ? report.bySource.map(item => <div key={item.key}><span><i style={{ background: SOURCE_COLORS[item.key] }} />{item.label}</span><strong>{usd(item.totalUsd)}</strong><small>{item.percentage}%</small></div>) : <div className="reports-chart-empty">No rail spending yet.</div>}</div></div>; }
function AssetBars({ report }: { report: SpendingReport }) { const max = Math.max(1, ...report.byAsset.map(item => Number(item.totalUsd))); return <div className="reports-asset-bars">{report.byAsset.length ? report.byAsset.map(item => <div key={item.key}><div><strong>{item.label}</strong><span>{usd(item.totalUsd)}</span></div><span><i style={{ width: `${Number(item.totalUsd) / max * 100}%` }} /></span></div>) : <div className="reports-chart-empty">No valued assets for this period.</div>}</div>; }
