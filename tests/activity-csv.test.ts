import assert from "node:assert/strict";
import test from "node:test";
import { activityCsv, activityCsvFilename } from "../lib/activity-csv";
import { activityDateRange } from "../lib/activity-range";
import type { ActivityEvent } from "../lib/server/activity-store";

const event: ActivityEvent = {
  id: "activity-1",
  source: "agentic-wallet",
  activityType: "transfer",
  status: "confirmed",
  statusGroup: "successful",
  statusCategory: "green",
  amount: "2.5",
  asset: "USDT",
  amountUsd: "2.50",
  direction: "outgoing",
  spendState: "settled",
  title: "=unsafe title",
  summary: "Transfer, \"completed\"",
  occurredAt: "2026-09-07T16:30:15.000Z",
  createdAt: "2026-09-07T16:00:00.000Z",
  updatedAt: "2026-09-07T16:30:15.000Z",
  reference: "0xsa…hash",
};

test("builds a spreadsheet-safe Activity CSV using the configured timezone", () => {
  const csv = activityCsv([event], "Asia/Manila");
  assert.equal(csv.startsWith("\uFEFF"), true);
  assert.match(csv, /"Date","Time","Timezone","Title","Description","Payment rail","Activity type"/);
  assert.match(csv, /"2026-09-08","00:30:15","Asia\/Manila","'=unsafe title","Transfer, ""completed""","Agentic Wallet","transfer"/);
  assert.match(csv, /"USDT","2.5","2.50","0xsa…hash","activity-1"/);
});

test("names Activity exports from the selected period", () => {
  assert.equal(activityCsvFilename(), "agentpay-activity-all-time.csv");
  assert.equal(activityCsvFilename("2026-09-08", "2026-09-08"), "agentpay-activity-2026-09-08.csv");
  assert.equal(activityCsvFilename("2026-09-01", "2026-09-08"), "agentpay-activity-2026-09-01-to-2026-09-08.csv");
});

test("converts Activity date presets to exact configured-timezone boundaries", () => {
  const now = new Date("2026-09-08T05:30:00.000Z");
  const today = activityDateRange("today", "Asia/Manila", undefined, undefined, now);
  assert.equal(today.fromKey, "2026-09-08");
  assert.equal(today.from, "2026-09-07T16:00:00.000Z");
  assert.equal(today.to, "2026-09-08T15:59:59.999Z");
  const week = activityDateRange("week", "Asia/Manila", undefined, undefined, now);
  assert.equal(week.fromKey, "2026-09-02");
  assert.equal(week.toKey, "2026-09-08");
  const custom = activityDateRange("custom", "Asia/Manila", "2026-09-08", "2026-09-01", now);
  assert.equal(custom.fromKey, "2026-09-01");
  assert.equal(custom.toKey, "2026-09-08");
});
