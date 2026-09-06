import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { X402CatalogResource, X402RequestMethod } from "@/lib/x402-types";
import { isTrustedX402Endpoint } from "@/lib/server/payment-policy";

const DEFAULT_SOURCES = ["https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?type=http&limit=100&offset=0"];
export const SUPPORTED_X402_NETWORKS = ["eip155:56", "eip155:8453"] as const;
export function isSupportedX402Network(value: unknown): value is string {
  return typeof value === "string" && (SUPPORTED_X402_NETWORKS.includes(value as typeof SUPPORTED_X402_NETWORKS[number]) || value.startsWith("solana:"));
}
function configuredSources(): string[] { const values=(process.env.AGENTPAY_X402_BAZAAR_URLS||"").split(",").map(v=>v.trim()).filter(Boolean); return values.length?values:DEFAULT_SOURCES; }
function allowedHosts():string[]{return (process.env.AGENTPAY_X402_ALLOWED_HOSTS||"").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);}
function validateSource(raw:string):URL{const url=new URL(raw),host=url.hostname.toLowerCase();if(url.protocol!=="https:"||url.username||url.password||url.port||host==="localhost"||host.endsWith(".local")||isIP(host))throw new Error("Catalog sources must be public HTTPS URLs.");return url;}
function rows(value:unknown):Record<string,unknown>[] {if(Array.isArray(value))return value.filter(v=>v&&typeof v==="object") as Record<string,unknown>[];if(!value||typeof value!=="object")return[];const record=value as Record<string,unknown>;for(const key of ["items","resources","data"])if(Array.isArray(record[key]))return rows(record[key]);return[];}
function methodValue(value:unknown):X402RequestMethod|undefined {const method=typeof value==="string"?value.toUpperCase():"GET";return method==="GET"||method==="POST"?method:undefined;}
function categoryValue(description:string,url:string):string { const value=`${description} ${url}`.toLowerCase(); if(/market|price|stock|crypto|token|trading|finance|exchange|quote/.test(value)) return "Market data"; if(/weather|forecast|temperature|climate/.test(value)) return "Weather"; if(/research|search|article|news|summar|document/.test(value)) return "Research"; if(/image|audio|video|media|transcri/.test(value)) return "Media"; return "Other"; }

export function normalizeBazaarResource(row:Record<string,unknown>,source:string,hosts=allowedHosts()):X402CatalogResource|undefined{
 if(row.x402Version!==2)return;
 const resource=row.resource&&typeof row.resource==="object"?row.resource as Record<string,unknown>:row;
 const resourceUrl=[typeof row.resource==="string"?row.resource:undefined,resource.url,row.resourceUrl,row.url].find(v=>typeof v==="string") as string|undefined;if(!resourceUrl)return;
 let url:URL;try{url=new URL(resourceUrl);}catch{return;}if(url.protocol!=="https:"||url.username||url.password||url.port||isIP(url.hostname)||url.hostname.endsWith(".local"))return;
 const requirements=row.paymentRequirements&&typeof row.paymentRequirements==="object"?row.paymentRequirements as Record<string,unknown>:row;
 const extensions=row.extensions&&typeof row.extensions==="object"?row.extensions as Record<string,unknown>:{};
 const bazaar=extensions.bazaar&&typeof extensions.bazaar==="object"?extensions.bazaar as Record<string,unknown>:{};
 const info=bazaar.info&&typeof bazaar.info==="object"?bazaar.info as Record<string,unknown>:{};
 const input=info.input&&typeof info.input==="object"?info.input as Record<string,unknown>:{};
 const accepts=Array.isArray(requirements.accepts)?requirements.accepts.filter(v=>v&&typeof v==="object") as Record<string,unknown>[]:[];
 const supported=accepts.filter(item=>isSupportedX402Network(item.network)).map(item=>({scheme:typeof item.scheme==="string"?item.scheme:undefined,network:String(item.network),asset:typeof item.asset==="string"?item.asset:undefined,amount:typeof item.amount==="string"?item.amount:undefined,payTo:typeof item.payTo==="string"?item.payTo:undefined}));if(!supported.length)return;
 const method=methodValue(input.method??resource.method);if(!method)return;
 const description=(typeof resource.description==="string"?resource.description:"Published x402 service").slice(0,240);
 return {id:createHash("sha256").update(`${source}\n${method}\n${url.toString()}`).digest("hex").slice(0,20),source,resourceUrl:url.toString(),resourceHost:url.hostname.toLowerCase(),description,category:categoryValue(description,url.toString()),method,requestBody:input.body,networks:[...new Set(supported.map(v=>v.network))],paymentOptions:supported,allowlisted:hosts.includes(url.hostname.toLowerCase()),trusted:isTrustedX402Endpoint(url.toString(),method)};
}
export function x402BazaarCapability(){return {sources:configuredSources()};}
export async function listX402CatalogResources():Promise<{resources:X402CatalogResource[];failures:string[]}>{const sources=configuredSources(),resources:X402CatalogResource[]=[],failures:string[]=[];await Promise.all(sources.map(async raw=>{try{const url=validateSource(raw),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15_000);try{const response=await fetch(url,{headers:{Accept:"application/json"},redirect:"error",signal:controller.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);const length=Number(response.headers.get("content-length")||0);if(length>2_000_000)throw new Error("response too large");const data=JSON.parse((await response.text()).slice(0,2_000_000));for(const row of rows(data)){const item=normalizeBazaarResource(row,url.hostname);if(item)resources.push(item);}}finally{clearTimeout(timer);}}catch(error){failures.push(`${raw}: ${error instanceof Error?error.message:"failed"}`);}}));const unique=[...new Map(resources.map(item=>[item.id,item])).values()];return {resources:unique.sort((a,b)=>Number(b.trusted)-Number(a.trusted)||a.description.localeCompare(b.description)),failures};}
