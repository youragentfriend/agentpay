import assert from "node:assert/strict";
import test from "node:test";
import { spendingReportCsv, spendingReportCsvFilename } from "../lib/report-csv";
import type { SpendingReport } from "../lib/report-types";

const report: SpendingReport = {
  generatedAt: "2026-09-08T05:00:00.000Z",
  timezone: "Asia/Manila",
  range: { preset: "custom", from: "2026-09-01", to: "2026-09-08", label: "2026-09-01 to 2026-09-08" },
  filters: { sources: ["x402"], asset: "USDC", includePending: true },
  summary: { settledTotalUsd: "2.50", pendingTotalUsd: "1.00", transactionCount: 1, pendingCount: 1, averageUsd: "2.50", largestUsd: "2.50", unvaluedCount: 0 },
  bySource: [],
  byAsset: [],
  trend: [],
  calendar: { month: "2026-09", label: "September 2026", days: [] },
  transactions: [{
    id: "activity-1",
    source: "x402",
    title: "=unsafe title",
    summary: "Quoted, \"description\"",
    status: "completed",
    spendState: "settled",
    amount: "2.5",
    asset: "USDC",
    amountUsd: "2.50",
    occurredAt: "2026-09-07T16:30:15.000Z",
    reference: "ref-1",
  }],
};

test("builds a spreadsheet-safe CSV with all safe report transaction fields", () => {
  const csv = spendingReportCsv(report);
  assert.equal(csv.startsWith("\uFEFF"), true);
  assert.match(csv, /"Date","Time","Timezone","Title","Description","Payment rail"/);
  assert.match(csv, /"2026-09-08","00:30:15","Asia\/Manila","'=unsafe title","Quoted, ""description""","x402"/);
  assert.match(csv, /"USDC","2.5","2.50","ref-1","activity-1"/);
});

test("names CSV exports from the active report range", () => {
  assert.equal(spendingReportCsvFilename(report), "agentpay-spending-2026-09-01-to-2026-09-08.csv");
  assert.equal(spendingReportCsvFilename({ ...report, range: { ...report.range, from: "2026-09-08", to: "2026-09-08" } }), "agentpay-spending-2026-09-08.csv");
});
