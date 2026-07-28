import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsResponse,
  jsonResponse,
  langfuseTrace,
  byparrFetch,
  BROWSER_UA,
  extractBalancedElement,
  htmlToReadableText,
} from "../_shared/utils.ts";

// ---------------------------------------------------------------------------
// Scrapes the actual chapter text from an external reading URL so it can be
// stored and read in-app instead of always redirecting the user offsite.
//
// Royal Road: plain fetch, no Cloudflare gate, real `.chapter-inner` div —
// same reliability tier as the structured RR chapter-list scrape.
// Everything else: Byparr (clears Cloudflare/Turnstile) + a generic
// candidate-selector + largest-<p>-block heuristic. Best-effort — many
// platforms (WebNovel premium chapters, JS-hydrated readers) may not yield
// usable text; callers should treat `success:false` as "keep the external
// link, in-app reading isn't available for this chapter" rather than an error.
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 25_000;
const MIN_WORDS = 80; // below this, treat extraction as noise (nav/ads), not a real chapter
// The "concatenate every remaining <p>" last-resort fallback has no idea
// whether it's actually looking at chapter prose or a stripped-down footer/
// nav dump — live-tested against a WebNovel 404-style page and it happily
// cleared MIN_WORDS with site-footer/social-link text. Hold it to a much
// higher bar than the targeted container selectors.
const MIN_WORDS_LAST_RESORT = 250;

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

// Catches "this page doesn't exist / requires login / try again" stubs that
// Byparr can still render (200 OK) but that are not the chapter at all —
// live-tested case: WebNovel served one of these for a URL that no longer
// resolves to real chapter text, and it would've been captured as content
// otherwise.
const ERROR_PAGE_MARKERS = [
  /\bwhoops[!.]?\s+we might have some troubles\b/i,
  /\bpage not found\b/i,
  /\b404 error\b/i,
  /\bwe couldn'?t find (that|this) page\b/i,
  /\bsign in to (continue|read)\b/i,
  /\bplease log ?in to (continue|read)\b/i,
];

function looksLikeErrorPage(text: string): boolean {
  return ERROR_PAGE_MARKERS.some((re) => re.test(text));
}

async function extractRoyalRoad(url: string): Promise<{ content: string; source: string } | null> {
  const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  const html = await res.text();
  const inner = extractBalancedElement(html, /<div[^>]*class="[^"]*chapter-inner[^"]*"[^>]*>/i, "div");
  if (!inner) return null;
  const text = htmlToReadableText(inner);
  if (wordCount(text) < MIN_WORDS) return null;
  return { content: text, source: "Royal Road" };
}

// Candidate containers used across common web-novel reader platforms
// (WebNovel, ScribbleHub, NovelUpdates-hosted mirrors, WordPress-based
// translator blogs, etc.) — tried in order, first one clearing MIN_WORDS wins.
const GENERIC_SELECTORS: RegExp[] = [
  /<div[^>]*class="[^"]*chapter-content[^"]*"[^>]*>/i,
  /<div[^>]*class="[^"]*reading-content[^"]*"[^>]*>/i,
  /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>/i,
  /<div[^>]*class="[^"]*cha-words[^"]*"[^>]*>/i, // webnovel.com
  /<div[^>]*class="[^"]*chapter-text[^"]*"[^>]*>/i,
  /<div[^>]*id="chapter-content"[^>]*>/i,
  /<div[^>]*class="[^"]*text-left[^"]*"[^>]*>/i,
  /<article[^>]*>/i,
];

// Live-testing against a real WebNovel chapter page caught this: with only
// nav/header/footer stripped, the generic "every <p>" fallback happily
// cleared MIN_WORDS by concatenating a cookie-consent/GDPR banner (~200
// words of "we and our 15 partners use cookies..." boilerplate) and returned
// it AS the chapter — a confident false positive, not an honest failure.
// Strip known consent-management-platform containers by their near-universal
// id/class conventions (OneTrust, Cookiebot, Quantcast, TrustArc, generic
// cookieconsent.js) before any extraction runs.
function stripBoilerplate(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<div[^>]*id="onetrust-banner-sdk"[^>]*>[\s\S]*?<\/div>\s*(<\/div>)?/gi, "")
    .replace(/<div[^>]*class="[^"]*(?:cookie-?consent|cookie-?banner|cc-window|gdpr-?consent|consent-banner|qc-cmp)[^"]*"[^>]*>[\s\S]*?<\/div>\s*(<\/div>)?/gi, "")
    .replace(/<div[^>]*id="[^"]*(?:cookie-?consent|cookie-?banner|gdpr)[^"]*"[^>]*>[\s\S]*?<\/div>\s*(<\/div>)?/gi, "");
}

// Second line of defense: even after stripping known containers, a banner
// injected via a generic wrapper can still slip through. Reject any
// candidate block that reads like consent boilerplate rather than prose —
// real chapter text essentially never combines this many of these terms.
const BOILERPLATE_MARKERS = [
  /\bcookies?\b/i, /\bconsent\b/i, /\bpartners?\b.{0,20}\bprocess\b/i,
  /\bpersonal data\b/i, /\bip address(es)?\b/i, /\bprivacy policy\b/i,
  /\blegitimate (business )?interest/i,
  // Site-footer/nav dumps — live-tested case: a stub "page not found" page's
  // leftover footer (social links, copyright, site nav) cleared MIN_WORDS
  // once the cookie-banner-specific markers above were fixed.
  /\bterms of service\b/i, /\bcookie policy\b/i, /©\s?\d{4}/, /\bdmca\b/i,
  /\binstagram\s+tiktok\s+twitter\b/i, /\bdownload apps?\b/i, /\baffiliate\b/i,
];

function looksLikeBoilerplate(text: string, threshold = 3): boolean {
  const hits = BOILERPLATE_MARKERS.filter((re) => re.test(text)).length;
  return hits >= threshold;
}

function extractAllParagraphs(html: string): string {
  const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => htmlToReadableText(m[1]));
  return paras.filter((p) => p.length > 0 && !looksLikeBoilerplate(p, 2)).join("\n\n");
}

async function extractGeneric(url: string): Promise<{ content: string; source: string } | null> {
  const raw = await byparrFetch(url);
  if (!raw) return null;
  if (looksLikeErrorPage(raw)) return null;
  const html = stripBoilerplate(raw);

  for (const selector of GENERIC_SELECTORS) {
    const tagName = selector.source.startsWith("<article") ? "article" : "div";
    const inner = extractBalancedElement(html, selector, tagName);
    if (!inner) continue;
    const text = htmlToReadableText(inner);
    if (wordCount(text) >= MIN_WORDS && !looksLikeBoilerplate(text)) return { content: text, source: "generic" };
  }

  // Last resort: every <p> on the (nav/ads-stripped) page, concatenated.
  // No targeted container matched, so we have no confirmation this is
  // actually chapter prose rather than a stripped-down page shell — hold it
  // to a much higher word count than the targeted-selector path above.
  const allParas = extractAllParagraphs(html);
  if (wordCount(allParas) >= MIN_WORDS_LAST_RESORT && !looksLikeBoilerplate(allParas, 2)) {
    return { content: allParas, source: "generic (all paragraphs, low confidence)" };
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
    const isRoyalRoad = /(^|\.)royalroad\.com$/i.test(parsedUrl.hostname);
    const result = isRoyalRoad ? await extractRoyalRoad(url) : await extractGeneric(url);

    if (!result) {
      langfuseTrace({ name: "chapter-content-fetch", model: "scrape", input: { url }, output: { success: false }, metadata: { hostname: parsedUrl.hostname } });
      return jsonResponse({
        success: false,
        reason: "Could not extract readable chapter text from this URL. The site may require login, JS rendering we can't clear, or use a layout we don't recognize yet.",
      });
    }

    const wc = wordCount(result.content);
    langfuseTrace({ name: "chapter-content-fetch", model: "scrape", input: { url }, output: { success: true, word_count: wc, source: result.source }, metadata: { hostname: parsedUrl.hostname } });

    return jsonResponse({
      success: true,
      content: result.content,
      word_count: wc,
      source: result.source,
    });
  } catch (err) {
    return jsonResponse({ success: false, reason: `Fetch failed: ${err instanceof Error ? err.message : String(err)}` }, 200);
  }
});
