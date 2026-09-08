import assert from "node:assert/strict";
import test from "node:test";
import { addBinancePayInputHint, BinancePayError, getBinancePayReceiveCurrencies, getCompatibleBinancePayLink, validateBinancePayInput } from "../lib/server/binance-pay";

test("exposes server-controlled receive currency choices", () => {
  const result = getBinancePayReceiveCurrencies();
  assert.equal(result.currencies.length, 20);
  assert.deepEqual(result.currencies.slice(0, 5), ["USDT", "USDC", "DAI", "FDUSD", "USD1"]);
  assert.ok(result.currencies.includes("USDT"));
  assert.ok(result.currencies.includes("USDC"));
  assert.ok(result.currencies.includes("BTC"));
  assert.ok(result.currencies.includes("BNB"));
  assert.ok(result.currencies.includes("POL"));
});

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

test("explains that plain text and numbers are not payment inputs", () => {
  assert.throws(
    () => validateBinancePayInput("123456789"),
    (error) => error instanceof BinancePayError && /plain text and numbers are not supported/i.test(error.message),
  );
});

test("adds a specific hint for a rejected Request-to-Pay share link", () => {
  const result = addBinancePayInputHint(
    "https://app.binance.com/uni-qr/request-to-pay?billOrderId=redacted&billType=PAY_REQUEST",
    { status: "INVALID_QR_FORMAT", message: "Invalid QR code format" },
  );
  assert.match(result.hint ?? "", /standard Binance Pay receive QR image/i);
});

test("extracts only direct compatible Binance payment links", () => {
  assert.equal(getCompatibleBinancePayLink("https://app.binance.com/uni-qr/directToken"), "https://app.binance.com/uni-qr/directToken");
  assert.equal(getCompatibleBinancePayLink("https://app.binance.com/qr/directToken"), "https://app.binance.com/qr/directToken");
  assert.equal(getCompatibleBinancePayLink("https://app.binance.com/uni-qr/request-to-pay?billOrderId=x"), undefined);
  assert.equal(getCompatibleBinancePayLink("000201br.gov.bcb.pix"), undefined);
});
