import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsResponse,
  jsonResponse,
  langfuseTrace,
  byparrFetch,
  BROWSER_UA,
  extractBalancedElement,
  rehostPageImages,
  stitchPagesIntoStrip,
  triggerAsyncStitch,
  SYNC_STITCH_MAX_PAGES,
} from "../_shared/manga-sanctuary/utils.ts";

// ---------------------------------------------------------------------------
// Ported from novel-sanctuary's novel-chapter-content — but the job itself is
// fundamentally different, not just reworded. Novel chapters ARE prose: that
// function scraped a reading page's <div class="chapter-inner">/etc. down to
// readable TEXT (with a handful of inline illustrations re-hosted and
// spliced back into the markdown). A manga chapter has no prose at all — the
// "content" IS an ordered sequence of full-page images. So instead of
// text-extraction heuristics (word counts, boilerplate/cookie-banner
// detection, chapter-title cleanup from <meta og:title>), this returns an
// ordered array of re-hosted page image URLs.
//
// Primary path: MangaDex's official API. When a chapter's external_url is a
// mangadex.org/chapter/{id} link (which is exactly what manga-chapter-search
// hands out for its MangaDex-sourced results), /at-home/server/{id} returns
// the real page image filenames directly — no scraping, no heuristics, no
// false positives. This is strictly more reliable than anything novel's
// version could do, since MangaDex's own reader is a real documented API.
//
// Fallback path 1: sequential-pagination gallery crawl. Plenty of aggregator/
// gallery sites (MangaDex mirrors, old-school scanlation gallery viewers,
// etc.) don't put every page in one reader-container div — instead each page
// of the chapter is its OWN url, one image per page, with the page number as
// a path segment or query param (e.g. ".../chapter-12/1/", ".../read/1"
// incrementing to "/2/", "/3/", ...). Single-page extraction only ever
// captures page 1 in that layout. When the url looks paginated AND the first
// page's own markup confirms a real multi-page total (a pagination widget,
// page-select dropdown, or "Page X of Y" string — never guessed), this walks
// every page 1..N and stitches the per-page images into one ordered array.
//
// Fallback path 2: for any other URL (an admin manually pasted a mangakakalot/
// asurascans/etc. link, or MangaDex only had an externalUrl with no
// self-hosted pages), best-effort generic <img>-gallery extraction from
// common manga-reader container selectors. Honest failure semantics kept
// from novel's version: success:false means "keep the external link,
// in-app reading isn't available for this chapter", not an error.
//
// Final step, regardless of which path produced the page list: the ordered
// page images (already rehosted to our own Storage) get composited into a
// single tall long-strip JPEG via stitchPagesIntoStrip (see _shared/utils.ts)
// so the chapter reads as one continuous image instead of N separate page
// rows. Best-effort — any failure there just falls back to the per-page array.
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 25_000;
// Tiered confidence: a *known reader-container selector* matching is itself
// strong evidence, so any page count from it is trusted (down to 1 — legit
// for oneshots/single-strip webtoon chapters, which used to be rejected
// outright by a flat MIN_PAGES=2 and silently forced back to "read on
// original site"). The higher bar only applies to the last-resort whole-page
// scan, which has zero container confirmation and risks picking up unrelated
// thumbnails (related-series widgets, sidebar art, etc.) instead of the
// actual chapter.
const MULTI_PAGE_MIN = 2; // selector match with >= this many images: accept immediately, no fallback needed
const WHOLE_PAGE_MIN = 5; // no selector matched at all: only trust a page-wide <img> sweep past this bar
const MAX_SEQUENTIAL_PAGES = 40; // safety cap on per-page-url gallery crawls (was 60 — lowered, see CPU budget note below)
const SEQUENTIAL_FETCH_CONCURRENCY = 6;

// ---------------------------------------------------------------------------
// CPU-time circuit breakers. A live isolate hit the edge-runtime's CPU-time
// hard limit (soft at ~4.6s, hard ~1.5s later — supervisor killed it,
// "request has been cancelled by supervisor") running this function against
// a pathological source: a bloated/rendered HTML document (Byparr returns
// full post-JS DOM, which can run several MB) run through up to 13 regex
// selector scans (extractGeneric) or up to 40 sequential per-page fetches
// each doing the same, with nothing bounding worst-case document size or
// total elapsed work. Two independent guards, since either alone can be
// defeated by a different pathology (one huge doc vs. many medium ones):
//   1. MAX_HTML_LEN — refuse to regex-scan a document past this size at all.
//      A real single manga-reader page is essentially never this big; if it
//      is, it's ad/tracking/related-content bloat, not chapter content.
//   2. CPU_BUDGET_MS — wall-clock deadline (proxy for CPU-bound regex work,
//      since fetch time is comparatively small) checked between selector
//      passes and between sequential-crawl pages, so no loop can compound
//      past the isolate's real CPU allowance regardless of source shape.
// ---------------------------------------------------------------------------
const MAX_HTML_LEN = 4_000_000; // 4MB
const CPU_BUDGET_MS = 8_000;

// ---------------------------------------------------------------------------
// MangaDex — official at-home/server API
// ---------------------------------------------------------------------------

const MANGADEX_CHAPTER_RE = /mangadex\.org\/chapter\/([0-9a-f-]{36})/i;

// Every extractor returns this instead of a bare `| null` so a total failure
// (all extractors exhausted) carries a real, specific reason instead of the
// single generic string every skip used to collapse into — the actual gap
// that made "why do chapters keep getting skipped" unanswerable from logs.
type ExtractResult = { pages: string[]; source: string };
type ExtractOutcome = ExtractResult | { fail: string };
function isOk(r: ExtractOutcome): r is ExtractResult {
  return "pages" in r;
}

async function extractMangaDex(chapterId: string): Promise<ExtractOutcome> {
  try {
    const res = await fetch(`https://api.mangadex.org/at-home/server/${chapterId}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    // 404 here typically means an externally-hosted chapter (no MangaDex-hosted
    // pages) — used to be a dead end. Callers now fall through to the generic
    // extractors against the same url instead of stopping here.
    if (!res.ok) return { fail: `mangadex_http_${res.status}` };
    const data = await res.json();
    const baseUrl = data?.baseUrl;
    const hash = data?.chapter?.hash;
    const files: string[] = Array.isArray(data?.chapter?.data) ? data.chapter.data : [];
    if (!baseUrl || !hash || files.length === 0) return { fail: "mangadex_empty_response" };

    const rawUrls = files.map((f) => `${baseUrl}/data/${hash}/${f}`);
    const pages = await rehostPageImages(rawUrls, `https://mangadex.org/chapter/${chapterId}`);
    return { pages, source: "MangaDex" };
  } catch (err) {
    return { fail: `mangadex_error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ---------------------------------------------------------------------------
// Generic fallback — best-effort <img>-gallery extraction from common manga
// reader container id/class conventions across aggregator sites (Madara/
// WordPress-manga-theme sites, which the large majority of scanlation
// aggregators run on, plus a few bespoke ones).
// ---------------------------------------------------------------------------

const GENERIC_SELECTORS: RegExp[] = [
  /<div[^>]*class="[^"]*\breading-content\b[^"]*"[^>]*>/i, // Madara theme (mangakakalot/asurascans/etc.)
  /<div[^>]*id="readerarea"[^>]*>/i, // MangaKatana / weeb-central style
  /<div[^>]*id="chapter_imgs"[^>]*>/i,
  /<div[^>]*id="chapter-images"[^>]*>/i,
  /<div[^>]*id="viewer"[^>]*>/i,
  /<div[^>]*class="[^"]*\bviewer-container\b[^"]*"[^>]*>/i,
  /<div[^>]*class="[^"]*\bpage-break\b[^"]*"[^>]*>/i,
  /<div[^>]*class="[^"]*\bcontainer-chapter-reader\b[^"]*"[^>]*>/i, // manganato/natomanga
  /<div[^>]*class="[^"]*\bchapter-container\b[^"]*"[^>]*>/i,
  /<div[^>]*class="[^"]*\bchapter-images\b[^"]*"[^>]*>/i,
  /<div[^>]*class="[^"]*\bchapter-content\b[^"]*"[^>]*>/i,
  /<div[^>]*class="[^"]*\breader-content\b[^"]*"[^>]*>/i,
  /<div[^>]*class="[^"]*\bentry-content\b[^"]*"[^>]*>/i, // most generic WordPress wrapper — kept last, highest false-positive risk
];

const IMAGE_DENY_PATTERNS = [
  /logo/i, /banner/i, /\bads?\b/i, /sponsor/i, /avatar/i, /\bicon\b/i,
  /badge/i, /\bbutton\b/i, /patreon/i, /ko-?fi/i, /paypal/i, /\bdonate/i,
  /\bsocial\b/i, /share-?(icon|button)/i, /qrcode/i, /\bwidget\b/i,
  /placeholder/i, /\bspacer\b/i, /pixel\.(gif|png)/i, /tracking/i, /gravatar/i,
];

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? m[1] : null;
}

// Lazy-load placeholder attributes, roughly in the order real-world manga
// reader themes prefer them. `src` itself is deliberately last in the
// caller's fallback chain — most readers put a 1x1 placeholder/spinner GIF
// there and stash the real page URL in one of these instead.
const LAZY_SRC_ATTRS = [
  "data-src", "data-original", "data-lazy-src", "data-lazy-original",
  "data-cfsrc", "data-echo", "data-aload", "data-ils", "data-actual-src",
  "data-img-url", "data-url",
];

// Picks the highest-resolution candidate out of a `srcset`/`data-srcset`
// value ("url 320w, url 640w, ..." or "url 1x, url 2x, ..."). Manga page
// scans are rarely genuinely responsive, but a handful of readers do serve a
// low-res `src` placeholder alongside a full-res entry buried in srcset —
// worth the width-sort so we don't silently rehost a thumbnail.
function pickBestSrcset(srcset: string): string | null {
  let best: { url: string; score: number } | null = null;
  for (const entry of srcset.split(",")) {
    const [url, descriptor] = entry.trim().split(/\s+/, 2);
    if (!url) continue;
    const widthMatch = descriptor?.match(/^(\d+)w$/);
    const densityMatch = descriptor?.match(/^(\d+(?:\.\d+)?)x$/);
    const score = widthMatch ? Number(widthMatch[1]) : densityMatch ? Number(densityMatch[1]) * 1000 : 0;
    if (!best || score > best.score) best = { url, score };
  }
  return best?.url ?? null;
}

// Resolves the real image url out of an <img ...> tag, walking the same
// lazy-load-attribute → srcset → src fallback chain. Shared by the whole-
// gallery extractor below and the single-image-per-page extractor used by
// the sequential-pagination crawler.
function extractSrcFromTag(tag: string, baseUrl: string): string | null {
  let rawSrc: string | null = null;
  for (const name of LAZY_SRC_ATTRS) {
    rawSrc = attr(tag, name);
    if (rawSrc) break;
  }
  if (!rawSrc) {
    const srcset = attr(tag, "data-srcset") ?? attr(tag, "srcset");
    if (srcset) rawSrc = pickBestSrcset(srcset);
  }
  if (!rawSrc) rawSrc = attr(tag, "src");
  if (!rawSrc || rawSrc.startsWith("data:")) return null;
  try {
    return new URL(rawSrc, baseUrl).href;
  } catch {
    return null;
  }
}

function isDeniedImage(tag: string, rawSrc: string): boolean {
  const alt = attr(tag, "alt") ?? "";
  const cls = attr(tag, "class") ?? "";
  const hay = `${rawSrc} ${alt} ${cls}`.toLowerCase();
  if (IMAGE_DENY_PATTERNS.some((re) => re.test(hay))) return true;
  const w = Number(attr(tag, "width"));
  const h = Number(attr(tag, "height"));
  return (w > 0 && w <= 64) || (h > 0 && h <= 64); // tiny icons, not manga pages
}

function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const absUrl = extractSrcFromTag(tag, baseUrl);
    if (!absUrl || isDeniedImage(tag, absUrl)) continue;
    if (seen.has(absUrl)) continue;
    seen.add(absUrl);
    urls.push(absUrl);
  }
  return urls;
}

// Cloudflare-style interstitial markers — if a plain fetch lands on one of
// these instead of the real page, treat it as a failure and fall through to
// Byparr rather than returning a challenge page to the extractors above.
const CHALLENGE_MARKERS = [/just a moment/i, /cf-browser-verification/i, /__cf_chl_/i, /checking your browser/i];

// Every null-return branch below logs its specific reason — this used to be
// a silent black hole. A skipped chapter gave zero trail of WHETHER it hit a
// Cloudflare wall, an oversized doc, a plain HTTP error, or a Byparr
// failure, so every prior incident (MangaDex gap, CPU kill, OOM) had to be
// diagnosed from scratch. Fixed event name so log queries can filter on it.
function logFetchFail(url: string, reason: string): void {
  console.log(JSON.stringify({ event: "manga-chapter-content-fetch-html-fail", url, reason }));
}

async function fetchPageHtml(url: string): Promise<string | null> {
  // Always attempt a fast plain fetch first — most gallery/aggregator sites
  // aren't behind Cloudflare at all, and Byparr (real browser rendering) is
  // far more expensive. Only fall through to it when plain fetch fails or
  // the response looks like a bot-check interstitial rather than real HTML.
  try {
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.ok) {
      const text = await res.text();
      if (text.length > 500 && !CHALLENGE_MARKERS.some((re) => re.test(text))) {
        if (text.length > MAX_HTML_LEN) {
          logFetchFail(url, `plain_fetch_oversized (${text.length}b)`); // refuse rather than burn CPU regex-scanning it
          return null;
        }
        return text;
      }
      logFetchFail(url, text.length <= 500 ? "plain_fetch_too_short" : "plain_fetch_challenge_page");
    } else {
      logFetchFail(url, `plain_fetch_http_${res.status}`);
    }
  } catch (err) {
    logFetchFail(url, `plain_fetch_error: ${err instanceof Error ? err.message : String(err)}`);
  }
  const rendered = await byparrFetch(url);
  if (!rendered) {
    logFetchFail(url, "byparr_fetch_failed");
    return null;
  }
  if (rendered.length > MAX_HTML_LEN) {
    logFetchFail(url, `byparr_fetch_oversized (${rendered.length}b)`);
    return null;
  }
  return rendered;
}

// ---------------------------------------------------------------------------
// Sequential-pagination gallery crawl — one image per page url, page number
// incrementing in the path or query string (".../12/1/", ".../12/2/", ... or
// "?page=1", "?page=2", ...). Gated behind a real, page-confirmed multi-page
// total so an unrelated numeric path segment (an id, a chapter number) never
// gets misread as a page count.
// ---------------------------------------------------------------------------

interface PaginationTemplate {
  currentPage: number;
  build: (page: number) => string;
}

function buildPaginationTemplate(url: string): PaginationTemplate | null {
  const base = new URL(url);

  // Most common shape: trailing numeric path segment, e.g. "/g/70558/1/" or
  // "/read/some-chapter/3".
  const pathMatch = base.pathname.match(/^(.*\/)(\d+)(\/?)$/);
  if (pathMatch) {
    const [, prefix, numStr, suffix] = pathMatch;
    return {
      currentPage: Number(numStr),
      build: (page) => {
        const u = new URL(url);
        u.pathname = `${prefix}${page}${suffix}`;
        return u.href;
      },
    };
  }

  // Query-param shape: "?page=1" / "?p=1".
  for (const key of ["page", "p"]) {
    const val = base.searchParams.get(key);
    if (val && /^\d+$/.test(val)) {
      return {
        currentPage: Number(val),
        build: (page) => {
          const u = new URL(url);
          u.searchParams.set(key, String(page));
          return u.href;
        },
      };
    }
  }

  return null;
}

// Looks for a real, page-confirmed total page count in the first page's own
// markup — never guessed from the url. Checked in descending order of
// reliability: explicit "Page X of Y" text, a pagination widget's highest
// linked page number, a <select> of page numbers.
function detectTotalPages(html: string): number | null {
  const explicit = html.match(/\bpage\s+\d+\s+of\s+(\d+)\b/i);
  if (explicit) return Number(explicit[1]);

  const paginationBlock = html.match(
    /<(?:div|nav|ul)[^>]*class="[^"]*\bpagination\b[^"]*"[^>]*>([\s\S]*?)<\/(?:div|nav|ul)>/i,
  );
  if (paginationBlock) {
    const nums = [...paginationBlock[1].matchAll(/>\s*(\d+)\s*</g)].map((m) => Number(m[1]));
    if (nums.length > 0) return Math.max(...nums);
  }

  const selectBlock = html.match(/<select[^>]*(?:name|id)="[^"]*\bpage\b[^"]*"[^>]*>([\s\S]*?)<\/select>/i);
  if (selectBlock) {
    const opts = [...selectBlock[1].matchAll(/<option[^>]*value="(\d+)"/gi)].map((m) => Number(m[1]));
    if (opts.length > 0) return Math.max(...opts);
  }

  return null;
}

// Containers/attributes commonly used to mark "this is the current page's
// full-size image" on single-image-per-page gallery readers.
const PER_PAGE_CONTAINER_SELECTORS: RegExp[] = [
  /<div[^>]*id="image"[^>]*>/i,
  /<div[^>]*id="img"[^>]*>/i,
  /<div[^>]*class="[^"]*\bimage-container\b[^"]*"[^>]*>/i,
  /<div[^>]*class="[^"]*\bfull-image\b[^"]*"[^>]*>/i,
  /<div[^>]*class="[^"]*\bpage-image\b[^"]*"[^>]*>/i,
];

const DIRECT_IMG_RE =
  /<img\b[^>]*(?:id|class)\s*=\s*["'][^"']*\b(?:image|current-page|page-image|full-image|chapter-img|reader-image)\b[^"']*["'][^>]*>/i;

function extractCurrentPageImage(html: string, pageUrl: string): string | null {
  const direct = html.match(DIRECT_IMG_RE);
  if (direct) {
    const src = extractSrcFromTag(direct[0], pageUrl);
    if (src && !isDeniedImage(direct[0], src)) return src;
  }

  for (const selector of PER_PAGE_CONTAINER_SELECTORS) {
    const inner = extractBalancedElement(html, selector, "div");
    if (!inner) continue;
    const [first] = extractImageUrls(inner, pageUrl);
    if (first) return first;
  }

  // Last resort: first non-denied, non-tiny image anywhere on the page.
  // Lower confidence than the targeted paths above, but per-page-image
  // gallery layouts usually only render one real image at all.
  const [first] = extractImageUrls(html, pageUrl);
  return first ?? null;
}

async function extractSequentialGallery(url: string): Promise<ExtractOutcome> {
  const pagination = buildPaginationTemplate(url);
  if (!pagination) return { fail: "sequential_no_pagination_shape" };

  const firstHtml = await fetchPageHtml(url);
  if (!firstHtml) return { fail: "sequential_fetch_failed" };

  const total = detectTotalPages(firstHtml);
  if (!total || total < MULTI_PAGE_MIN) return { fail: "sequential_no_confirmed_total" }; // no confirmed multi-page total — let generic extraction handle it

  const firstPageImage = extractCurrentPageImage(firstHtml, url);
  if (!firstPageImage) return { fail: "sequential_no_current_page_image" }; // doesn't look like a single-image-per-page layout at all

  const buildPageUrl = pagination.build; // captured non-nullably for the closures below
  const currentPage = pagination.currentPage;

  const pageCount = Math.min(total, MAX_SEQUENTIAL_PAGES);
  const results = new Array<string | null>(pageCount).fill(null);
  results[currentPage - 1] = firstPageImage;

  const pending: number[] = [];
  for (let n = 1; n <= pageCount; n++) {
    if (n !== currentPage) pending.push(n);
  }

  let cursor = 0;
  let deadlineHit = false;
  const crawlDeadline = Date.now() + CPU_BUDGET_MS;
  async function worker() {
    for (;;) {
      if (Date.now() > crawlDeadline) { deadlineHit = true; return; } // CPU circuit breaker — stop crawling, use whatever pages landed so far
      const idx = cursor++;
      if (idx >= pending.length) return;
      const n = pending[idx];
      const pageUrl = buildPageUrl(n);
      const html = await fetchPageHtml(pageUrl);
      if (html) results[n - 1] = extractCurrentPageImage(html, pageUrl);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SEQUENTIAL_FETCH_CONCURRENCY, pending.length) }, worker),
  );
  if (deadlineHit) {
    console.log(JSON.stringify({ event: "manga-chapter-content-cpu-budget-hit", url, phase: "sequential-crawl", crawled: results.filter(Boolean).length, of: pageCount }));
  }

  const rawUrls = results.filter((u): u is string => !!u);
  if (rawUrls.length < MULTI_PAGE_MIN) return { fail: `sequential_too_few_pages_crawled (${rawUrls.length}/${pageCount}${deadlineHit ? ", cpu_budget_exceeded" : ""})` };

  const pages = await rehostPageImages(rawUrls, url);
  return { pages, source: "generic (sequential pagination)" };
}

async function extractGeneric(url: string): Promise<ExtractOutcome> {
  const raw = await fetchPageHtml(url);
  if (!raw) return { fail: "generic_fetch_failed" };

  // Remember the first selector match that only turned up a single image —
  // trusted as a real (if short) chapter only if nothing stronger shows up
  // in the rest of the loop, since a matched reader-container selector is
  // itself high-confidence evidence even at page count 1 (oneshots,
  // single-strip webtoon chapters — these used to be rejected outright).
  let singlePage: string[] | null = null;
  const deadline = Date.now() + CPU_BUDGET_MS;
  let deadlineHit = false;
  let matchedSelectorCount = 0;

  for (const selector of GENERIC_SELECTORS) {
    if (Date.now() > deadline) { deadlineHit = true; break; } // CPU circuit breaker — stop scanning, fall through to whatever we've got
    const inner = extractBalancedElement(raw, selector, "div");
    if (!inner) continue;
    matchedSelectorCount++;
    const rawUrls = extractImageUrls(inner, url);
    if (rawUrls.length >= MULTI_PAGE_MIN) {
      const pages = await rehostPageImages(rawUrls, url);
      return { pages, source: "generic" };
    }
    if (rawUrls.length === 1 && !singlePage) singlePage = rawUrls;
  }
  if (deadlineHit) {
    console.log(JSON.stringify({ event: "manga-chapter-content-cpu-budget-hit", url, phase: "generic-selector-scan" }));
  }

  if (singlePage) {
    const pages = await rehostPageImages(singlePage, url);
    return { pages, source: "generic (single-page)" };
  }

  // Last resort: every <img> on the whole page. No confirmation this is
  // actually the reader (vs. related-series thumbnails elsewhere on the
  // page), so hold it to a much higher page count than the targeted path.
  const allUrls = extractImageUrls(raw, url);
  if (allUrls.length >= WHOLE_PAGE_MIN) {
    const pages = await rehostPageImages(allUrls, url);
    return { pages, source: "generic (whole page, low confidence)" };
  }

  return {
    fail: `generic_no_reader_match (selectors_matched=${matchedSelectorCount}, whole_page_imgs=${allUrls.length}${deadlineHit ? ", cpu_budget_exceeded" : ""})`,
  };
}

// Tries each extractor in order, stopping at the first success. Collects
// every fail reason along the way so a total miss reports exactly which
// paths were tried and why each one bailed, instead of one generic string.
async function firstOk(fns: Array<() => Promise<ExtractOutcome>>): Promise<ExtractOutcome> {
  const fails: string[] = [];
  for (const fn of fns) {
    const r = await fn();
    if (isOk(r)) return r;
    fails.push(r.fail);
  }
  return { fail: fails.join(" | ") };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  let body: any;
  try { body = await req.json(); } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { url, chapter_id: chapterId } = body;
  if (typeof url !== "string" || !url.trim() || url === "#") {
    return jsonResponse({ error: "Missing or invalid required field: url" }, 400);
  }

  let parsedUrl: URL;
  try { parsedUrl = new URL(url); } catch {
    return jsonResponse({ error: "url is not a valid URL" }, 400);
  }

  // Logged before any heavy scraping work runs, specifically so a CPU/memory
  // limit kill (supervisor cancels the isolate mid-flight, no response ever
  // sent) still leaves a trail of which chapter/url triggered it.
  console.log(JSON.stringify({ event: "manga-chapter-content-start", chapterId: chapterId ?? null, url, hostname: parsedUrl.hostname }));

  try {
    const mdxMatch = url.match(MANGADEX_CHAPTER_RE);
    // MangaDex used to be a dead end on its own: a null return (404, region
    // lock, hash rotated, empty at-home response) meant the ternary never
    // reached the generic extractors at all, even though the same url can
    // still carry a working reader page. Every non-MangaDex url already got
    // two fallback attempts; MangaDex urls got exactly one shot with zero
    // rescue — the single biggest silent-skip source given how many
    // chapters manga-chapter-search hands out as mangadex.org links.
    const result = mdxMatch
      ? await firstOk([
          () => extractMangaDex(mdxMatch[1]),
          () => extractSequentialGallery(url),
          () => extractGeneric(url),
        ])
      : await firstOk([
          () => extractSequentialGallery(url),
          () => extractGeneric(url),
        ]);

    if (!isOk(result) || result.pages.length === 0) {
      const reason = isOk(result) ? "all extractors returned zero pages" : result.fail;
      console.log(JSON.stringify({ event: "manga-chapter-content-fail", chapterId: chapterId ?? null, url, hostname: parsedUrl.hostname, reason }));
      langfuseTrace({ name: "manga-chapter-content-fetch", model: "scrape", input: { url }, output: { success: false, reason }, metadata: { hostname: parsedUrl.hostname } });
      return jsonResponse({
        success: false,
        reason: `Could not extract page images from this URL (${reason}). It may be hosted externally with no in-app-readable pages, require login/JS rendering we can't clear, or use a reader layout we don't recognize yet.`,
      });
    }

    // Combine the ordered page images into a single long-strip image (the
    // usual webtoon/manga-reader presentation) instead of storing N separate
    // page rows. Best-effort: if stitching fails for any reason (decode
    // error, a page too large, combined height over the safety cap), fall
    // back to the original per-page array untouched — reading in N pages is
    // strictly better than a broken/empty chapter.
    //
    // Only trivially small chapters (<= SYNC_STITCH_MAX_PAGES) stitch
    // synchronously in this isolate. Repeated live CPU-limit kills (two
    // separate incidents, the second one AFTER the page cap was already
    // lowered once) proved page-count tuning alone can't keep imagescript's
    // synchronous WASM decode/composite under this isolate's CPU budget — so
    // essentially every real chapter now always offloads to the Kestra
    // async stitch flow instead (requires chapter_id; without one we just
    // return the paged array untouched rather than risk another kill).
    let pages = result.pages;
    let stitched = false;
    let stitchPending = false;

    if (result.pages.length > SYNC_STITCH_MAX_PAGES) {
      if (typeof chapterId === "string" && chapterId.trim()) {
        stitchPending = await triggerAsyncStitch(chapterId, result.pages);
      }
    } else {
      const stitchedUrl = await stitchPagesIntoStrip(result.pages);
      pages = stitchedUrl ? [stitchedUrl] : result.pages;
      stitched = !!stitchedUrl && result.pages.length > 1;
    }

    langfuseTrace({
      name: "manga-chapter-content-fetch",
      model: "scrape",
      input: { url },
      output: { success: true, page_count: result.pages.length, source: result.source, stitched, stitchPending },
      metadata: { hostname: parsedUrl.hostname },
    });

    return jsonResponse({
      success: true,
      pages,
      page_count: result.pages.length,
      source: result.source,
      stitched,
      stitch_pending: stitchPending,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ event: "manga-chapter-content-uncaught", chapterId: chapterId ?? null, url, hostname: parsedUrl.hostname, reason }));
    return jsonResponse({ success: false, reason: `Fetch failed: ${reason}` }, 200);
  }
});
