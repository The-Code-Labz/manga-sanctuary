/**
 * Shared utilities for Novel Sanctuary edge functions.
 * Import with: import { corsHeaders, langfuseTrace, repairJson } from "../_shared/utils.ts";
 */

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": [
    "authorization",
    "x-client-info",
    "apikey",
    "content-type",
    "x-supabase-client-platform",
    "x-supabase-client-platform-version",
    "x-supabase-client-runtime",
    "x-supabase-client-runtime-version",
  ].join(", "),
};

export function corsResponse(): Response {
  return new Response(null, { headers: corsHeaders });
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

// ---------------------------------------------------------------------------
// LangFuse tracing (fire-and-forget, never throws)
// ---------------------------------------------------------------------------

export async function langfuseTrace(payload: {
  name: string;
  input: unknown;
  output: unknown;
  model: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const publicKey = Deno.env.get("NOVEL_SANCTUARY_LANGFUSE_PUBLIC_KEY");
  const secretKey = Deno.env.get("NOVEL_SANCTUARY_LANGFUSE_SECRET_KEY");
  const host = Deno.env.get("NOVEL_SANCTUARY_LANGFUSE_HOST") ?? "https://cloud.langfuse.com";

  if (!publicKey || !secretKey) return;

  const traceId = crypto.randomUUID();
  const generationId = crypto.randomUUID();
  const now = new Date().toISOString();

  const body = {
    batch: [
      {
        id: traceId,
        type: "trace-create",
        timestamp: now,
        body: {
          id: traceId,
          name: payload.name,
          input: payload.input,
          output: payload.output,
          metadata: payload.metadata ?? {},
        },
      },
      {
        id: generationId,
        type: "generation-create",
        timestamp: now,
        body: {
          id: generationId,
          traceId,
          name: payload.name,
          model: payload.model,
          input: payload.input,
          output: payload.output,
          startTime: now,
          endTime: now,
          metadata: payload.metadata ?? {},
        },
      },
    ],
  };

  fetch(`${host}/api/public/ingestion`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${publicKey}:${secretKey}`)}`,
    },
    body: JSON.stringify(body),
  }).catch(() => {/* intentional no-op */});
}

// ---------------------------------------------------------------------------
// JSON repair — handles fenced code blocks and truncated JSON gracefully
// ---------------------------------------------------------------------------

export function repairJson(raw: string): unknown {
  // Try clean parse first
  try { return JSON.parse(raw); } catch { /* continue */ }

  // Strip fenced code block if present
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  let jsonStr = fenceMatch ? fenceMatch[1].trim() : raw.trim();

  // Find first opening brace
  const braceStart = jsonStr.indexOf("{");
  if (braceStart === -1) throw new Error("No JSON object found in response");
  jsonStr = jsonStr.substring(braceStart);

  // Try again after stripping prefix
  try { return JSON.parse(jsonStr); } catch { /* continue */ }

  // Attempt structural repair for truncated responses
  const lastClosingPair = jsonStr.lastIndexOf("}]");
  const lastEntry = jsonStr.lastIndexOf("},");

  let repaired: string;
  if (lastClosingPair !== -1) {
    repaired = jsonStr.substring(0, lastClosingPair + 2) + "}";
  } else if (lastEntry !== -1) {
    repaired = jsonStr.substring(0, lastEntry + 1) + "]}";
  } else {
    // Give up — return safe empty structure
    return {};
  }

  try { return JSON.parse(repaired); } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// VoidAI (sonar-pro) helper
// ---------------------------------------------------------------------------

const VOIDAI_BASE = "https://api.voidai.app/v1/chat/completions";

export interface VoidAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface VoidAIOptions {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  search_context_size?: "low" | "medium" | "high";
}

export async function callVoidAI(
  apiKey: string,
  messages: VoidAIMessage[],
  options: VoidAIOptions = {},
): Promise<Response> {
  return fetch(VOIDAI_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model ?? "sonar-pro",
      max_tokens: options.max_tokens ?? 8192,
      temperature: options.temperature ?? 0.3,
      // Only attach search_context_size when explicitly requested — callers
      // using a plain (non-Sonar) merge model must NOT get a forced live
      // web search bolted onto every call.
      ...(options.search_context_size ? { search_context_size: options.search_context_size } : {}),
      messages,
    }),
  });
}

// ---------------------------------------------------------------------------
// LiteRouter (gpt-4o-mini-search-preview) helper — replacement for VoidAI's
// sonar-pro as the last-resort AI-search fallback. VoidAI's sonar-pro has
// been persistently 500ing account-wide; LiteRouter's OpenAI search-preview
// models are live-verified working (real grounded search, ~3s, 200 OK).
// ---------------------------------------------------------------------------

const LITEROUTER_BASE = "https://api.literouter.com/v1/chat/completions";

export async function callLiteRouter(
  apiKey: string,
  messages: VoidAIMessage[],
  options: VoidAIOptions = {},
): Promise<Response> {
  return fetch(LITEROUTER_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model ?? "gpt-4o-mini-search-preview",
      max_tokens: options.max_tokens ?? 8192,
      messages,
    }),
  });
}

export function voidAIErrorResponse(status: number): Response | null {
  if (status === 429) {
    return jsonResponse({ error: "Rate limited — please try again shortly." }, 429);
  }
  if (status === 402) {
    return jsonResponse({ error: "VoidAI credits exhausted." }, 402);
  }
  return null;
}

export function extractContent(data: unknown): string {
  return (data as any)?.choices?.[0]?.message?.content ?? "";
}

// ---------------------------------------------------------------------------
// SearXNG — discovery search. URL/key resolved from environment.
// ---------------------------------------------------------------------------

export interface SearxConfig {
  url: string;
  key: string;
}

export function getSearxConfig(): SearxConfig | null {
  const url = Deno.env.get("NOVEL_SANCTUARY_SEARX_PROXY_URL");
  const key = Deno.env.get("NOVEL_SANCTUARY_SEARX_PROXY_KEY");
  if (!url || !key) return null;
  return { url, key };
}

export async function searchSearx(
  query: string,
  config: SearxConfig,
  limit = 8,
): Promise<{ url: string; title: string; content: string }[]> {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    categories: "general",
    engines: "brave,bing,startpage",
  });

  try {
    // NOTE: novel-metadata-v2 fires RoyalRoad/NovelUpdates/WebNovel discovery
    // searches concurrently (Promise.allSettled) — 3 simultaneous hits on the
    // same SearXNG proxy measurably slow it down vs. a single serial call
    // (single calls: ~3-14s; 3-concurrent: consistently >15s). Timeout needs
    // enough headroom to survive that concurrent load, not just a solo call.
    const res = await fetch(`${config.url}?${params}`, {
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? []).slice(0, limit).map((r: any) => ({
      url: r.url ?? "",
      title: r.title ?? "",
      content: r.content ?? "",
    }));
  } catch {
    return [];
  }
}

export async function searchSearxImages(
  query: string,
  config: SearxConfig,
  limit = 30,
): Promise<{ img_src: string; thumbnail_src: string; title: string; url: string }[]> {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    categories: "images",
    engines: "google images,bing images,startpage images",
  });

  try {
    const res = await fetch(`${config.url}?${params}`, {
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? []).slice(0, limit).map((r: any) => ({
      img_src: r.img_src ?? "",
      thumbnail_src: r.thumbnail_src ?? r.img_src ?? "",
      title: r.title ?? "",
      url: r.url ?? "",
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Byparr — self-hosted FlareSolverr-compatible Cloudflare/Turnstile solver.
// Deployed on `webservices` (129.146.108.173). Kept on the public IP for now.
// ---------------------------------------------------------------------------

export const BYPARR_URL = Deno.env.get("NOVEL_SANCTUARY_BYPARR_URL") ?? "http://129.146.108.173:8191/v1";
export const BYPARR_TIMEOUT_MS = 60_000;

export async function byparrFetch(url: string, maxTimeoutMs = BYPARR_TIMEOUT_MS): Promise<string | null> {
  try {
    const res = await fetch(BYPARR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd: "request.get", url, maxTimeout: maxTimeoutMs }),
      signal: AbortSignal.timeout(maxTimeoutMs + 15_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.status !== "ok") return null;
    return data?.solution?.response ?? null;
  } catch {
    return null;
  }
}

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ---------------------------------------------------------------------------
// HTML scraping helpers
// ---------------------------------------------------------------------------

export function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

export function anchorTexts(s: string): string[] {
  return [...s.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map((m) => m[1].trim()).filter(Boolean);
}

export function divContent(html: string, id: string): string {
  const m = html.match(new RegExp(`<div id="${id}"[^>]*>([\\s\\S]*?)<\\/div>`));
  return m ? m[1] : "";
}

// ---------------------------------------------------------------------------
// Balanced-tag extraction — divContent()'s naive non-greedy regex breaks on
// nested divs (common in chapter-content containers with inner ad/formatting
// wrappers). This walks the tag stream counting open/close depth so it finds
// the TRUE matching close tag instead of the first "</div>" anywhere inside.
// ---------------------------------------------------------------------------

export function extractBalancedElement(html: string, openTagRegex: RegExp, tagName = "div"): string | null {
  const openMatch = openTagRegex.exec(html);
  if (!openMatch) return null;
  const start = openMatch.index + openMatch[0].length;
  const tagRe = new RegExp(`<${tagName}\\b[^>]*>|<\\/${tagName}>`, "gi");
  tagRe.lastIndex = start;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[0].toLowerCase().startsWith(`</${tagName}`)) {
      depth -= 1;
      if (depth === 0) return html.slice(start, m.index);
    } else {
      depth += 1;
    }
  }
  return null; // unbalanced/truncated HTML — caller should treat as extraction failure
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'",
  "&nbsp;": " ", "&#x2019;": "’", "&#8217;": "’", "&#x2018;": "‘",
  "&#8216;": "‘", "&#x201c;": "“", "&#8220;": "“", "&#x201d;": "”",
  "&#8221;": "”", "&mdash;": "—", "&ndash;": "–", "&hellip;": "…",
};

export function decodeEntities(s: string): string {
  return s.replace(/&#x?[0-9a-fA-F]+;|&\w+;/g, (e) => HTML_ENTITIES[e.toLowerCase()] ?? HTML_ENTITIES[e] ?? e);
}

// Converts a chapter-body HTML fragment into readable plain text: strips
// script/style, treats <p>/<br>/<div> as paragraph breaks, decodes entities.
export function htmlToReadableText(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n\n");
  const text = decodeEntities(stripTags(cleaned));
  return text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Title-similarity gate — rejects a discovered page when its actual title
// doesn't match the queried title closely enough. Prevents generic multi-word
// titles (e.g. "Guild Wars") from silently binding to an unrelated series
// that happened to rank first in a search result.
// ---------------------------------------------------------------------------

export const TITLE_MATCH_THRESHOLD = 0.5;

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  const setA = new Set(na.split(" "));
  const setB = new Set(nb.split(" "));
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function titlesMatch(queryTitle: string, candidateTitle: string | null | undefined): boolean {
  if (!candidateTitle) return false;
  return titleSimilarity(queryTitle, candidateTitle) >= TITLE_MATCH_THRESHOLD;
}
