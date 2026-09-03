import assert from "node:assert/strict";
import test from "node:test";
import type { WalletOverview } from "../lib/wallet-types";
import {
  approveTransfer,
  compareDecimalStrings,
  parseTransferInstruction,
  PaymentIntentError,
  prepareTransfer,
} from "../lib/server/payment-intents";

const recipient = "0x1111111111111111111111111111111111111111";
const tokenAddress = "0x55d398326f99059fF775485246999027B3197955";
const wallet: WalletOverview = {
  status: "CONNECTED",
  addresses: [],
  chains: [{ binanceChainId: "56", name: "BNB Smart Chain", simpleName: "BSC" }],
  balances: [{ symbol: "USDT", address: tokenAddress, binanceChainId: "56", balance: "12.50", price: "1", value: "12.50" }],
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
  const prepared = prepareTransfer({ amount: "5", recipient, tokenAddress, binanceChainId: "56", gasLevel: "MEDIUM" }, wallet);
  assert.equal(prepared.status, "awaiting-approval");
  assert.equal(prepared.asset, "USDT");
  assert.equal(approveTransfer(prepared.id).status, "approved");
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
