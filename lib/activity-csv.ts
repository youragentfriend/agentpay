import type { ActivityEvent } from "@/lib/server/activity-store";

const SOURCE_LABELS: Record<string, string> = { "agentic-wallet": "Agentic Wallet", "binance-pay": "Binance Pay", x402: "x402" };
const COLUMNS = ["Date", "Time", "Timezone", "Title", "Description", "Payment rail", "Activity type", "Provider status", "Status group", "Direction", "Spend state", "Asset", "Native amount", "USD amount", "Reference", "Activity ID"] as const;

function validTimeZone(value: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return value; }
  catch { return "UTC"; }
}
function safe(value: unknown) { const text = value === undefined || value === null ? "" : String(value); return /^[=+\-@]/.test(text) ? `'${text}` : text; }
function cell(value: unknown) { return `"${safe(value).replace(/"/g, '""')}"`; }
function dateTime(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const get = (type: string) => parts.find(part => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}:${get("second")}` };
}

export function activityCsv(events: ActivityEvent[], requestedTimeZone: string) {
  const timeZone = validTimeZone(requestedTimeZone);
  const rows = events.map(event => {
    const occurred = dateTime(event.occurredAt, timeZone);
    return [occurred.date, occurred.time, timeZone, event.title, event.summary, SOURCE_LABELS[event.source] || event.source, event.activityType, event.status, event.statusGroup, event.direction, event.spendState, event.asset, event.amount, event.amountUsd, event.reference, event.id];
  });
  return `\uFEFF${[COLUMNS, ...rows].map(row => row.map(cell).join(",")).join("\r\n")}\r\n`;
}

export function activityCsvFilename(from?: string, to?: string) {
  if (!from) return "agentpay-activity-all-time.csv";
  return `agentpay-activity-${from}${to && to !== from ? `-to-${to}` : ""}.csv`;
}
