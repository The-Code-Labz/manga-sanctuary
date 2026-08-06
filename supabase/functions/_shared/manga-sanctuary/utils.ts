/**
 * Shared utilities for Manga Sanctuary edge functions.
 * Import with: import { corsHeaders, langfuseTrace, repairJson } from "../_shared/manga-sanctuary/utils.ts";
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
  const publicKey = Deno.env.get("MANGA_SANCTUARY_LANGFUSE_PUBLIC_KEY");
  const secretKey = Deno.env.get("MANGA_SANCTUARY_LANGFUSE_SECRET_KEY");
  const host = Deno.env.get("MANGA_SANCTUARY_LANGFUSE_HOST") ?? "https://cloud.langfuse.com";

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
    return jsonResponse({ error: "AI provider credits exhausted." }, 402);
  }
  return null;
}

// ---------------------------------------------------------------------------
// OpenAI (direct) helper — primary provider for manga-metadata-v2's merge
// step as of 2026-07-30. VoidAI's gpt-4o-mini call site had no fallback
// provider, and VoidAI was observed down account-wide (a bare "say ok"
// control prompt 500ing on both keys) — going direct to OpenAI removes
// VoidAI as a single point of failure for this synthesis-only call.
// ---------------------------------------------------------------------------

const OPENAI_BASE = "https://api.openai.com/v1/chat/completions";

export async function callOpenAI(
  apiKey: string,
  messages: VoidAIMessage[],
  options: VoidAIOptions = {},
): Promise<Response> {
  return fetch(OPENAI_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model ?? "gpt-4o-mini",
      max_tokens: options.max_tokens ?? 4096,
      temperature: options.temperature ?? 0.2,
      messages,
    }),
  });
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
  const url = Deno.env.get("MANGA_SANCTUARY_SEARX_PROXY_URL");
  const key = Deno.env.get("MANGA_SANCTUARY_SEARX_PROXY_KEY");
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
    // Brave dropped: live-tested this session it repeatedly self-suspends
    // ("too many requests") first under any sustained query volume, and a
    // side-by-side test (bing+startpage vs brave+bing+startpage) against the
    // exact NovelUpdates query that was returning low-confidence results
    // found identical results either way — brave wasn't adding coverage,
    // just another engine that can choke and drag the whole request down.
    engines: "bing,startpage",
  });

  // NOTE: novel-metadata-v2 fires RoyalRoad/NovelUpdates/WebNovel discovery
  // searches concurrently (Promise.allSettled) — 3 simultaneous hits on the
  // same SearXNG proxy measurably slow it down vs. a single serial call.
  // Live-measured 2026-07-30: 3-concurrent load consistently lands right at
  // ~30-30.6s — i.e. the old 30s abort was racing the proxy's own real
  // completion time and losing on a coin-flip basis, silently returning []
  // (this swallowed the AbortError) even though the upstream search itself
  // succeeded a moment later. 45s gives real headroom under the same
  // concurrent-load pattern; the request-level budget (Kong 200s, worker
  // 180s) easily absorbs it since RR/NU/WebNovel run in parallel, not serial.
  //
  // Live-confirmed 2026-07-31: the SearXNG proxy itself is separately prone
  // to whole-instance stalls independent of query load — a bare direct probe
  // (no concurrency at all) hung for a full 30s with zero bytes received.
  // A single attempt with no retry meant one transient stall silently
  // degraded a full-source result (e.g. ReadNovelFull, 1000+ real chapters)
  // down to whatever a later fallback step in the chain happened to find —
  // this is what produced chapter-search results that looked "stuck" on a
  // smaller/incomplete source. One retry with a short backoff absorbs a
  // transient stall without materially changing worst-case latency, since a
  // hard network failure/AbortError returns almost immediately (no need to
  // wait out the full 45s twice for a DNS/connection-refused case).
  const ATTEMPTS = 2;
  const RETRY_DELAY_MS = 1500;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${config.url}?${params}`, {
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
        },
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) {
        if (attempt < ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        return [];
      }
      const data = await res.json();
      return (data.results ?? []).slice(0, limit).map((r: any) => ({
        url: r.url ?? "",
        title: r.title ?? "",
        content: r.content ?? "",
      }));
    } catch {
      if (attempt < ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      return [];
    }
  }
  return [];
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

  // Same transient-stall retry as searchSearx — one short-backoff retry.
  const ATTEMPTS = 2;
  const RETRY_DELAY_MS = 1500;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${config.url}?${params}`, {
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        if (attempt < ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        return [];
      }
      const data = await res.json();
      return (data.results ?? []).slice(0, limit).map((r: any) => ({
        img_src: r.img_src ?? "",
        thumbnail_src: r.thumbnail_src ?? r.img_src ?? "",
        title: r.title ?? "",
        url: r.url ?? "",
      }));
    } catch {
      if (attempt < ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      return [];
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Byparr — self-hosted FlareSolverr-compatible Cloudflare/Turnstile solver.
// Deployed on `webservices` (129.146.108.173). Kept on the public IP for now.
// ---------------------------------------------------------------------------

export const BYPARR_URL = Deno.env.get("MANGA_SANCTUARY_BYPARR_URL") ?? "http://129.146.108.173:8191/v1";
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

// Numeric character references (&#8211; / &#x2013;) decode generically via
// String.fromCodePoint instead of needing every possible codepoint in the
// lookup table above — that table was missing &#8211; (en dash) specifically,
// which leaked through raw into scraped chapter titles (caught live during
// the translator-TOC title-enrichment work). Named entities (&amp; etc.)
// still go through HTML_ENTITIES since they're not numeric.
export function decodeEntities(s: string): string {
  return s.replace(/&#x?[0-9a-fA-F]+;|&\w+;/g, (e) => {
    const numMatch = e.match(/^&#(x)?([0-9a-fA-F]+);$/i);
    if (numMatch) {
      const code = parseInt(numMatch[2], numMatch[1] ? 16 : 10);
      if (Number.isFinite(code) && code > 0) {
        try { return String.fromCodePoint(code); } catch { /* fall through */ }
      }
    }
    return HTML_ENTITIES[e.toLowerCase()] ?? HTML_ENTITIES[e] ?? e;
  });
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
// Chapter illustrations — extract inline <img> elements at their real
// position in the chapter body, filter obvious noise (logos/ads/avatars),
// and re-host the real ones to our own Supabase Storage bucket instead of
// hotlinking the source site (source CDNs routinely break: token-expiring
// URLs, hotlink protection, re-triggered Cloudflare challenges on repeat
// fetches). Position is preserved via a placeholder token swapped in during
// HTML processing, then replaced with real Markdown image syntax once the
// (async) re-host upload completes.
// ---------------------------------------------------------------------------

const IMAGE_DENY_PATTERNS = [
  /logo/i, /banner/i, /\bads?\b/i, /sponsor/i, /avatar/i, /\bicon\b/i,
  /badge/i, /\bbutton\b/i, /patreon/i, /ko-?fi/i, /paypal/i, /\bdonate/i,
  /\bsocial\b/i, /share-?(icon|button)/i, /qrcode/i, /\bwidget\b/i,
  /placeholder/i, /\bspacer\b/i, /pixel\.(gif|png)/i, /tracking/i,
  /gravatar/i, /emoji/i, /smiley/i,
];

function isDeniedImage(url: string, alt: string, cls: string): boolean {
  const hay = `${url} ${alt} ${cls}`.toLowerCase();
  return IMAGE_DENY_PATTERNS.some((re) => re.test(hay));
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? m[1] : null;
}

export interface ExtractedImage {
  token: string;
  url: string;
  alt: string;
}

// Swaps every kept <img> tag for a placeholder token (survives tag-stripping
// since it isn't `<...>`); drops denied/noise images
// entirely. Caller runs the normal text pipeline afterward, then replaces
// tokens with final Markdown image syntax once re-hosting resolves.
export function extractImagesWithPlaceholders(
  html: string,
  baseUrl: string,
): { html: string; images: ExtractedImage[] } {
  const images: ExtractedImage[] = [];
  let i = 0;
  const out = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const rawSrc =
      attr(tag, "data-src") ?? attr(tag, "data-original") ??
      attr(tag, "data-lazy-src") ?? attr(tag, "data-lazy-original") ??
      attr(tag, "src");
    const alt = attr(tag, "alt") ?? "";
    const cls = attr(tag, "class") ?? "";
    if (!rawSrc || rawSrc.startsWith("data:")) return "";
    if (isDeniedImage(rawSrc, alt, cls)) return "";
    // explicit tiny dimensions -> tracking pixel / spacer, not real art
    const w = Number(attr(tag, "width"));
    const h = Number(attr(tag, "height"));
    if ((w > 0 && w <= 16) || (h > 0 && h <= 16)) return "";
    let absUrl: string;
    try {
      absUrl = new URL(rawSrc, baseUrl).href;
    } catch {
      return "";
    }
    const token = `⟦CHAPTER_IMG_${i}⟧`;
    images.push({ token, url: absUrl, alt });
    i += 1;
    return `\n\n${token}\n\n`;
  });
  return { html: out, images };
}

// Same pipeline as htmlToReadableText, but preserves image placeholder
// tokens as their own paragraph instead of stripping them.
export function htmlToReadableTextWithImages(
  html: string,
  baseUrl: string,
): { text: string; images: ExtractedImage[] } {
  const { html: withTokens, images } = extractImagesWithPlaceholders(html, baseUrl);
  const text = htmlToReadableText(withTokens);
  return { text, images };
}

const REHOST_BUCKET = "chapter-images";
const MAX_REHOST_IMAGES = 20; // safety ceiling — some scraped pages have dozens of decorative dividers
const REHOST_TIMEOUT_MS = 15_000;

// The platform-injected SUPABASE_URL inside self-hosted edge functions is the
// *internal* Docker network address (e.g. http://kong:8000) — correct for the
// function's own server-side fetch/upload calls, but useless to a browser.
// Public URLs handed back to the client must use the real external domain
// instead. Prefer an explicit override if ever provided, else fall back to
// this instance's known public Supabase domain (same one already used for
// MANGA_SANCTUARY_SEARX_PROXY_URL elsewhere in this codebase).
const PUBLIC_SUPABASE_URL =
  Deno.env.get("MANGA_SANCTUARY_SUPABASE_PUBLIC_URL") ??
  Deno.env.get("SUPABASE_PUBLIC_URL") ??
  "https://supabase.neurolearninglabs.com";

// Fetches an image's bytes from the source site and re-uploads it to our own
// Supabase Storage bucket, so the reader never depends on the source CDN
// staying up/unblocked. Uses the platform-injected SUPABASE_URL (internal,
// for the upload call itself) + SUPABASE_SERVICE_ROLE_KEY (auto-provided to
// every self-hosted edge function, no new secret needed). Returns null
// (caller falls back to the original external URL) on any failure — never
// blocks the whole chapter fetch.
// Uploads already-in-memory bytes to our Storage bucket, content-addressed by
// SHA-256 (so identical bytes — a page re-fetched across retries, or a strip
// rebuilt from the same pages — de-dupe onto the same object instead of
// piling up copies). Shared by rehostImage (per-page) and
// stitchPagesIntoStrip (the combined long-strip image) below. Returns null
// on any failure — every caller has its own fallback for that case.
async function uploadBytesToStorage(
  bytes: Uint8Array,
  contentType: string,
  pathPrefix: string,
): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return null;

  try {
    const ext = contentType.split("/")[1]?.split(";")[0]?.replace("jpeg", "jpg") || "jpg";
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const hashHex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const path = `${pathPrefix}/${hashHex}.${ext}`;

    const uploadRes = await fetch(
      `${supabaseUrl}/storage/v1/object/${REHOST_BUCKET}/${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": contentType,
          "x-upsert": "true",
        },
        body: bytes,
        signal: AbortSignal.timeout(REHOST_TIMEOUT_MS),
      },
    );
    if (!uploadRes.ok && uploadRes.status !== 409) return null;
    return `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${REHOST_BUCKET}/${path}`;
  } catch {
    return null;
  }
}

async function rehostImage(url: string, refererUrl: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Referer: refererUrl },
      signal: AbortSignal.timeout(REHOST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 10 * 1024 * 1024) return null;

    return await uploadBytesToStorage(bytes, contentType, "chapters");
  } catch {
    return null;
  }
}

// Resolves every image placeholder token in `text` to final Markdown image
// syntax, re-hosting each one to our own Storage bucket in parallel (bounded
// by REHOST_TIMEOUT_MS regardless of image count) and falling back to the
// original source URL when re-hosting fails for that one image (still
// displays, just not future-proofed against the source CDN going down).
export async function resolveChapterImages(
  text: string,
  images: ExtractedImage[],
  refererUrl: string,
): Promise<string> {
  const capped = images.slice(0, MAX_REHOST_IMAGES);
  const resolved = await Promise.all(
    capped.map(async (img) => ({ img, hosted: await rehostImage(img.url, refererUrl) })),
  );
  let out = text;
  for (const { img, hosted } of resolved) {
    const finalUrl = hosted ?? img.url;
    const safeAlt = img.alt.replace(/[\[\]]/g, "");
    out = out.replace(img.token, `![${safeAlt}](${finalUrl})`);
  }
  // Any tokens beyond the cap — drop cleanly rather than leaving raw
  // private-use characters in the stored chapter text.
  out = out.replace(/⟦CHAPTER_IMG_\d+⟧/g, "");
  return out;
}

// ---------------------------------------------------------------------------
// Manga page images — a chapter here IS a sequence of images (no prose to
// wrap them in), so unlike resolveChapterImages (which re-hosts a handful of
// inline illustrations and splices them back into markdown text), this just
// re-hosts a full ordered page list and returns the ordered URL array.
// Bounded concurrency (not Promise.all-everything) so a 60+ page chapter
// doesn't fire that many simultaneous outbound fetches + Storage uploads at
// once. Falls back to the original source URL per-page on any failure —
// never drops a page just because re-hosting it failed.
// ---------------------------------------------------------------------------

const MAX_REHOST_PAGES = 100;
const REHOST_CONCURRENCY = 6;

export async function rehostPageImages(
  urls: string[],
  refererUrl: string,
): Promise<string[]> {
  const capped = urls.slice(0, MAX_REHOST_PAGES);
  const results = new Array<string>(capped.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= capped.length) return;
      results[i] = (await rehostImage(capped[i], refererUrl)) ?? capped[i];
    }
  }
  await Promise.all(Array.from({ length: Math.min(REHOST_CONCURRENCY, capped.length) }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// Long-strip stitching — combines an already-rehosted, ordered page-image
// array into a single tall JPEG (classic webtoon/long-strip presentation)
// instead of leaving the chapter as N separate page rows. Runs as the last
// step after rehostPageImages, downloading from OUR OWN Storage bucket (not
// the original source site), so no Referer/anti-bot handling is needed here.
//
// Deliberately conservative: Supabase edge functions are WASM-only (no
// native Sharp-style libs) and memory/CPU-limited, so any single failure —
// a missing page, a decode error, a combined canvas over the height cap —
// aborts the whole stitch and returns null. The caller (manga-chapter-content)
// falls back to the original per-page array in that case; a chapter that
// reads as N pages is strictly better than one that 500s or OOMs.
// ---------------------------------------------------------------------------

// CPU-time budget, not a "this isn't a normal case" cap. imagescript's decode
// is a synchronous WASM call with nothing to yield on, so stitching runs as
// one uninterrupted CPU burn for the whole chapter — the edge-runtime
// supervisor kills the isolate at its CPU-time ceiling (~20-22s observed live,
// confirmed via nexus-1 function logs: a 50-page MangaDex chapter reproduced
// `CPU time hard limit reached` on 3/3 attempts, every time near the same
// mark, before the response ever got sent — success:false was never reached,
// the connection just reset). Lowered from 60 (which never actually
// completed for any chapter near that size) to a page count empirically
// unlikely to blow the budget. Deliberately a hard skip-stitching bailout
// below, NOT a silent truncate-and-stitch-partial — a chapter that stitches
// only its first N pages while dropping the rest would be a worse, harder-to-
// notice bug than just falling back to the per-page array.
export const STRIP_MAX_PAGES = 15; // lowered from 25 2026-08-05 — see memory note below
// The edge-runtime isolate's hard cap is 150MB TOTAL (Deno runtime + all
// buffers), confirmed live against supabase-edge-runtime's userWorkers.create
// config (memoryLimitMb: 150, not tunable per-function). The width/height caps
// below are sized to leave headroom under that, not just "reasonable output
// quality" — a canvas at the old 1000x40000 cap alone was ~160MB, i.e. already
// over budget by itself before counting a single decoded source page.
const STRIP_TARGET_WIDTH_CAP = 800; // px
const STRIP_MAX_TOTAL_HEIGHT = 12_000; // px — bounds the output RGBA canvas to ~38MB at the width cap
const STRIP_FETCH_TIMEOUT_MS = 20_000;
const STRIP_JPEG_QUALITY = 90;

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(STRIP_FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function stitchPagesIntoStrip(pageUrls: string[]): Promise<string | null> {
  if (pageUrls.length < 2) return pageUrls[0] ?? null; // nothing to stitch — 0 or 1 page already IS the whole "strip"

  // Bail out entirely rather than truncating — see STRIP_MAX_PAGES comment.
  // The caller falls back to the full, untouched per-page array in this case.
  if (pageUrls.length > STRIP_MAX_PAGES) return null;

  try {
    const { Image } = await import("https://deno.land/x/imagescript@1.2.17/mod.ts");

    // Fetch+decode+downscale ONE page at a time, sequentially — NOT
    // Promise.all. The 2026-08-05 OOM ("memory limit reached for the worker")
    // was this loop decoding all N pages at ORIGINAL scan resolution
    // concurrently, so the isolate briefly held N full-size raw RGBA bitmaps
    // (plus their compressed source bytes) at once — easily 300MB+ for a
    // page count near the old cap, against a hard 150MB ceiling. Processing
    // one page at a time bounds the peak to roughly one original-resolution
    // decode plus the already-downscaled pages accumulated so far, and each
    // downscale happens immediately so the oversized original is dropped
    // (eligible for GC) before the next page is even fetched.
    const capped: InstanceType<typeof Image>[] = [];
    let runningHeight = 0;
    for (const url of pageUrls) {
      const bytes = await fetchBytes(url);
      if (!bytes || bytes.byteLength === 0) return null; // missing page → keep the paged fallback, don't stitch a gap

      let img = await Image.decode(bytes);
      if (img.width > STRIP_TARGET_WIDTH_CAP) {
        img = img.resize(STRIP_TARGET_WIDTH_CAP, Image.RESIZE_AUTO);
      }

      runningHeight += img.height;
      if (runningHeight > STRIP_MAX_TOTAL_HEIGHT) return null; // bail before compositing, not after — avoids paying for pages we'll discard anyway

      capped.push(img);
    }

    // Normalize any remaining outlier widths to the mode. Every image here is
    // already ≤ STRIP_TARGET_WIDTH_CAP, so this pass is cheap regardless.
    const widthCounts = new Map<number, number>();
    for (const img of capped) widthCounts.set(img.width, (widthCounts.get(img.width) ?? 0) + 1);
    let targetWidth = capped[0].width;
    let bestCount = 0;
    for (const [w, count] of widthCounts) {
      if (count > bestCount) { targetWidth = w; bestCount = count; }
    }

    const totalHeight = capped.reduce((sum, img) => sum + (img.width === targetWidth ? img.height : Math.round(img.height * (targetWidth / img.width))), 0);
    if (totalHeight < 1 || totalHeight > STRIP_MAX_TOTAL_HEIGHT) return null;

    const strip = new Image(targetWidth, totalHeight);
    let y = 0;
    for (const img of capped) {
      const normalized = img.width === targetWidth ? img : img.resize(targetWidth, Image.RESIZE_AUTO);
      strip.composite(normalized, 0, y);
      y += normalized.height;
    }

    const encoded = await strip.encodeJPEG(STRIP_JPEG_QUALITY);
    return await uploadBytesToStorage(encoded, "image/jpeg", "chapters/strips");
  } catch {
    return null;
  }
}

// Chapters over STRIP_MAX_PAGES can't stitch synchronously inside the edge
// function's CPU-time budget (see the comment on STRIP_MAX_PAGES above), so
// they're handed off to the manga-chapter-stitch Kestra flow instead, which
// runs under a real Docker task with no such ceiling. The webhook only
// queues a Kestra execution and returns immediately — this call does NOT
// wait for the stitch itself. The flow PATCHes strip_url/stitch_status back
// onto the chapters row on its own once done (or 'failed' on error); the
// reader falls back to the untouched per-page array until then. Auth is
// baked into the webhook URL itself (no separate header needed). Never
// throws — any failure here just leaves stitch_status at its default and the
// per-page array stays authoritative.
export async function triggerAsyncStitch(chapterId: string, pageUrls: string[]): Promise<boolean> {
  const webhookUrl = Deno.env.get("MANGA_SANCTUARY_STITCH_WEBHOOK_URL");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!webhookUrl || !supabaseUrl || !serviceKey) return false;

  try {
    // Flip status to 'processing' first so the reader stops assuming 'none'
    // (unattempted) and the admin UI can show a spinner instead of nothing.
    await fetch(`${supabaseUrl}/rest/v1/chapters?id=eq.${chapterId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
        "Content-Profile": "manga_sanctuary",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ stitch_status: "processing" }),
      signal: AbortSignal.timeout(10_000),
    });

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapter_id: chapterId, page_urls: pageUrls }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
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
