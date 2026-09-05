import assert from "node:assert/strict";
import test from "node:test";
import {
  addDecimalStrings,
  amountValidationError,
  isValidRecipientForChain,
  recipientValidationError,
  transferAmountValidationError,
} from "../lib/payment-validation";

const evmAddress = "0x1111111111111111111111111111111111111111";
const solanaAddress = "11111111111111111111111111111111";

test("validates positive decimal transfer amounts", () => {
  assert.equal(amountValidationError("1.25"), "");
  assert.equal(amountValidationError(""), "Enter an amount.");
  assert.match(amountValidationError("hello"), /positive number/i);
  assert.match(amountValidationError("1e2"), /positive number/i);
  assert.match(amountValidationError("0"), /positive number/i);
  assert.match(amountValidationError("1.1234567890123456789"), /18 decimal places/i);
});

test("validates balance and current Agentic Wallet spending limits while typing", () => {
  assert.equal(addDecimalStrings("1.1", "0.3"), "1.4");
  assert.match(transferAmountValidationError("1.5", { asset: "USDC", availableBalance: "1.4" }), /balance of 1.4/i);
  assert.match(transferAmountValidationError("1.3", { asset: "USDC", availableBalance: "1.4", priceUsd: "1", perPaymentUsdLimit: "1" }), /per-transaction limit/i);
  assert.match(transferAmountValidationError("0.7", { asset: "USDC", availableBalance: "1.4", priceUsd: "1", dailyUsdLimit: "5", dailySpendUsd: "4.5" }), /daily limit/i);
  assert.equal(transferAmountValidationError("0.5", { asset: "USDC", availableBalance: "1.4", priceUsd: "1", perPaymentUsdLimit: "1", dailyUsdLimit: "5", dailySpendUsd: "4" }), "");
});

test("validates recipient format against the selected network", () => {
  assert.equal(isValidRecipientForChain(evmAddress, "56"), true);
  assert.equal(isValidRecipientForChain(solanaAddress, "CT_501"), true);
  assert.equal(isValidRecipientForChain(solanaAddress, "56"), false);
  assert.equal(isValidRecipientForChain(evmAddress, "CT_501"), false);
  assert.match(recipientValidationError(solanaAddress, "56"), /EVM address/i);
  assert.match(recipientValidationError(evmAddress, "CT_501"), /Solana address/i);
});
