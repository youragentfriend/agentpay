import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { BalanceSnapshot, BalanceSnapshotCapture, BalanceSnapshotSource, SnapshotBalance } from "@/lib/balance-snapshot-types";
import type { WalletOverview } from "@/lib/wallet-types";
import type { BinancePortfolio } from "@/lib/binance-portfolio-types";
import { getWalletOverview } from "@/lib/server/agentic-wallet";
import { loadBinancePortfolio } from "@/lib/server/binance-readonly";

interface Row { id:string; capture_id:string; source:BalanceSnapshotSource; status:"captured"|"unavailable"; total_usd:string|null; asset_count:number; balances_json:string; message:string|null; captured_at:string }
let database: DatabaseSync | undefined;
let databaseFile = "";

function db(): DatabaseSync {
  const filename = process.env.AGENTPAY_DB_PATH || path.join(process.cwd(), "data", "agentpay.sqlite");
  if (database && databaseFile === filename) return database;
  database?.close();
  mkdirSync(path.dirname(filename), { recursive: true });
  database = new DatabaseSync(filename);
  databaseFile = filename;
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS balance_snapshots (
      id TEXT PRIMARY KEY,
      capture_id TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      total_usd TEXT,
      asset_count INTEGER NOT NULL,
      balances_json TEXT NOT NULL,
      message TEXT,
      captured_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS balance_snapshots_captured_at ON balance_snapshots(captured_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS balance_snapshots_capture_id ON balance_snapshots(capture_id);
  `);
  return database;
}

function map(row: Row): BalanceSnapshot {
  return { id:row.id, captureId:row.capture_id, source:row.source, status:row.status, totalUsd:row.total_usd === null ? null : Number(row.total_usd), assetCount:row.asset_count, balances:JSON.parse(row.balances_json) as SnapshotBalance[], message:row.message ?? undefined, capturedAt:row.captured_at };
}

function save(input: Omit<BalanceSnapshot, "id">): BalanceSnapshot {
  const id = randomUUID();
  db().prepare("INSERT INTO balance_snapshots (id,capture_id,source,status,total_usd,asset_count,balances_json,message,captured_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(id,input.captureId,input.source,input.status,input.totalUsd === null ? null : String(input.totalUsd),input.assetCount,JSON.stringify(input.balances),input.message ?? null,input.capturedAt);
  return map(db().prepare("SELECT * FROM balance_snapshots WHERE id=?").get(id) as unknown as Row);
}

function walletSnapshot(captureId:string, capturedAt:string, overview:WalletOverview): BalanceSnapshot {
  if (overview.status !== "CONNECTED") return save({captureId,source:"agentic-wallet",status:"unavailable",totalUsd:null,assetCount:0,balances:[],message:"Agentic Wallet is not connected.",capturedAt});
  const balances = overview.balances.map(item => ({asset:item.symbol,total:item.balance,usdValue:Number.isFinite(Number(item.value)) ? Number(item.value) : null}));
  return save({captureId,source:"agentic-wallet",status:"captured",totalUsd:balances.reduce((sum,item)=>sum+(item.usdValue ?? 0),0),assetCount:balances.length,balances,capturedAt});
}

function binanceSnapshot(captureId:string, capturedAt:string, portfolio:BinancePortfolio): BalanceSnapshot {
  if (!portfolio.configured || portfolio.connection === "error" || portfolio.connection === "not_configured") return save({captureId,source:"binance-account",status:"unavailable",totalUsd:null,assetCount:0,balances:[],message:portfolio.configured ? "Binance Account balances are unavailable." : "Binance Account is not configured.",capturedAt});
  const balances = portfolio.balances.map(item => ({asset:item.asset,total:item.total,usdValue:item.usdValue}));
  return save({captureId,source:"binance-account",status:"captured",totalUsd:portfolio.estimatedTotalUsd,assetCount:balances.length,balances,capturedAt,message:portfolio.connection === "partial" ? "Some Binance Account sources were unavailable." : undefined});
}

export async function captureBalanceSnapshots(loaders: { wallet?:()=>Promise<WalletOverview>; binance?:()=>Promise<BinancePortfolio> } = {}): Promise<BalanceSnapshotCapture> {
  const captureId=randomUUID(), capturedAt=new Date().toISOString();
  const results=await Promise.allSettled([(loaders.wallet ?? getWalletOverview)(),(loaders.binance ?? loadBinancePortfolio)()]);
  const snapshots:BalanceSnapshot[]=[];
  snapshots.push(results[0].status === "fulfilled" ? walletSnapshot(captureId,capturedAt,results[0].value) : save({captureId,source:"agentic-wallet",status:"unavailable",totalUsd:null,assetCount:0,balances:[],message:"Agentic Wallet balances are unavailable.",capturedAt}));
  snapshots.push(results[1].status === "fulfilled" ? binanceSnapshot(captureId,capturedAt,results[1].value) : save({captureId,source:"binance-account",status:"unavailable",totalUsd:null,assetCount:0,balances:[],message:"Binance Account balances are unavailable.",capturedAt}));
  return {captureId,snapshots};
}

export function listBalanceSnapshots(limit=8): BalanceSnapshot[] {
  const safeLimit=Number.isInteger(limit)?Math.min(Math.max(limit,1),50):8;
  return (db().prepare("SELECT * FROM balance_snapshots ORDER BY captured_at DESC,id DESC LIMIT ?").all(safeLimit) as unknown as Row[]).map(map);
}

export function resetBalanceSnapshotStoreForTests():void { database?.close(); database=undefined; databaseFile=""; }
