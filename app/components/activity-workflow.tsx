"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { activityCsvFilename } from "@/lib/activity-csv";
import { activityDateRange, type ActivityRangePreset } from "@/lib/activity-range";

type Event = { id: string; source: string; activityType: string; status: string; statusGroup: string; statusCategory: string; amount?: string; asset?: string; title: string; summary: string; occurredAt: string; reference?: string };
type Page = { events: Event[]; pagination: { page: number; limit: number; total: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean } };
const empty: Page = { events: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } };
const PRESETS: Array<{ value: ActivityRangePreset; label: string }> = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "7 days" },
  { value: "month", label: "This month" },
  { value: "quarter", label: "3 months" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" },
];

export function ActivityWorkflow({ timeZone }: { timeZone: string }) {
  const [data, setData] = useState<Page>(empty);
  const [range, setRange] = useState<ActivityRangePreset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const selectedRange = useMemo(() => activityDateRange(range, timeZone, from, to), [from, range, timeZone, to]);
  const today = useMemo(() => activityDateRange("today", timeZone).fromKey || "", [timeZone]);

  const query = useCallback((requestedPage?: number, format?: "csv") => {
    const params = new URLSearchParams({ sort });
    if (requestedPage !== undefined) { params.set("page", String(requestedPage)); params.set("limit", "25"); }
    if (format) { params.set("format", format); params.set("timezone", selectedRange.timeZone); }
    if (status) params.set("statusGroup", status);
    if (source) params.set("source", source);
    if (search.trim()) params.set("search", search.trim());
    if (selectedRange.from) params.set("from", selectedRange.from);
    if (selectedRange.to) params.set("to", selectedRange.to);
    return params;
  }, [search, selectedRange.from, selectedRange.timeZone, selectedRange.to, sort, source, status]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/payments/activity?${query(page)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load activity.");
      setData({ events: result.events || [], pagination: result.pagination || empty.pagination });
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Unable to load activity."); }
    finally { setLoading(false); }
  }, [page, query]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), search ? 250 : 0); return () => window.clearTimeout(timer); }, [load, search]);
  function change(setter: (value: string) => void, value: string) { setter(value); setPage(1); }
  function chooseRange(value: ActivityRangePreset) {
    if (value === "custom" && !from && !to) { setFrom(today); setTo(today); }
    setRange(value); setPage(1);
  }
  async function exportCsv() {
    setExporting(true); setError("");
    try {
      const response = await fetch(`/api/payments/activity?${query(undefined, "csv")}`, { cache: "no-store" });
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || "Unable to export activity."); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = activityCsvFilename(selectedRange.fromKey, selectedRange.toKey);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) { setError(exportError instanceof Error ? exportError.message : "Unable to export activity."); }
    finally { setExporting(false); }
  }

  return <div className="activity-workspace">
    <div className="activity-toolbar">
      <div className="activity-presets" aria-label="Activity period">{PRESETS.map(item => <button key={item.value} className={range === item.value ? "active" : ""} onClick={() => chooseRange(item.value)}>{item.label}</button>)}</div>
      <div className="activity-filter-row">
        <label className="activity-search"><span>⌕</span><input value={search} onChange={event => change(setSearch, event.target.value)} placeholder="Search activity" /></label>
        <select aria-label="Activity status" value={status} onChange={event => change(setStatus, event.target.value)}><option value="">All statuses</option><option value="awaiting-approval">Awaiting approval</option><option value="in-progress">Pending</option><option value="successful">Successful</option><option value="failed">Failed</option></select>
        <select aria-label="Payment rail" value={source} onChange={event => change(setSource, event.target.value)}><option value="">All rails</option><option value="agentic-wallet">Agentic Wallet</option><option value="binance-pay">Binance Pay</option><option value="x402">x402</option></select>
        <select aria-label="Activity sort" value={sort} onChange={event => change(setSort, event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
        <button className="secondary-button" disabled={exporting} onClick={() => void exportCsv()}>{exporting ? "Exporting…" : "Export CSV"}</button>
      </div>
      {range === "custom" && <div className="activity-custom-range"><label><span>From</span><input type="date" max={today} value={from} onChange={event => change(setFrom, event.target.value)} /></label><label><span>To</span><input type="date" max={today} value={to} onChange={event => change(setTo, event.target.value)} /></label></div>}
    </div>
    {error && <div className="workflow-error">{error}</div>}
    {loading ? <div className="workflow-message">Loading activity…</div> : !data.events.length ? <div className="empty-state"><div className="empty-icon">◷</div><h2>No matching activity</h2><p>Change or clear the filters to see approvals, payments, and purchases.</p></div> : <div className="activity-table">
      <div className="activity-table-head"><span>Activity</span><span>Source</span><span>Status</span><span>Time</span></div>
      {data.events.map(event => <article className="activity-table-row" key={event.id}><div><strong>{event.title}</strong><small>{event.summary}{event.reference ? ` · ${event.reference}` : ""}</small></div><span className="source-chip">{event.source.replace("agentic-wallet", "Agentic Wallet").replace("binance-pay", "Binance Pay")}</span><span className={`review-status ${event.statusCategory} ${event.statusGroup}`}>{event.statusGroup.replaceAll("-", " ")}</span><time>{new Date(event.occurredAt).toLocaleString("en-US", { timeZone: selectedRange.timeZone })}</time></article>)}
    </div>}
    <div className="activity-pagination"><span>{data.pagination.total} activities · Page {data.pagination.page} of {Math.max(1, data.pagination.totalPages)}</span><div><button className="secondary-button" disabled={!data.pagination.hasPreviousPage || loading} onClick={() => setPage(current => current - 1)}>Previous</button><button className="secondary-button" disabled={!data.pagination.hasNextPage || loading} onClick={() => setPage(current => current + 1)}>Next</button></div></div>
  </div>;
}
