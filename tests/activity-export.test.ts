import assert from "node:assert/strict";
import test from "node:test";
import { activityEventsToCsv, csvCell } from "../lib/activity-export";
import { activityQueryFromUrl } from "../lib/server/activity-http";

const event = {
  id: "event-1",
  source: "agentic-wallet" as const,
  activityType: "transfer" as const,
  status: "confirmed",
  statusGroup: "successful" as const,
  statusCategory: "green" as const,
  amount: "1",
  asset: "USDT",
  title: "1 USDT",
  summary: "BSC transfer, reviewed\nthen sent",
  occurredAt: "2026-09-05T00:00:00.000Z",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
  reference: "abcd…1234",
};

test("escapes CSV cells and exports only normalized safe columns", () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("=HYPERLINK(\"https://example.com\")"), '"\'=HYPERLINK(""https://example.com"")"');
  const csv = activityEventsToCsv([event]);
  assert.match(csv, /^\uFEFFoccurredAt,activityType,source,status,statusGroup,amount,asset,title,summary,reference/);
  assert.match(csv, /"BSC transfer, reviewed\r?\nthen sent"/);
  assert.equal(csv.includes("createdAt"), false);
  assert.equal(csv.includes("updatedAt"), false);
  assert.equal(csv.includes("recipient"), false);
  assert.equal(csv.includes("tokenAddress"), false);
});

test("maps all Activity filter query parameters without page leakage", () => {
  const query = activityQueryFromUrl("https://agentpay.local/api/payments/activity?status=failed&source=binance-account&type=balance-snapshot&asset=usdt&dateFrom=2026-09-01&dateTo=2026-09-05&sort=oldest&page=2&limit=25");
  assert.deepEqual(query, {
    statusGroup: "failed",
    source: "binance-account",
    activityType: "balance-snapshot",
    search: undefined,
    asset: "usdt",
    from: "2026-09-01",
    to: "2026-09-05",
    sort: "oldest",
    limit: 25,
    page: 2,
  });
});
