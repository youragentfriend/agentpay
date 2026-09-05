import { createHash } from "node:crypto";
import { recordPolicyRejection } from "@/lib/server/activity-store";

export function policyAuditFingerprint(value: unknown): string {
  let serialized="";
  try{serialized=JSON.stringify(value) ?? "";}catch{serialized="unserializable";}
  return createHash("sha256").update(serialized).digest("hex");
}

export function recordPolicyRejectionFromError(error: unknown, context: { source:"agentic-wallet"|"binance-pay"|"x402"; operation:string; fingerprint:string }): void {
  const candidate=error as {code?:unknown;message?:unknown};
  if(typeof candidate.code!=="string" || !candidate.code.startsWith("POLICY_")) return;
  try {
    recordPolicyRejection({source:context.source,operation:context.operation,code:candidate.code,message:typeof candidate.message==="string"?candidate.message:"Payment rejected by policy.",idempotencyKey:context.fingerprint});
  } catch { /* audit persistence must never replace the original policy response */ }
}
