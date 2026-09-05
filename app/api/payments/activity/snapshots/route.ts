import { captureBalanceSnapshots, listBalanceSnapshots } from "@/lib/server/balance-snapshot-store";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

export async function GET(){return Response.json({snapshots:listBalanceSnapshots(8)},{headers:{"Cache-Control":"no-store"}})}
export async function POST(){
  try{return Response.json(await captureBalanceSnapshots(),{status:201,headers:{"Cache-Control":"no-store"}})}
  catch{return Response.json({error:"Unable to capture balance snapshots."},{status:500,headers:{"Cache-Control":"no-store"}})}
}
