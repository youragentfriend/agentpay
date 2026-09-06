import assert from "node:assert/strict";
import { mkdtempSync,rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { normalizeBazaarResource } from "../lib/server/x402-bazaar";
import { resetSettingsStoreForTests,updateAgentPaySettings } from "../lib/server/settings-store";

function withSettings(run:()=>void){const dir=mkdtempSync(path.join(os.tmpdir(),"agentpay-catalog-")),previous=process.env.AGENTPAY_DB_PATH;process.env.AGENTPAY_DB_PATH=path.join(dir,"db.sqlite");resetSettingsStoreForTests();try{updateAgentPaySettings({displayName:"Mark",profileImageDataUrl:null,displayCurrency:"USD",timeZone:"UTC",spendingLimits:{"binance-pay":{perPaymentUsdLimit:"50",dailyUsdLimit:"100"},x402:{perPaymentUsdLimit:"20",dailyUsdLimit:"20"},"agentic-wallet":{perPaymentUsdLimit:"50",dailyUsdLimit:"100"}},trustedWalletDestinations:[],trustedX402Hosts:[],trustedX402Endpoints:["POST https://merchant.example/api"]});run();}finally{resetSettingsStoreForTests();if(previous===undefined)delete process.env.AGENTPAY_DB_PATH;else process.env.AGENTPAY_DB_PATH=previous;rmSync(dir,{recursive:true,force:true});}}

test("normalizes BSC, Base, and Solana x402 v2 catalog resources",()=>withSettings(()=>{
 const item=normalizeBazaarResource({x402Version:2,resource:"https://merchant.example/api",description:"Multi-network data",extensions:{bazaar:{info:{input:{method:"POST",body:{topic:"payments"}}}}},accepts:[{scheme:"exact",network:"eip155:56",asset:"0xbsc"},{scheme:"exact",network:"eip155:8453",asset:"0xbase"},{scheme:"exact",network:"solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",asset:"spl"},{network:"eip155:1"}]},"api.cdp.coinbase.com",["merchant.example"]);
 assert.equal(item?.resourceHost,"merchant.example");assert.equal(item?.paymentOptions.length,3);assert.deepEqual(item?.networks,["eip155:56","eip155:8453","solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"]);assert.equal(item?.allowlisted,true);assert.equal(item?.trusted,true);assert.equal(item?.method,"POST");assert.deepEqual(item?.requestBody,{topic:"payments"});
}));

test("rejects v1 and unsupported-network-only resources",()=>withSettings(()=>{
 assert.equal(normalizeBazaarResource({x402Version:1,resource:"https://merchant.example/api",accepts:[{network:"eip155:56"}]},"source",[]),undefined);
 assert.equal(normalizeBazaarResource({x402Version:2,resource:"https://merchant.example/api",accepts:[{network:"eip155:1"}]},"source",[]),undefined);
}));
