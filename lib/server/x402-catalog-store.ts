import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isIP } from "node:net";
import { isSupportedX402Network } from "@/lib/server/x402-networks";
import type { X402CatalogService, X402CatalogServiceInput, X402RequestMethod } from "@/lib/x402-types";

const SOURCE = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources";
const NANSEN_DOCS = "https://docs.nansen.ai/api/smart-money/netflows";
const NANSEN_X402_LISTING = "https://x402.new/services/api-nansen-ai-api-v1-smart-money-netflow";
const CATEGORIES = ["Market data", "Onchain data", "News", "Research", "Weather"] as const;
const SEEDS: X402CatalogServiceInput[] = [
  { title: "Bitcoin market price", description: "Live BTC/USD spot price, daily range, and volume sourced from Coinbase Exchange.", category: "Market data", endpoint: "https://vibesprings.net/api/price/btc-usd", method: "GET", networks: ["eip155:8453"], sourceUrls: [SOURCE], origin: "curated" },
  { title: "Crypto price history", description: "Current or historical crypto prices by ticker, CoinGecko id, or chain address.", category: "Market data", endpoint: "https://crypto.apitoll.cloud/v1/crypto/price", method: "GET", networks: ["eip155:8453", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"], sourceUrls: [SOURCE], origin: "curated" },
  { title: "Crypto news brief", description: "Importance-ranked crypto headlines, source links, publish times, and market sentiment.", category: "News", endpoint: "https://x402.ottoai.services/crypto-news", method: "GET", networks: ["eip155:8453", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"], sourceUrls: [SOURCE], origin: "curated" },
  { title: "Global weather", description: "Current conditions and a five-day forecast for a city or coordinates.", category: "Weather", endpoint: "https://x402.ottoai.services/weather", method: "GET", networks: ["eip155:8453", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"], sourceUrls: [SOURCE], origin: "curated" },
  { title: "Ethereum network status", description: "Chain ID, latest block, gas price, chain-head age, and network characteristics.", category: "Onchain data", endpoint: "https://api.onesource.io/api/chain/network-info", method: "GET", networks: ["eip155:8453"], sourceUrls: [SOURCE], origin: "curated" },
  { title: "Neural web search", description: "Search the live web with Exa and return structured research results.", category: "Research", endpoint: "https://stableenrich.dev/api/exa/search", method: "POST", networks: ["eip155:8453", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"], sourceUrls: [SOURCE], origin: "curated" },
  { title: "Nansen Smart Money Netflow", description: "Pay per call for Nansen smart-money netflow data, with a BNB Chain request ready for AgentPay.", category: "Onchain data", endpoint: "https://api.nansen.ai/api/v1/smart-money/netflow", method: "POST", requestBody: { chains: ["bnb"], filters: {}, order_by: [{ field: "net_flow_24h_usd", direction: "DESC" }] }, networks: ["eip155:56", "eip155:8453"], sourceUrls: [NANSEN_DOCS, NANSEN_X402_LISTING], origin: "curated" },
];

type Row = Record<string, unknown>;
let database: DatabaseSync | undefined;
let databaseFile = "";
function db() {
  const file = process.env.AGENTPAY_DB_PATH || path.join(process.cwd(), "data", "agentpay.sqlite");
  if (database && databaseFile === file) return database;
  database?.close(); mkdirSync(path.dirname(file), { recursive: true });
  database = new DatabaseSync(file); databaseFile = file;
  database.exec(`CREATE TABLE IF NOT EXISTS x402_catalog_services (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL,
    endpoint TEXT NOT NULL, method TEXT NOT NULL, canonical_key TEXT NOT NULL UNIQUE,
    request_body_json TEXT, networks_json TEXT NOT NULL, source_urls_json TEXT NOT NULL, origin TEXT NOT NULL,
    verification_status TEXT NOT NULL, verified_at TEXT, created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL, removed_at TEXT
  )`);
  const columns = database.prepare("PRAGMA table_info(x402_catalog_services)").all() as unknown as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "request_body_json")) database.exec("ALTER TABLE x402_catalog_services ADD COLUMN request_body_json TEXT");
  seed(database);
  return database;
}

function normalizeX402CatalogEndpoint(rawEndpoint: string) {
  let url: URL;
  try { url = new URL(rawEndpoint.trim()); } catch { throw new Error("Catalog endpoints must be valid public HTTPS URLs."); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || host === "localhost" || host.endsWith(".local") || isIP(host) !== 0) throw new Error("Catalog endpoints must be public HTTPS URLs without credentials, IP literals, or custom ports.");
  url.hash = "";
  if (url.port === "443") url.port = "";
  url.hostname = host;
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}
export function canonicalX402ServiceKey(method: X402RequestMethod, rawEndpoint: string) {
  return `${method}:${normalizeX402CatalogEndpoint(rawEndpoint)}`;
}
function validate(input: X402CatalogServiceInput) {
  const method: X402RequestMethod | undefined = input.method === "POST" ? "POST" : input.method === "GET" ? "GET" : undefined;
  if (!method) throw new Error("Catalog service method must be GET or POST.");
  const title = input.title.trim().slice(0, 120), description = input.description.trim().slice(0, 500);
  if (!title || !description) throw new Error("Catalog services require a title and description.");
  const category = input.category.trim();
  if (!(CATEGORIES as readonly string[]).includes(category)) throw new Error("Catalog service category is not supported.");
  const endpoint = normalizeX402CatalogEndpoint(input.endpoint);
  const networks = [...new Set(input.networks.filter(isSupportedX402Network))];
  if (!networks.length) throw new Error("Catalog services must support BSC, Base, or Solana.");
  const sourceUrls = [...new Set(input.sourceUrls.map(value => value.trim()).filter(value => { try { return new URL(value).protocol === "https:"; } catch { return false; } }))].slice(0, 6);
  if (!sourceUrls.length) throw new Error("Catalog services require a reliable HTTPS source.");
  let requestBodyJson: string | null = null;
  if (input.requestBody !== undefined) {
    if (!input.requestBody || typeof input.requestBody !== "object" || Array.isArray(input.requestBody)) throw new Error("Catalog request bodies must be JSON objects.");
    requestBodyJson = JSON.stringify(input.requestBody);
    if (requestBodyJson.length > 12_000) throw new Error("Catalog request bodies are too large.");
  }
  return { title, description, category, endpoint, method, requestBodyJson, networks, sourceUrls, origin: input.origin === "ai-discovered" ? "ai-discovered" as const : "curated" as const };
}
function seed(target: DatabaseSync) {
  const insert = target.prepare("INSERT OR IGNORE INTO x402_catalog_services (id,title,description,category,endpoint,method,canonical_key,request_body_json,networks_json,source_urls_json,origin,verification_status,verified_at,created_at,updated_at,removed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const now = new Date().toISOString();
  for (const raw of SEEDS) {
    const item = validate(raw), key = canonicalX402ServiceKey(item.method, item.endpoint);
    insert.run(randomUUID(), item.title, item.description, item.category, item.endpoint, item.method, key, item.requestBodyJson, JSON.stringify(item.networks), JSON.stringify(item.sourceUrls), item.origin, "verified", now, now, now, null);
  }
}
function map(row: Row): X402CatalogService {
  const requestBody = row.request_body_json ? JSON.parse(String(row.request_body_json)) as Record<string, unknown> : undefined;
  return { id: String(row.id), title: String(row.title), description: String(row.description), category: String(row.category), endpoint: String(row.endpoint), method: String(row.method) as X402RequestMethod, requestBody, networks: JSON.parse(String(row.networks_json)), sourceUrls: JSON.parse(String(row.source_urls_json)), origin: String(row.origin) as X402CatalogService["origin"], verificationStatus: String(row.verification_status) as X402CatalogService["verificationStatus"], verifiedAt: row.verified_at ? String(row.verified_at) : undefined, createdAt: String(row.created_at), updatedAt: String(row.updated_at), removedAt: row.removed_at ? String(row.removed_at) : undefined };
}
export function listX402CatalogServices(filters: { query?: string; category?: string; network?: string } = {}) {
  const rows = db().prepare("SELECT * FROM x402_catalog_services WHERE removed_at IS NULL ORDER BY category,title").all() as Row[];
  const query = filters.query?.trim().toLowerCase(), category = filters.category?.trim(), network = filters.network?.trim();
  return rows.map(map).filter(item => (!query || `${item.title} ${item.description} ${item.endpoint}`.toLowerCase().includes(query)) && (!category || item.category === category) && (!network || item.networks.some(value => network === "solana:*" ? value.startsWith("solana:") : value === network)));
}
export function addX402CatalogService(raw: X402CatalogServiceInput) {
  const item = validate(raw), key = canonicalX402ServiceKey(item.method, item.endpoint), now = new Date().toISOString();
  const existing = db().prepare("SELECT * FROM x402_catalog_services WHERE canonical_key=?").get(key) as Row | undefined;
  if (existing) {
    if (existing.removed_at) db().prepare("UPDATE x402_catalog_services SET removed_at=NULL,updated_at=? WHERE canonical_key=?").run(now, key);
    return { service: map(db().prepare("SELECT * FROM x402_catalog_services WHERE canonical_key=?").get(key) as Row), added: false };
  }
  const id = randomUUID();
  db().prepare("INSERT INTO x402_catalog_services (id,title,description,category,endpoint,method,canonical_key,request_body_json,networks_json,source_urls_json,origin,verification_status,verified_at,created_at,updated_at,removed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, item.title, item.description, item.category, item.endpoint, item.method, key, item.requestBodyJson, JSON.stringify(item.networks), JSON.stringify(item.sourceUrls), item.origin, "candidate", null, now, now, null);
  return { service: map(db().prepare("SELECT * FROM x402_catalog_services WHERE id=?").get(id) as Row), added: true };
}
export function removeX402CatalogService(id: string) {
  const now = new Date().toISOString();
  const result = db().prepare("UPDATE x402_catalog_services SET removed_at=?,updated_at=? WHERE id=? AND removed_at IS NULL").run(now, now, id);
  return result.changes > 0;
}
export function resetX402CatalogStoreForTests() { database?.close(); database = undefined; databaseFile = ""; }
