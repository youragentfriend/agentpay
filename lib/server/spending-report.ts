import { listReportActivityEvents, type ActivityEvent, type ActivitySource } from "@/lib/server/activity-store";
import type { SpendingBreakdown, SpendingCalendarDay, SpendingRangePreset, SpendingReport, SpendingReportTransaction } from "@/lib/report-types";

const SOURCES: ActivitySource[] = ["agentic-wallet", "binance-pay", "binance-onchain", "x402"];
const SOURCE_LABELS: Record<ActivitySource, string> = { "agentic-wallet": "Agentic Wallet", "binance-pay": "Binance Pay", "binance-onchain": "Binance Onchain Pay", x402: "x402" };

type Options = { preset?: string; from?: string; to?: string; timezone?: string; sources?: string[]; asset?: string; includePending?: boolean; calendarMonth?: string; now?: Date };
function validTimeZone(value: string) { try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return value; } catch { return "UTC"; } }
function parts(date: Date, timeZone: string) { const values = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date); const get = (type: string) => values.find(part => part.type === type)?.value || ""; return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")) }; }
function keyFromParts(year: number, month: number, day: number) { return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`; }
function dateKey(date: Date, timeZone: string) { const value = parts(date, timeZone); return keyFromParts(value.year, value.month, value.day); }
function shiftKey(key: string, days: number) { const [year, month, day] = key.split("-").map(Number); const date = new Date(Date.UTC(year, month - 1, day + days)); return keyFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()); }
function monthShift(monthKey: string, delta: number) { const [year, month] = monthKey.split("-").map(Number); const date = new Date(Date.UTC(year, month - 1 + delta, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; }
function monthLastDay(monthKey: string) { const [year, month] = monthKey.split("-").map(Number); return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
function monthLabel(monthKey: string) { const [year, month] = monthKey.split("-").map(Number); return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1))); }
function validDateKey(value?: string) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ? value : undefined; }
function validMonthKey(value?: string) { return value && /^\d{4}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}-01T00:00:00Z`)) ? value : undefined; }
function preset(value?: string): SpendingRangePreset { return ["today", "week", "month", "quarter", "year", "custom"].includes(value || "") ? value as SpendingRangePreset : "month"; }
function range(options: Options, today: string) {
  const selected = preset(options.preset), [year, month] = today.split("-").map(Number); let from = today, to = today, label = "Today";
  if (selected === "week") { from = shiftKey(today, -6); label = "Last 7 days"; }
  if (selected === "month") { from = keyFromParts(year, month, 1); label = monthLabel(today.slice(0, 7)); }
  if (selected === "quarter") { from = `${monthShift(today.slice(0, 7), -2)}-01`; label = "Last 3 months"; }
  if (selected === "year") { from = `${year}-01-01`; label = String(year); }
  if (selected === "custom") { from = validDateKey(options.from) || today; to = validDateKey(options.to) || today; if (from > to) [from, to] = [to, from]; if (to > today) to = today; if (from > today) from = today; label = from === to ? from : `${from} to ${to}`; }
  return { preset: selected, from, to, label };
}
function cents(value?: string) { if (!value || !/^\d+(?:\.\d+)?$/.test(value.trim())) return undefined; const [whole, fraction = ""] = value.trim().split("."); const padded = (fraction + "000").slice(0, 3); let result = BigInt(whole) * BigInt(100) + BigInt(padded.slice(0, 2)); if (Number(padded[2]) >= 5) result += BigInt(1); return result; }
function money(value: bigint) { const negative = value < BigInt(0), absolute = negative ? -value : value; return `${negative ? "-" : ""}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, "0")}`; }
function percentage(value: bigint, total: bigint) { return total ? Math.round(Number(value * BigInt(1000) / total)) / 10 : 0; }
function buildBreakdown(entries: Array<{ key: string; label: string; amount: bigint }>, total: bigint): SpendingBreakdown[] { const rows = new Map<string, { label: string; amount: bigint; count: number }>(); for (const entry of entries) { const current = rows.get(entry.key) || { label: entry.label, amount: BigInt(0), count: 0 }; current.amount += entry.amount; current.count += 1; rows.set(entry.key, current); } return [...rows.entries()].map(([key, value]) => ({ key, label: value.label, totalUsd: money(value.amount), count: value.count, percentage: percentage(value.amount, total) })).sort((a, b) => Number(b.totalUsd) - Number(a.totalUsd)); }

export function buildSpendingReport(events: ActivityEvent[], options: Options = {}): SpendingReport {
  const now = options.now || new Date(), timezone = validTimeZone(options.timezone || "UTC"), today = dateKey(now, timezone), selectedRange = range(options, today);
  const sources = [...new Set((options.sources || []).filter(value => SOURCES.includes(value as ActivitySource)))] as ActivitySource[];
  const activeSources = sources.length ? sources : SOURCES;
  const asset = options.asset?.trim().toUpperCase() || undefined;
  const eligible = events.filter(event => event.direction === "outgoing" && event.spendState !== "none" && activeSources.includes(event.source) && (!asset || event.asset?.toUpperCase() === asset));
  const inRange = eligible.filter(event => { const key = dateKey(new Date(event.occurredAt), timezone); return key >= selectedRange.from && key <= selectedRange.to; });
  let settledTotal = BigInt(0), pendingTotal = BigInt(0), settledCount = 0, pendingCount = 0, largest = BigInt(0), unvaluedCount = 0;
  const settledEntries: Array<{ event: ActivityEvent; amount: bigint; date: string }> = [], pendingEntries: Array<{ event: ActivityEvent; amount: bigint; date: string }> = [];
  for (const event of inRange) { const amount = cents(event.amountUsd); if (amount === undefined) { unvaluedCount += 1; continue; } const row = { event, amount, date: dateKey(new Date(event.occurredAt), timezone) }; if (event.spendState === "settled") { settledTotal += amount; settledCount += 1; if (amount > largest) largest = amount; settledEntries.push(row); } else { pendingTotal += amount; pendingCount += 1; pendingEntries.push(row); } }
  const trendMap = new Map<string, { settled: bigint; pending: bigint; count: number }>(); for (let key = selectedRange.from; key <= selectedRange.to; key = shiftKey(key, 1)) trendMap.set(key, { settled: BigInt(0), pending: BigInt(0), count: 0 });
  for (const row of settledEntries) { const value = trendMap.get(row.date); if (value) { value.settled += row.amount; value.count += 1; } }
  if (options.includePending) for (const row of pendingEntries) { const value = trendMap.get(row.date); if (value) value.pending += row.amount; }
  const requestedCalendarMonth = validMonthKey(options.calendarMonth), calendarMonth = requestedCalendarMonth && requestedCalendarMonth <= today.slice(0, 7) ? requestedCalendarMonth : today.slice(0, 7), calendarTotals = new Map<string, { total: bigint; count: number }>();
  for (const event of eligible.filter(item => item.spendState === "settled")) { const key = dateKey(new Date(event.occurredAt), timezone); if (!key.startsWith(calendarMonth)) continue; const amount = cents(event.amountUsd); if (amount === undefined) continue; const value = calendarTotals.get(key) || { total: BigInt(0), count: 0 }; value.total += amount; value.count += 1; calendarTotals.set(key, value); }
  const calendarDays: SpendingCalendarDay[] = Array.from({ length: monthLastDay(calendarMonth) }, (_, index) => { const date = `${calendarMonth}-${String(index + 1).padStart(2, "0")}`, value = calendarTotals.get(date); return { date, day: index + 1, totalUsd: money(value?.total || BigInt(0)), count: value?.count || 0, future: date > today }; });
  const transactions: SpendingReportTransaction[] = [...settledEntries, ...(options.includePending ? pendingEntries : [])].sort((a, b) => Date.parse(b.event.occurredAt) - Date.parse(a.event.occurredAt)).slice(0, 50).map(({ event, amount }) => ({ id: event.id, source: event.source, title: event.title, summary: event.summary, status: event.status, spendState: event.spendState as "settled" | "pending", amount: event.amount, asset: event.asset, amountUsd: money(amount), occurredAt: event.occurredAt, reference: event.reference }));
  const dailyTrend = [...trendMap.entries()].map(([date, value]) => ({ date, settled: value.settled, pending: value.pending, count: value.count }));
  const groupedTrend = new Map<string, { settled: bigint; pending: bigint; count: number }>();
  for (const point of dailyTrend) {
    const key = selectedRange.preset === "year" ? `${point.date.slice(0, 7)}-01` : selectedRange.preset === "quarter" ? shiftKey(selectedRange.from, Math.floor((Date.parse(`${point.date}T00:00:00Z`) - Date.parse(`${selectedRange.from}T00:00:00Z`)) / 604_800_000) * 7) : point.date;
    const current = groupedTrend.get(key) || { settled: BigInt(0), pending: BigInt(0), count: 0 }; current.settled += point.settled; current.pending += point.pending; current.count += point.count; groupedTrend.set(key, current);
  }
  return { generatedAt: now.toISOString(), timezone, range: selectedRange, filters: { sources: activeSources, asset, includePending: Boolean(options.includePending) }, summary: { settledTotalUsd: money(settledTotal), pendingTotalUsd: money(pendingTotal), transactionCount: settledCount, pendingCount, averageUsd: settledCount ? money(settledTotal / BigInt(settledCount)) : "0.00", largestUsd: money(largest), unvaluedCount }, bySource: buildBreakdown(settledEntries.map(row => ({ key: row.event.source, label: SOURCE_LABELS[row.event.source], amount: row.amount })), settledTotal), byAsset: buildBreakdown(settledEntries.map(row => ({ key: row.event.asset || "unknown", label: row.event.asset || "Unknown asset", amount: row.amount })), settledTotal), trend: [...groupedTrend.entries()].map(([date, value]) => ({ date, totalUsd: money(value.settled), pendingUsd: money(value.pending), count: value.count })), calendar: { month: calendarMonth, label: monthLabel(calendarMonth), days: calendarDays }, transactions };
}

export function getSpendingReport(options: Options = {}) { return buildSpendingReport(listReportActivityEvents(), options); }
