import assert from "node:assert/strict";
import test from "node:test";
import { resolveAssistantWalletSelection } from "../lib/server/wallet-transfer-service";
import type { WalletOverview } from "../lib/wallet-types";

const wallet: WalletOverview = {
  status: "CONNECTED",
  addresses: [],
  chains: [
    { binanceChainId: "56", name: "BNB Smart Chain", simpleName: "BSC" },
    { binanceChainId: "8453", name: "Base", simpleName: "Base" },
  ],
  balances: [
    { symbol: "USDT", address: "0x1111111111111111111111111111111111111111", binanceChainId: "56", balance: "5", price: "1", value: "5" },
    { symbol: "USDC", address: "0x2222222222222222222222222222222222222222", binanceChainId: "8453", balance: "2", price: "1", value: "2" },
  ],
  transactions: [],
};

test("maps natural BNB network replies to the live BSC wallet balance", () => {
  for (const network of ["bnb", "BSC", "BNB network", "BNB Smart Chain", "56"]) {
    const selected = resolveAssistantWalletSelection(wallet, "usdt", network);
    assert.equal(selected.chain.binanceChainId, "56");
    assert.equal(selected.balance.symbol, "USDT");
  }
});

test("rejects unsupported networks and assets unavailable on the selected chain", () => {
  assert.throws(() => resolveAssistantWalletSelection(wallet, "USDT", "Ethereum"), /could not match/i);
  assert.throws(() => resolveAssistantWalletSelection(wallet, "USDT", "Base"), /not available on Base/i);
});
