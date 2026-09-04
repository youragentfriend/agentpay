import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { listBinancePayReceipts, saveBinancePayOrder } from "../lib/server/binance-pay-store";

process.env.AGENTPAY_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "agentpay-binance-pay-")), "test.sqlite");

test("preserves payee context when a final poll omits it", () => {
  saveBinancePayOrder({
    status: "AWAITING_CONFIRMATION",
    checkout_id: "checkout-1",
    payment_type: "C2C",
    payee: "Display-only payee",
    amount: "0.1",
    currency: "USDT",
  });
  const receipt = saveBinancePayOrder({
    status: "SUCCESS",
    checkout_id: "checkout-1",
    pay_order_id: "order-1",
    amount_sent: "0.1",
    currency: "USDT",
    paid_with: [{ asset: "USDT", amount: "0.1" }],
  });
  assert.equal(receipt.payee, "Display-only payee");
  assert.equal(receipt.status, "SUCCESS");
  assert.equal(listBinancePayReceipts().length, 1);
});
