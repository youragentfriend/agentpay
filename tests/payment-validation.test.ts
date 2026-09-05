import assert from "node:assert/strict";
import test from "node:test";
import {
  amountValidationError,
  isValidRecipientForChain,
  recipientValidationError,
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

test("validates recipient format against the selected network", () => {
  assert.equal(isValidRecipientForChain(evmAddress, "56"), true);
  assert.equal(isValidRecipientForChain(solanaAddress, "CT_501"), true);
  assert.equal(isValidRecipientForChain(solanaAddress, "56"), false);
  assert.equal(isValidRecipientForChain(evmAddress, "CT_501"), false);
  assert.match(recipientValidationError(solanaAddress, "56"), /EVM address/i);
  assert.match(recipientValidationError(evmAddress, "CT_501"), /Solana address/i);
});
