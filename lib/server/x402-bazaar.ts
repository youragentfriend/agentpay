import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { X402BazaarResource } from "@/lib/x402-types";

const DEFAULT_SOURCES = ["https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?type=http&limit=100&offset=0"];

function configuredSources(): string[] {
  const configured = (process.env.AGENTPAY_X402_BAZAAR_URLS || "").split(",").map((value) => value.trim()).filter(Boolean);
  return configured.length ? configured : DEFAULT_SOURCES;
}

function validateSource(raw: string): URL {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port || host === "localhost" || host.endsWith(".local") || isIP(host)) throw new Error("Bazaar sources must be public HTTPS URLs.");
  return url;
}

function rows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["items", "resources", "data"]) if (Array.isArray(record[key])) return rows(record[key]);
  return [];
}

export function normalizeBazaarResource(row: Record<string, unknown>, source: string, allowedHosts: string[]): X402BazaarResource | undefined {
  if (row.x402Version !== undefined && row.x402Version !== 2) return;
  const resource = row.resource && typeof row.resource === "object" ? row.resource as Record<string, unknown> : row;
  const resourceUrl = [typeof row.resource === "string" ? row.resource : undefined, resource.url, row.resourceUrl, row.url].find((value) => typeof value === "string") as string | undefined;
  if (!resourceUrl) return;
  let url: URL; try { url = new URL(resourceUrl); } catch { return; }
  if (url.protocol !== "https:") return;
  const requirements = row.paymentRequirements && typeof row.paymentRequirements === "object" ? row.paymentRequirements as Record<string, unknown> : row;
  const accepts = Array.isArray(requirements.accepts) ? requirements.accepts.filter((item) => item && typeof item === "object") as Record<string, unknown>[] : [];
  const bsc = accepts.filter((item) => item.network === "eip155:56").map((item) => ({
    scheme: typeof item.scheme === "string" ? item.scheme : undefined,
    network: "eip155:56",
    asset: typeof item.asset === "string" ? item.asset : undefined,
    amount: typeof item.amount === "string" ? item.amount : undefined,
    payTo: typeof item.payTo === "string" ? item.payTo : undefined,
  }));
  if (!bsc.length) return;
  return {
    id: createHash("sha256").update(`${source}\n${resourceUrl}`).digest("hex").slice(0, 20), source,
    resourceUrl, resourceHost: url.hostname,
    description: typeof resource.description === "string" ? resource.description.slice(0, 240) : "Published x402 resource",
    method: typeof resource.method === "string" ? resource.method.toUpperCase() : "GET",
    networks: [...new Set(accepts.map((item) => typeof item.network === "string" ? item.network : "").filter(Boolean))],
    bscOptions: bsc, allowlisted: allowedHosts.includes(url.hostname.toLowerCase()),
  };
}

export function x402BazaarCapability() { return { sources: configuredSources() }; }

export async function listBscBazaarResources(): Promise<{ resources: X402BazaarResource[]; failures: string[] }> {
  const sources = configuredSources();
  const allowedHosts = (process.env.AGENTPAY_X402_ALLOWED_HOSTS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const resources: X402BazaarResource[] = []; const failures: string[] = [];
  await Promise.all(sources.map(async (raw) => {
    try {
      const url = validateSource(raw); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(url, { headers: { Accept: "application/json" }, redirect: "error", signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const length = Number(response.headers.get("content-length") || 0); if (length > 2_000_000) throw new Error("response too large");
        const data = JSON.parse((await response.text()).slice(0, 2_000_000));
        for (const row of rows(data)) { const item = normalizeBazaarResource(row, url.hostname, allowedHosts); if (item) resources.push(item); }
      } finally { clearTimeout(timer); }
    } catch (error) { failures.push(`${raw}: ${error instanceof Error ? error.message : "failed"}`); }
  }));
  return { resources: resources.sort((a, b) => Number(b.allowlisted) - Number(a.allowlisted)), failures };
}
