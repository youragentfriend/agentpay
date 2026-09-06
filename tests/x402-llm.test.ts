import assert from "node:assert/strict";
import test from "node:test";
import { discoverWithAi,x402LlmStatus } from "../lib/server/x402-llm";
import type { X402CatalogResource } from "../lib/x402-types";
const resources:X402CatalogResource[]=[{id:"weather",source:"catalog",resourceUrl:"https://api.example.com/weather",resourceHost:"api.example.com",description:"Weather report",method:"GET",networks:["eip155:56"],paymentOptions:[{network:"eip155:56"}],trusted:false,allowlisted:true},{id:"summary",source:"catalog",resourceUrl:"https://api.example.com/summary",resourceHost:"api.example.com",description:"Summarize text",method:"POST",networks:["eip155:8453"],paymentOptions:[{network:"eip155:8453"}],trusted:false,allowlisted:true}];

test("AI-unconfigured discovery uses deterministic supported-service search without a provider request",async()=>{const provider=process.env.AGENTPAY_LLM_PROVIDER,key=process.env.AGENTPAY_LLM_API_KEY;delete process.env.AGENTPAY_LLM_PROVIDER;delete process.env.AGENTPAY_LLM_API_KEY;try{assert.equal(x402LlmStatus().configured,false);const result=await discoverWithAi("get weather",resources);assert.equal(result.configured,false);assert.deepEqual(result.candidateIds,["weather"]);assert.match(result.message,/found 1 supported x402 service/i);}finally{if(provider!==undefined)process.env.AGENTPAY_LLM_PROVIDER=provider;if(key!==undefined)process.env.AGENTPAY_LLM_API_KEY=key;}});

test("AI ranking accepts only IDs from validated candidates",async()=>{const result=await discoverWithAi("summarize this",resources,async()=>["invented","summary","summary","weather"]);assert.deepEqual(result.candidateIds,["summary","weather"]);assert.deepEqual(result.candidates.map(item=>item.id),["summary","weather"]);});
