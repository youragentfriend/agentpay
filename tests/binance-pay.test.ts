import assert from "node:assert/strict";
import test from "node:test";
import { BinancePayError, validateBinancePayInput } from "../lib/server/binance-pay";

test("accepts documented Binance payment-link formats", () => {
  assert.equal(validateBinancePayInput("https://app.binance.com/uni-qr/example"), "https://app.binance.com/uni-qr/example");
  assert.equal(validateBinancePayInput("https://app.binance.com/qr/example"), "https://app.binance.com/qr/example");
});

test("accepts a PIX EMV payload", () => {
  const payload = "000201010212br.gov.bcb.pix.example";
  assert.equal(validateBinancePayInput(payload), payload);
});

test("rejects lookalike hosts and insecure links", () => {
  for (const value of ["https://app.binance.com.evil.example/qr/x", "http://app.binance.com/qr/x", "https://binance.com/qr/x"]) {
    assert.throws(
      () => validateBinancePayInput(value),
      (error) => error instanceof BinancePayError && error.code === "UNSUPPORTED_QR_FORMAT",
    );
  }
});
