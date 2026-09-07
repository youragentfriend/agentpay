import assert from "node:assert/strict";
import test from "node:test";
import type { ActivityEvent, ActivitySource } from "../lib/server/activity-store";
import { buildSpendingReport } from "../lib/server/spending-report";

function event(id: string, values: Partial<ActivityEvent> & { source: ActivitySource; occurredAt: string }): ActivityEvent {
  return { id, source: values.source, activityType: values.source === "agentic-wallet" ? "transfer" : values.source === "binance-pay" ? "binance-pay" : "x402", status: values.status || "completed", statusGroup: values.statusGroup || "successful", statusCategory: values.statusCategory || "green", amount: values.amount || values.amountUsd, asset: values.asset || "USDT", amountUsd: values.amountUsd, direction: values.direction || "outgoing", spendState: values.spendState || "settled", title: values.title || id, summary: values.summary || id, occurredAt: values.occurredAt, createdAt: values.occurredAt, updatedAt: values.occurredAt };
}
const now = new Date("2026-09-07T12:00:00.000Z");
const events: ActivityEvent[] = [
  event("wallet", { source: "agentic-wallet", amountUsd: "10.125", occurredAt: "2026-09-06T01:00:00.000Z" }),
  event("pay", { source: "binance-pay", amountUsd: "20", asset: "USDC", occurredAt: "2026-09-06T03:00:00.000Z" }),
  event("x402", { source: "x402", amountUsd: "2.50", asset: "USDC", occurredAt: "2026-09-07T03:00:00.000Z" }),
  event("pending", { source: "agentic-wallet", amountUsd: "4", spendState: "pending", statusGroup: "in-progress", statusCategory: "blue", occurredAt: "2026-09-07T04:00:00.000Z" }),
  event("cancelled", { source: "binance-pay", amountUsd: "100", spendState: "none", statusGroup: "failed", statusCategory: "red", occurredAt: "2026-09-06T05:00:00.000Z" }),
  event("incoming", { source: "agentic-wallet", amountUsd: "99", direction: "incoming", occurredAt: "2026-09-06T06:00:00.000Z" }),
  event("unvalued", { source: "x402", amount: "1", amountUsd: undefined, occurredAt: "2026-09-06T07:00:00.000Z" }),
];

test("reports settled spending accurately without counting pending, cancelled, or incoming activity", () => {
  const report = buildSpendingReport(events, { preset: "month", timezone: "UTC", now });
  assert.equal(report.range.from, "2026-09-01");
  assert.equal(report.range.to, "2026-09-07");
  assert.equal(report.summary.settledTotalUsd, "32.63");
  assert.equal(report.summary.pendingTotalUsd, "4.00");
  assert.equal(report.summary.transactionCount, 3);
  assert.equal(report.summary.pendingCount, 1);
  assert.equal(report.summary.averageUsd, "10.87");
  assert.equal(report.summary.largestUsd, "20.00");
  assert.equal(report.summary.unvaluedCount, 1);
  assert.equal(report.transactions.some(item => item.id === "pending"), false);
});

test("builds payment-rail, asset, trend, and daily calendar totals", () => {
  const report = buildSpendingReport(events, { preset: "month", timezone: "UTC", calendarMonth: "2026-09", now });
  assert.deepEqual(report.bySource.map(item => [item.key, item.totalUsd]), [["binance-pay", "20.00"], ["agentic-wallet", "10.13"], ["x402", "2.50"]]);
  assert.deepEqual(report.byAsset.map(item => [item.key, item.totalUsd]), [["USDC", "22.50"], ["USDT", "10.13"]]);
  assert.equal(report.calendar.days.find(day => day.date === "2026-09-06")?.totalUsd, "30.13");
  assert.equal(report.calendar.days.find(day => day.date === "2026-09-06")?.count, 2);
  assert.equal(report.calendar.days.find(day => day.date === "2026-09-08")?.future, true);
  assert.equal(report.calendar.days.find(day => day.date === "2026-09-07")?.future, false);
});

test("supports source, asset, pending, custom-date, and past-calendar filters", () => {
  const report = buildSpendingReport(events, { preset: "custom", from: "2026-09-06", to: "2026-09-06", timezone: "UTC", sources: ["agentic-wallet"], asset: "USDT", includePending: true, calendarMonth: "2026-08", now });
  assert.equal(report.summary.settledTotalUsd, "10.13");
  assert.equal(report.transactions.length, 1);
  assert.equal(report.calendar.month, "2026-08");
  const withPending = buildSpendingReport(events, { preset: "month", timezone: "UTC", includePending: true, now });
  assert.equal(withPending.transactions.some(item => item.id === "pending"), true);
  const future = buildSpendingReport(events, { preset: "custom", from: "2026-10-01", to: "2026-10-03", calendarMonth: "2026-10", timezone: "UTC", now });
  assert.equal(future.range.from, "2026-09-07");
  assert.equal(future.range.to, "2026-09-07");
  assert.equal(future.calendar.month, "2026-09");
});

test("groups a yearly trend by month without dropping spending", () => {
  const report = buildSpendingReport(events, { preset: "year", timezone: "UTC", now });
  assert.equal(report.trend.length, 9);
  assert.equal(report.trend.find(point => point.date === "2026-09-01")?.totalUsd, "32.63");
});
