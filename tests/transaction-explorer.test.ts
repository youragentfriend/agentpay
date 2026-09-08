import assert from "node:assert/strict";
import test from "node:test";
import { transactionExplorer } from "../lib/transaction-explorer";

const evmHash = `0x${"ab".repeat(32)}`;
const solanaHash = "5".repeat(88);

test("builds allowlisted explorer links for supported Agentic Wallet chains", () => {
  assert.equal(transactionExplorer("56", evmHash)?.url, `https://bscscan.com/tx/${evmHash}`);
  assert.equal(transactionExplorer("8453", evmHash)?.url, `https://basescan.org/tx/${evmHash}`);
  assert.equal(transactionExplorer("1", evmHash)?.url, `https://etherscan.io/tx/${evmHash}`);
  assert.equal(transactionExplorer("137", evmHash)?.url, `https://polygonscan.com/tx/${evmHash}`);
  assert.equal(transactionExplorer("42161", evmHash)?.url, `https://arbiscan.io/tx/${evmHash}`);
  assert.equal(transactionExplorer("CT_501", solanaHash)?.url, `https://solscan.io/tx/${solanaHash}`);
});

test("does not create links for unknown chains or malformed transaction hashes", () => {
  assert.equal(transactionExplorer("4663", evmHash), undefined);
  assert.equal(transactionExplorer("56", "not-a-transaction-hash"), undefined);
  assert.equal(transactionExplorer("CT_501", "0x1234"), undefined);
});
