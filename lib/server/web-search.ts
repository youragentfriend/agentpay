const DEFAULT_PROVIDER = "duckduckgo";
const DUCKDUCKGO_URL = "https://html.duckduckgo.com/html/";

export type WebSearchResult = { title: string; url: string; snippet: string };
export type WebSearchStatus = { configured: boolean; provider: "duckduckgo" };

export function webSearchStatus(): WebSearchStatus {
  const provider = (process.env.AGENTPAY_WEB_SEARCH_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase();
  return { configured: provider === "duckduckgo", provider: "duckduckgo" };
}

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function resultUrl(value: string): string | undefined {
  try {
    const url = new URL(value, "https://duckduckgo.com");
    const target = url.hostname.endsWith("duckduckgo.com") ? url.searchParams.get("uddg") : url.toString();
    if (!target) return;
    const parsed = new URL(target);
    if (parsed.protocol !== "https:") return;
    return parsed.toString();
  } catch {
    return;
  }
}

export function parseDuckDuckGoResults(html: string, limit = 6): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const blocks = html.split(/<div[^>]+class="[^"]*result[^"]*"[^>]*>/i).slice(1);
  for (const block of blocks) {
    const anchor = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    const url = resultUrl(decodeHtml(anchor[1]));
    const title = decodeHtml(anchor[2]);
    const snippetMatch = block.match(/<(?:a|div)[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i);
    const snippet = decodeHtml(snippetMatch?.[1] || "").slice(0, 800);
    if (!url || !title || results.some((item) => item.url === url)) continue;
    results.push({ title: title.slice(0, 240), url, snippet });
    if (results.length >= Math.max(1, Math.min(limit, 10))) break;
  }
  return results;
}

export async function searchWeb(query: string, options: { limit?: number; timeoutMs?: number } = {}): Promise<WebSearchResult[]> {
  const status = webSearchStatus();
  if (!status.configured) throw new Error("AgentPay web search is not configured.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    const url = new URL(DUCKDUCKGO_URL);
    url.searchParams.set("q", query.slice(0, 500));
    const response = await fetch(url, {
      headers: { "User-Agent": "AgentPay/1.7 (+standalone web search)", Accept: "text/html" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`AgentPay web search is unavailable (HTTP ${response.status}).`);
    const results = parseDuckDuckGoResults(await response.text(), options.limit);
    if (!results.length) throw new Error("AgentPay web search returned no usable results.");
    return results;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("AgentPay web search timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
