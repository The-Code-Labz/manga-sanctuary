import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsResponse,
  jsonResponse,
  langfuseTrace,
  byparrFetch,
  BROWSER_UA,
  extractBalancedElement,
  rehostPageImages,
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
// Fallback path: for any other URL (an admin manually pasted a mangakakalot/
// asurascans/etc. link, or MangaDex only had an externalUrl with no
// self-hosted pages), best-effort generic <img>-gallery extraction from
// common manga-reader container selectors. Honest failure semantics kept
// from novel's version: success:false means "keep the external link,
// in-app reading isn't available for this chapter", not an error.
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

// ---------------------------------------------------------------------------
// MangaDex — official at-home/server API
// ---------------------------------------------------------------------------

const MANGADEX_CHAPTER_RE = /mangadex\.org\/chapter\/([0-9a-f-]{36})/i;

async function extractMangaDex(
  chapterId: string,
): Promise<{ pages: string[]; source: string } | null> {
  try {
    const res = await fetch(`https://api.mangadex.org/at-home/server/${chapterId}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null; // 404 here typically means an externally-hosted chapter (no MangaDex-hosted pages)
    const data = await res.json();
    const baseUrl = data?.baseUrl;
    const hash = data?.chapter?.hash;
    const files: string[] = Array.isArray(data?.chapter?.data) ? data.chapter.data : [];
    if (!baseUrl || !hash || files.length === 0) return null;

    const rawUrls = files.map((f) => `${baseUrl}/data/${hash}/${f}`);
    const pages = await rehostPageImages(rawUrls, `https://mangadex.org/chapter/${chapterId}`);
    return { pages, source: "MangaDex" };
  } catch {
    return null;
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

function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
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
    if (!rawSrc || rawSrc.startsWith("data:")) continue;
    const alt = attr(tag, "alt") ?? "";
    const cls = attr(tag, "class") ?? "";
    const hay = `${rawSrc} ${alt} ${cls}`.toLowerCase();
    if (IMAGE_DENY_PATTERNS.some((re) => re.test(hay))) continue;
    const w = Number(attr(tag, "width"));
    const h = Number(attr(tag, "height"));
    if ((w > 0 && w <= 64) || (h > 0 && h <= 64)) continue; // tiny icons, not manga pages
    let absUrl: string;
    try {
      absUrl = new URL(rawSrc, baseUrl).href;
    } catch {
      continue;
    }
    if (seen.has(absUrl)) continue;
    seen.add(absUrl);
    urls.push(absUrl);
  }
  return urls;
}

// Domains observed to not sit behind Cloudflare — plain fetch first, faster
// than routing everything through Byparr unconditionally. Falls through to
// Byparr on failure (covers a future Cloudflare rollout on these hosts).
const PLAIN_FETCH_DOMAINS: RegExp[] = [
  /(^|\.)mangakatana\.com$/i,
];

async function fetchPageHtml(url: string, hostname: string): Promise<string | null> {
  if (PLAIN_FETCH_DOMAINS.some((re) => re.test(hostname))) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.ok) return await res.text();
    } catch { /* fall through to Byparr below */ }
  }
  return await byparrFetch(url);
}

async function extractGeneric(url: string): Promise<{ pages: string[]; source: string } | null> {
  const raw = await fetchPageHtml(url, new URL(url).hostname);
  if (!raw) return null;

  // Remember the first selector match that only turned up a single image —
  // trusted as a real (if short) chapter only if nothing stronger shows up
  // in the rest of the loop, since a matched reader-container selector is
  // itself high-confidence evidence even at page count 1 (oneshots,
  // single-strip webtoon chapters — these used to be rejected outright).
  let singlePage: string[] | null = null;

  for (const selector of GENERIC_SELECTORS) {
    const inner = extractBalancedElement(raw, selector, "div");
    if (!inner) continue;
    const rawUrls = extractImageUrls(inner, url);
    if (rawUrls.length >= MULTI_PAGE_MIN) {
      const pages = await rehostPageImages(rawUrls, url);
      return { pages, source: "generic" };
    }
    if (rawUrls.length === 1 && !singlePage) singlePage = rawUrls;
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

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  let body: any;
  try { body = await req.json(); } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { url } = body;
  if (typeof url !== "string" || !url.trim() || url === "#") {
    return jsonResponse({ error: "Missing or invalid required field: url" }, 400);
  }

  let parsedUrl: URL;
  try { parsedUrl = new URL(url); } catch {
    return jsonResponse({ error: "url is not a valid URL" }, 400);
  }

  try {
    const mdxMatch = url.match(MANGADEX_CHAPTER_RE);
    const result = mdxMatch ? await extractMangaDex(mdxMatch[1]) : await extractGeneric(url);

    if (!result || result.pages.length === 0) {
      langfuseTrace({ name: "manga-chapter-content-fetch", model: "scrape", input: { url }, output: { success: false }, metadata: { hostname: parsedUrl.hostname } });
      return jsonResponse({
        success: false,
        reason: "Could not extract page images from this URL. It may be hosted externally with no in-app-readable pages, require login/JS rendering we can't clear, or use a reader layout we don't recognize yet.",
      });
    }

    langfuseTrace({ name: "manga-chapter-content-fetch", model: "scrape", input: { url }, output: { success: true, page_count: result.pages.length, source: result.source }, metadata: { hostname: parsedUrl.hostname } });

    return jsonResponse({
      success: true,
      pages: result.pages,
      page_count: result.pages.length,
      source: result.source,
    });
  } catch (err) {
    return jsonResponse({ success: false, reason: `Fetch failed: ${err instanceof Error ? err.message : String(err)}` }, 200);
  }
});
