import assert from "node:assert/strict";
import test from "node:test";
import {
  AgenticWalletError,
  isValidQrCodeId,
  normalizeWalletTransactionStatus,
  parseCliEnvelope,
} from "../lib/server/agentic-wallet";

test("parseCliEnvelope returns successful data", () => {
  assert.deepEqual(parseCliEnvelope('{"success":true,"data":{"status":"CONNECTED"}}'), {
    status: "CONNECTED",
  });
});

test("parseCliEnvelope preserves a documented CLI error", () => {
  assert.throws(
    () => parseCliEnvelope('{"success":false,"error":{"name":"AUTH_REJECTED","message":"Expired"}}'),
    (error) => error instanceof AgenticWalletError && error.code === "AUTH_REJECTED" && error.message === "Expired",
  );
});

test("parseCliEnvelope rejects non-JSON command output", () => {
  assert.throws(() => parseCliEnvelope("internal command failure"), SyntaxError);
});

test("QR code IDs must be UUIDs", () => {
  assert.equal(isValidQrCodeId("a191884d-0e05-435b-a887-336bc242fafc"), true);
  assert.equal(isValidQrCodeId("../../shell-command"), false);
  assert.equal(isValidQrCodeId(""), false);
});

test("normalizes Binance transaction statuses", () => {
  assert.equal(normalizeWalletTransactionStatus("SUCCESS"), "confirmed");
  assert.equal(normalizeWalletTransactionStatus("confirmed"), "confirmed");
  assert.equal(normalizeWalletTransactionStatus("PENDING"), "pending");
  assert.equal(normalizeWalletTransactionStatus("FAILED"), "failed");
  assert.equal(normalizeWalletTransactionStatus("UNKNOWN"), undefined);
});
