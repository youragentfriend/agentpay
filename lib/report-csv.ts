import type { SpendingReport, SpendingReportTransaction } from "@/lib/report-types";

const SOURCE_LABELS: Record<string, string> = {
  "agentic-wallet": "Agentic Wallet",
  "binance-pay": "Binance Pay",
  x402: "x402",
};

const COLUMNS = [
  "Date",
  "Time",
  "Timezone",
  "Title",
  "Description",
  "Payment rail",
  "Status",
  "Spend state",
  "Asset",
  "Native amount",
  "USD amount",
  "Reference",
  "AgentPay transaction ID",
] as const;

function spreadsheetSafe(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown) {
  return `"${spreadsheetSafe(value).replace(/"/g, '""')}"`;
}

function transactionDateTime(transaction: SpendingReportTransaction, timeZone: string) {
  const date = new Date(transaction.occurredAt);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}:${get("second")}` };
}

export function spendingReportCsv(report: SpendingReport) {
  const rows = report.transactions.map(transaction => {
    const occurred = transactionDateTime(transaction, report.timezone);
    return [
      occurred.date,
      occurred.time,
      report.timezone,
      transaction.title,
      transaction.summary,
      SOURCE_LABELS[transaction.source] || transaction.source,
      transaction.status,
      transaction.spendState,
      transaction.asset,
      transaction.amount,
      transaction.amountUsd,
      transaction.reference,
      transaction.id,
    ];
  });
  return `\uFEFF${[COLUMNS, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function spendingReportCsvFilename(report: SpendingReport) {
  const from = report.range.from || "report";
  const to = report.range.to || from;
  return `agentpay-spending-${from}${to !== from ? `-to-${to}` : ""}.csv`;
}
