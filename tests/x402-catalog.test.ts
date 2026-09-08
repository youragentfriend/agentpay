import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addX402CatalogService, canonicalX402ServiceKey, listX402CatalogServices, removeX402CatalogService, resetX402CatalogStoreForTests } from "../lib/server/x402-catalog-store";

function withCatalog(run: () => void) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "agentpay-x402-catalog-"));
  const previous = process.env.AGENTPAY_DB_PATH;
  process.env.AGENTPAY_DB_PATH = path.join(dir, "db.sqlite");
  resetX402CatalogStoreForTests();
  try { run(); }
  finally {
    resetX402CatalogStoreForTests();
    if (previous === undefined) delete process.env.AGENTPAY_DB_PATH; else process.env.AGENTPAY_DB_PATH = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("seeds a useful catalog containing only supported x402 networks", () => withCatalog(() => {
  const services = listX402CatalogServices();
  assert.ok(services.length >= 6);
  assert.ok(services.some(item => item.category === "Market data"));
  assert.ok(services.some(item => item.networks.some(network => network.startsWith("solana:"))));
  assert.ok(services.every(item => item.endpoint.startsWith("https://") && item.networks.every(network => network === "eip155:56" || network === "eip155:8453" || network.startsWith("solana:"))));
}));

test("canonicalizes method and endpoint and prevents duplicates", () => withCatalog(() => {
  assert.equal(canonicalX402ServiceKey("GET", "https://EXAMPLE.com:443/data/#section"), "GET:https://example.com/data");
  const input = { title: "Example data", description: "A verified example service.", category: "Market data", endpoint: "https://example.com/data", method: "GET" as const, networks: ["eip155:8453"], sourceUrls: ["https://example.com/docs"], origin: "ai-discovered" as const };
  assert.equal(addX402CatalogService(input).added, true);
  assert.equal(addX402CatalogService({ ...input, endpoint: "https://EXAMPLE.com:443/data#again" }).added, false);
  assert.equal(listX402CatalogServices().filter(item => item.endpoint.toLowerCase().includes("example.com/data")).length, 1);
}));

test("filters and soft-removes catalog services", () => withCatalog(() => {
  const market = listX402CatalogServices({ category: "Market data" });
  assert.ok(market.length > 0);
  const solana = listX402CatalogServices({ network: "solana:*" });
  assert.ok(solana.length > 0 && solana.every(item => item.networks.some(network => network.startsWith("solana:"))));
  const target = market[0];
  assert.equal(removeX402CatalogService(target.id), true);
  assert.equal(listX402CatalogServices().some(item => item.id === target.id), false);
  assert.equal(removeX402CatalogService(target.id), false);
}));

test("rejects insecure, unsupported, and unsourced catalog entries", () => withCatalog(() => {
  const base = { title: "Unsafe", description: "Should not be stored.", category: "Market data", method: "GET" as const, origin: "ai-discovered" as const };
  assert.throws(() => addX402CatalogService({ ...base, endpoint: "http://example.com/data", networks: ["eip155:8453"], sourceUrls: ["https://example.com/docs"] }), /HTTPS/);
  assert.throws(() => addX402CatalogService({ ...base, endpoint: "https://example.com/data", networks: ["eip155:1"], sourceUrls: ["https://example.com/docs"] }), /BSC, Base, or Solana/);
  assert.throws(() => addX402CatalogService({ ...base, endpoint: "https://example.com/data", networks: ["eip155:8453"], sourceUrls: [] }), /reliable HTTPS source/);
}));
