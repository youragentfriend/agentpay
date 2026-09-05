import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { queryActivityEvents, recordPolicyRejection } from "../lib/server/activity-store";
import { policyAuditFingerprint, recordPolicyRejectionFromError } from "../lib/server/activity-policy-audit";

process.env.AGENTPAY_DB_PATH = path.join(mkdtempSync(path.join(os.tmpdir(), "agentpay-policy-audit-")), "agentpay.sqlite");

test("records idempotent, normalized, redacted policy rejection events", () => {
  const input = {
    source: "agentic-wallet" as const,
    operation: "prepare",
    code: "POLICY_DESTINATION_NOT_TRUSTED",
    message: "Destination 0x1234567890abcdef1234567890abcdef12345678 is not trusted.",
    idempotencyKey: "same-request",
  };
  const first = recordPolicyRejection(input);
  const second = recordPolicyRejection(input);
  assert.equal(first, second);
  const events = queryActivityEvents({ activityType: "policy-rejection", limit: 100 }).events;
  assert.equal(events.length, 1);
  assert.equal(events[0].statusGroup, "failed");
  assert.equal(events[0].statusCategory, "red");
  assert.equal(events[0].source, "agentic-wallet");
  assert.equal(events[0].summary.includes("0x1234567890abcdef"), false);
  assert.match(events[0].summary, /\[redacted\]/);
});

test("route audit helper ignores non-policy errors", () => {
  const before = queryActivityEvents({ activityType: "policy-rejection", limit: 100 }).pagination.total;
  recordPolicyRejectionFromError(Object.assign(new Error("invalid amount"), { code: "INVALID_AMOUNT" }), {
    source: "binance-pay",
    operation: "prepare",
    fingerprint: policyAuditFingerprint({ amount: "bad" }),
  });
  const after = queryActivityEvents({ activityType: "policy-rejection", limit: 100 }).pagination.total;
  assert.equal(after, before);
});
