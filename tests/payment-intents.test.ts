import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { WalletOverview } from "../lib/wallet-types";
import {
  compareDecimalStrings,
  parseTransferInstruction,
  PaymentIntentError,
  prepareTransfer,
} from "../lib/server/payment-intents";
import { approvePaymentIntent, createPaymentIntent } from "../lib/server/payment-store";

process.env.AGENTPAY_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "agentpay-test-")), "test.sqlite");

const recipient = "0x1111111111111111111111111111111111111111";
const tokenAddress = "0x55d398326f99059fF775485246999027B3197955";
const wallet: WalletOverview = {
  status: "CONNECTED",
  addresses: [],
  chains: [{ binanceChainId: "56", name: "BNB Smart Chain", simpleName: "BSC" }],
  balances: [
    { symbol: "USDT", address: tokenAddress, binanceChainId: "56", balance: "12.50", price: "1", value: "12.50" },
    { symbol: "BNB", address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", binanceChainId: "56", balance: "0.01", price: "500", value: "5" },
  ],
  transactions: [],
};

test("parses a supported natural-language transfer", () => {
  assert.deepEqual(parseTransferInstruction(`Send 5 USDT to ${recipient} on BNB Smart Chain`), {
    amount: "5", asset: "USDT", recipient, chain: "BNB Smart Chain",
  });
});

test("compares decimal strings without floating-point arithmetic", () => {
  assert.equal(compareDecimalStrings("12.500", "12.5"), 0);
  assert.equal(compareDecimalStrings("0.000000000000000001", "0"), 1);
  assert.equal(compareDecimalStrings("9.99", "10"), -1);
});

test("prepares and explicitly approves an exact transfer intent", () => {
  const prepared = createPaymentIntent(prepareTransfer({ amount: "5", recipient, tokenAddress, binanceChainId: "56", gasLevel: "MEDIUM" }, wallet));
  assert.equal(prepared.status, "awaiting-approval");
  assert.equal(prepared.asset, "USDT");
  assert.equal(approvePaymentIntent(prepared.id).status, "approved");
});

test("rejects an amount above the live wallet balance", () => {
  assert.throws(
    () => prepareTransfer({ amount: "12.500000000000000001", recipient, tokenAddress, binanceChainId: "56" }, wallet),
    (error) => error instanceof PaymentIntentError && error.code === "INSUFFICIENT_BALANCE",
  );
});

test("rejects a recipient with the wrong chain format", () => {
  assert.throws(
    () => prepareTransfer({ amount: "1", recipient: "not-an-address", tokenAddress, binanceChainId: "56" }, wallet),
    (error) => error instanceof PaymentIntentError && error.code === "INVALID_RECIPIENT",
  );
});

test("rejects an unknown gas priority from an API caller", () => {
  assert.throws(
    () => prepareTransfer({ amount: "1", recipient, tokenAddress, binanceChainId: "56", gasLevel: "FAST" as never }, wallet),
    (error) => error instanceof PaymentIntentError && error.code === "INVALID_GAS_LEVEL",
  );
});

test("requires a visible native BNB balance for BSC token gas", () => {
  assert.throws(
    () => prepareTransfer({ amount: "1", recipient, tokenAddress, binanceChainId: "56" }, { ...wallet, balances: wallet.balances.filter((item) => item.symbol !== "BNB") }),
    (error) => error instanceof PaymentIntentError && error.code === "NATIVE_GAS_REQUIRED",
  );
});
