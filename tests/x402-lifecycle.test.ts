import assert from "node:assert/strict";
import { mkdtempSync,rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { approveX402,payX402,reviewX402,X402Error } from "../lib/server/x402";
import { createX402Intent,resetX402StoreForTests } from "../lib/server/x402-store";
import { resetPaymentPolicyStoreForTests } from "../lib/server/payment-policy";
import { resetSettingsStoreForTests,updateAgentPaySettings } from "../lib/server/settings-store";

async function withDatabase(run:()=>Promise<void>|void){const dir=mkdtempSync(path.join(os.tmpdir(),"agentpay-x402-life-")),previous=process.env.AGENTPAY_DB_PATH,enabled=process.env.AGENTPAY_ENABLE_X402;process.env.AGENTPAY_DB_PATH=path.join(dir,"db.sqlite");process.env.AGENTPAY_ENABLE_X402="false";resetSettingsStoreForTests();resetPaymentPolicyStoreForTests();resetX402StoreForTests();try{updateAgentPaySettings({displayName:"Mark",profileImageDataUrl:null,displayCurrency:"USD",timeZone:"UTC",spendingLimits:{"binance-pay":{perPaymentUsdLimit:"50",dailyUsdLimit:"100"},x402:{perPaymentUsdLimit:"20",dailyUsdLimit:"20"},"agentic-wallet":{perPaymentUsdLimit:"50",dailyUsdLimit:"100"}},trustedWalletDestinations:[],trustedX402Hosts:[],trustedX402Endpoints:["GET https://api.example.com/resource"]});await run();}finally{resetX402StoreForTests();resetPaymentPolicyStoreForTests();resetSettingsStoreForTests();if(previous===undefined)delete process.env.AGENTPAY_DB_PATH;else process.env.AGENTPAY_DB_PATH=previous;if(enabled===undefined)delete process.env.AGENTPAY_ENABLE_X402;else process.env.AGENTPAY_ENABLE_X402=enabled;rmSync(dir,{recursive:true,force:true});}}

test("persists separate Prepare, Review, and Approve states and selected valuation",()=>withDatabase(async()=>{
 const prepared=createX402Intent({url:"https://api.example.com/resource",preview:{paymentId:"550e8400-e29b-41d4-a716-446655440000",options:[{index:1,status:"READY_TO_SIGN",reasons:[],network:"eip155:8453",amount:"1",amountUsd:"1.00",tokenSymbol:"USDC",payTo:"0x1111111111111111111111111111111111111111"}]}});
 assert.equal(prepared.status,"prepared");const reviewed=reviewX402(prepared.id,1);assert.equal(reviewed.status,"reviewed");assert.equal(reviewed.amountUsd,"1.00");assert.equal(reviewed.selectedOption?.network,"eip155:8453");const approved=approveX402(prepared.id);assert.equal(approved.status,"approved");assert.ok(approved.reviewedAt);assert.ok(approved.approvedAt);await assert.rejects(()=>payX402(prepared.id),(error)=>error instanceof X402Error&&error.code==="X402_EXECUTION_DISABLED");
}));

test("exact endpoint trust does not authorize a different method or path",()=>withDatabase(()=>{
 const post=createX402Intent({url:"https://api.example.com/resource",method:"POST",preview:{paymentId:"550e8400-e29b-41d4-a716-446655440000",options:[{index:1,status:"READY_TO_SIGN",reasons:[],network:"eip155:56",amountUsd:"1"}]}});
 assert.throws(()=>reviewX402(post.id,1),/exact x402 endpoint/i);
 const pathMismatch=createX402Intent({url:"https://api.example.com/other",preview:{paymentId:"550e8400-e29b-41d4-a716-446655440000",options:[{index:1,status:"READY_TO_SIGN",reasons:[],network:"eip155:56",amountUsd:"1"}]}});
 assert.throws(()=>reviewX402(pathMismatch.id,1),/exact x402 endpoint/i);
}));
