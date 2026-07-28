import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsResponse,
  jsonResponse,
  repairJson,
  callLiteRouter,
  voidAIErrorResponse,
  extractContent,
  langfuseTrace,
  getSearxConfig,
  searchSearx,
  titlesMatch,
  BROWSER_UA,
  type SearxConfig,
} from "../_shared/utils.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// AI self-search is now a LAST-RESORT fallback, not the default path —
// same demotion novel-metadata-v2 got. It only fires when no structured
// source (currently: Royal Road) produces a real chapter list.
// Was VoidAI sonar-pro (persistently 500ing account-wide); switched to
// LiteRouter's gpt-4o-mini-search-preview — live-verified working.
const FALLBACK_MODEL = Deno.env.get("NOVEL_CHAPTER_FALLBACK_MODEL") ?? "gpt-4o-mini-search-preview";

// Sane ceiling so a hallucinated total_chapters can't build an unbounded
// placeholder array (was previously an uncapped `for (i=1;i<=totalChapters)`).
const MAX_CHAPTERS = 3000;

// A single completion asking for hundreds of chapters at once both truncates
// (16k output tokens ≈ 300-400 short entries) and gets less accurate per-title
// as the ask grows. Chinese web novels routinely run 600-3000+ chapters, so
// the fallback path is now BATCHED: the caller (frontend) drives a loop,
// each request returning one BATCH_SIZE-chapter slice + a cursor for the
// next one, instead of one giant all-or-nothing call.
const BATCH_SIZE = 60;

const FETCH_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 2;

interface Chapter {
  chapter_number: number;
  chapter_title: string;
  external_url: string | null;
  volume_number: number | null;
  volume_title: string | null;
  is_placeholder?: boolean;
}

interface Structure {
  has_volumes: boolean;
  total_volumes: number;
  total_chapters: number;
  source: string;
  has_named_chapters: boolean;
}

// ---------------------------------------------------------------------------
// Royal Road — plain fetch (no Cloudflare gate), real chronological chapter
// table with real per-chapter URLs. No LLM guessing needed at all when this
// hits: `<table id="chapters" data-chapters="N">` with one <tr> per chapter,
// each carrying data-url pointing straight at the reader page. RR's table is
// present in full in the initial page HTML regardless of chapter count (no
// batching needed for this source — verified against a 700+ chapter title).
// ---------------------------------------------------------------------------

async function findRoyalRoadUrl(title: string, searxConfig: SearxConfig | null): Promise<string | null> {
  if (!searxConfig) return null;
  const results = await searchSearx(`site:royalroad.com/fiction "${title}"`, searxConfig, 5);
  return results.find((r) => /royalroad\.com\/fiction\/\d+/.test(r.url))?.url ?? null;
}

function parseRoyalRoadChapters(html: string): { title: string | null; chapters: Chapter[] } | null {
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let pageTitle: string | null = null;
  if (ldMatch) {
    try { pageTitle = JSON.parse(ldMatch[1])?.name ?? null; } catch { /* ignore malformed JSON-LD */ }
  }
  if (!pageTitle) pageTitle = html.match(/property="og:title" content="([^"]+)"/)?.[1] ?? null;

  const tableMatch = html.match(/<table[^>]*id="chapters"[^>]*>[\s\S]*?<\/table>/);
  if (!tableMatch) return null;
  const table = tableMatch[0];

  const rowRegex = /<tr[^>]*data-url="([^"]+)"[^>]*data-volume-id="([^"]*)"[^>]*class="chapter-row"[\s\S]*?<a[^>]*>\s*([^<]+?)\s*<\/a>/g;
  const chapters: Chapter[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = rowRegex.exec(table)) !== null) {
    idx += 1;
    const [, relUrl, volId, rawTitle] = match;
    const chapterTitle = rawTitle.trim().replace(/&#x2019;/g, "’").replace(/&amp;/g, "&");
    // Strip a leading "N. " numbering prefix RR bakes into the link text —
    // keep the real title, use the row position as the authoritative number.
    const cleanTitle = chapterTitle.replace(/^\d+\.\s*/, "") || chapterTitle;
    chapters.push({
      chapter_number: idx,
      chapter_title: cleanTitle,
      external_url: relUrl.startsWith("http") ? relUrl : `https://www.royalroad.com${relUrl}`,
      volume_number: volId && volId !== "null" ? Number(volId) || null : null,
      volume_title: null,
    });
  }

  if (chapters.length === 0) return null;
  return { title: pageTitle, chapters };
}

async function fetchRoyalRoadChapters(
  title: string,
  searxConfig: SearxConfig | null,
): Promise<{ chapters: Chapter[]; hasVolumes: boolean; url: string } | null> {
  const url = await findRoyalRoadUrl(title, searxConfig);
  if (!url) return null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const html = await res.text();
    const parsed = parseRoyalRoadChapters(html);
    if (!parsed || !titlesMatch(title, parsed.title)) return null;
    const hasVolumes = parsed.chapters.some((c) => c.volume_number !== null);
    return { chapters: parsed.chapters, hasVolumes, url };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// LiteRouter AI self-search fallback — last resort only, with retry/backoff
// on transient errors (previously a bare uncaught fetch()).
// ---------------------------------------------------------------------------

// LiteRouter enforces a per-key cooldown between messages (observed: 7s on
// this tier) and reports it as a 403 with "Rate limit exceeded ... cooldown"
// in the body — NOT a 429. Since a batched job makes many sequential calls
// (one structure-detect + one per BATCH_SIZE chapters), every call after the
// first needs to wait out this cooldown. LITEROUTER_COOLDOWN_MS is the floor
// we sleep before every call after the first, plus the retry path detects
// the cooldown message specifically (vs. a real 403 auth failure).
const LITEROUTER_COOLDOWN_MS = 8_000;
let lastLiteRouterCallAt = 0;

async function callAIWithRetry(
  apiKey: string,
  messages: { role: "system" | "user"; content: string }[],
  maxTokens: number,
): Promise<Response> {
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const waitFor = LITEROUTER_COOLDOWN_MS - (Date.now() - lastLiteRouterCallAt);
    if (lastLiteRouterCallAt > 0 && waitFor > 0) await new Promise((r) => setTimeout(r, waitFor));
    try {
      lastLiteRouterCallAt = Date.now();
      const res = await callLiteRouter(apiKey, messages, {
        model: FALLBACK_MODEL,
        max_tokens: maxTokens,
      });
      if (res.ok) return res;
      const bodyText = await res.text().catch(() => "");
      const isCooldown = res.status === 403 && /rate limit|cooldown/i.test(bodyText);
      if (!isCooldown && res.status !== 429 && res.status < 500) {
        return new Response(bodyText, { status: res.status, headers: res.headers });
      }
      lastRes = new Response(bodyText, { status: res.status, headers: res.headers });
    } catch {
      /* network error — retry */
    }
    if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, LITEROUTER_COOLDOWN_MS));
  }
  return lastRes ?? new Response(null, { status: 502 });
}

async function fallbackSonarStructure(title: string, apiKey: string): Promise<any> {
  const messages: { role: "system" | "user"; content: string }[] = [
    {
      role: "system",
      content: `You are a web novel and light novel structure researcher. Search the internet to determine the chapter/volume structure of a novel.

Search NovelUpdates (novelupdates.com), WebNovel, the original platform (Syosetu, Kakuyomu, Qidian, Royal Road, etc.), and fan wikis.

Determine:
1. Does this novel use VOLUMES (e.g., Vol. 1, Vol. 2) that contain chapters? Or is it a flat list of chapters?
2. How many volumes are there (if any)?
3. How many total chapters are there?
4. Is there a URL pattern for reading chapters?
5. Do chapters have unique named titles beyond just "Chapter X"?

Return ONLY a valid JSON object. No markdown, no code fences.

JSON structure:
{
  "has_volumes": true,
  "total_volumes": 5,
  "total_chapters": 250,
  "source": "NovelUpdates",
  "base_reading_url": "https://example.com/novel/vol-{v}-ch-{n}" or null,
  "has_named_chapters": true,
  "structure_notes": "Brief description of how the novel is structured"
}

If has_volumes is false, total_volumes should be 0 or null.`,
    },
    {
      role: "user",
      content: `Determine the chapter/volume structure for the novel "${title}". Return ONLY a JSON object.`,
    },
  ];

  const res = await callAIWithRetry(apiKey, messages, 2048);
  if (!res.ok) return { error: true, status: res.status };
  const data = await res.json();
  try {
    return { error: false, structure: repairJson(extractContent(data)) };
  } catch {
    return { error: false, structure: { has_volumes: false, total_volumes: 0, total_chapters: 0, source: "AI" } };
  }
}

// Fetches ONE slice of the chapter list [rangeStart, rangeEnd] instead of
// the whole novel in one shot — keeps every completion small enough to be
// both accurate (model isn't rushing through hundreds of titles) and
// complete (never silently truncated by max_tokens on large novels).
async function fallbackSonarChapterList(
  title: string,
  apiKey: string,
  hasVolumes: boolean,
  totalVolumes: number,
  totalChapters: number,
  rangeStart: number,
  rangeEnd: number,
): Promise<any> {
  const messages: { role: "system" | "user"; content: string }[] = [
    {
      role: "system",
      content: `You are a chapter list researcher for light novels and web novels. Search the internet to find chapters for a novel.

Search NovelUpdates (novelupdates.com), WebNovel, the original platform, fan translation sites, and wikis.

${hasVolumes
  ? `This novel is organized into VOLUMES with chapters inside them. Return each chapter with its volume number and volume title.`
  : `This novel has a flat chapter list (no volumes).`}

You only need to return chapters numbered ${rangeStart} through ${rangeEnd} (of ${totalChapters} total) — this is one slice of a larger list being fetched in batches. Do not return chapters outside this range.

Return ONLY a valid JSON object. No markdown, no code fences.

JSON structure:
{
  "chapters": [
    ${hasVolumes
      ? `{ "volume_number": 1, "volume_title": "Volume 1: The Beginning", "chapter_number": ${rangeStart}, "chapter_title": "Prologue", "url": "https://..." }`
      : `{ "chapter_number": ${rangeStart}, "chapter_title": "Prologue", "url": "https://..." }`
    }
  ]
}

RULES:
- List every chapter you can find numbered ${rangeStart}-${rangeEnd} (inclusive)
- chapter_number should be the chapter's GLOBAL/overall number (${rangeStart} to ${rangeEnd}), not renumbered within this slice
- If a chapter has no special title, use "Chapter X" format
- Use "#" for url if no reading link is available
- volume_title can be null if the volume has no name`,
    },
    {
      role: "user",
      content: `Find chapters ${rangeStart} through ${rangeEnd} for "${title}". ${hasVolumes ? `It has ${totalVolumes} volumes and ${totalChapters} total chapters.` : `It has ${totalChapters} chapters in a flat list.`} Return ONLY a JSON object.`,
    },
  ];

  const res = await callAIWithRetry(apiKey, messages, 8192);
  if (!res.ok) return { error: true, status: res.status };
  const data = await res.json();
  try {
    return { error: false, parsed: repairJson(extractContent(data)) };
  } catch {
    return { error: false, parsed: { chapters: [] } };
  }
}

function buildBatchResult(
  chapters: Chapter[],
  structure: Structure,
  rangeStart: number,
  rangeEnd: number,
) {
  // Gap-fill only WITHIN this batch's own range — flagged, never silently
  // fabricated as indistinguishable from a real AI-found chapter.
  let placeholderCount = 0;
  if (!structure.has_volumes) {
    const existingNums = new Set(chapters.map((c) => c.chapter_number));
    for (let i = rangeStart; i <= rangeEnd; i++) {
      if (!existingNums.has(i)) {
        chapters.push({
          chapter_number: i, chapter_title: `Chapter ${i}`, external_url: null,
          volume_number: null, volume_title: null, is_placeholder: true,
        });
        placeholderCount++;
      }
    }
    chapters.sort((a, b) => a.chapter_number - b.chapter_number);
  }

  const nextStart = rangeEnd < structure.total_chapters ? rangeEnd + 1 : null;

  return {
    chapters,
    total_chapters: structure.total_chapters,
    has_volumes: structure.has_volumes,
    total_volumes: structure.total_volumes,
    source: structure.source,
    has_named_chapters: structure.has_named_chapters,
    placeholder_count: placeholderCount,
    _source_type: "fallback",
    structure,
    range_start: rangeStart,
    range_end: rangeEnd,
    next_range_start: nextStart,
    done: nextStart === null,
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  let body: any;
  try { body = await req.json(); } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { title, structure: passedStructure, range_start } = body;
  if (typeof title !== "string" || !title.trim()) {
    return jsonResponse({ error: "Missing required field: title (must be a non-empty string)" }, 400);
  }

  const LITEROUTER_API_KEY = Deno.env.get("NOVEL_SANCTUARY_LITEROUTER_API_KEY");
  const searxConfig = getSearxConfig();

  // ── Continuing a batched fallback job: skip RR + structure re-detect,
  // fetch the next BATCH_SIZE-chapter slice using the structure the caller
  // already has from the first response. ──
  if (typeof range_start === "number" && passedStructure) {
    if (!LITEROUTER_API_KEY) {
      return jsonResponse({ error: "LITEROUTER_API_KEY not configured" }, 502);
    }
    const structure: Structure = passedStructure;
    const rangeEnd = Math.min(range_start + BATCH_SIZE - 1, structure.total_chapters);
    const listResult = await fallbackSonarChapterList(
      title, LITEROUTER_API_KEY, structure.has_volumes, structure.total_volumes,
      structure.total_chapters, range_start, rangeEnd,
    );
    if (listResult.error) {
      const errRes = voidAIErrorResponse(listResult.status);
      if (errRes) return errRes;
      return jsonResponse({ error: `AI API error: ${listResult.status}` }, 502);
    }
    const rawChapters: any[] = Array.isArray(listResult.parsed?.chapters) ? listResult.parsed.chapters : [];
    const chapters: Chapter[] = rawChapters
      .map((ch: any) => ({
        chapter_number: Number(ch.chapter_number) || 0,
        chapter_title: ch.chapter_title || `Chapter ${ch.chapter_number}`,
        external_url: ch.url && ch.url !== "#" ? ch.url : null,
        volume_number: structure.has_volumes ? (Number(ch.volume_number) || null) : null,
        volume_title: structure.has_volumes ? (ch.volume_title || null) : null,
      }))
      .filter((ch) => ch.chapter_number >= range_start && ch.chapter_number <= rangeEnd);

    const result = buildBatchResult(chapters, structure, range_start, rangeEnd);
    langfuseTrace({
      name: "chapter-search-batch", model: FALLBACK_MODEL, input: { title, range_start, range_end: rangeEnd },
      output: { chapters_count: chapters.length, done: result.done }, metadata: { title, step: "fallback-batch" },
    });
    return jsonResponse(result);
  }

  // ── Fresh request. Step 1: Royal Road structured full chapter list —
  // real, complete, chronological, zero LLM guessing, no batching needed
  // (RR's table is fully present in the initial page HTML). ──
  const rr = await fetchRoyalRoadChapters(title, searxConfig);
  if (rr) {
    const result = {
      chapters: rr.chapters,
      total_chapters: rr.chapters.length,
      has_volumes: rr.hasVolumes,
      total_volumes: rr.hasVolumes ? new Set(rr.chapters.map((c) => c.volume_number)).size : 0,
      source: "Royal Road",
      has_named_chapters: rr.chapters.some((c) => !/^Chapter \d+$/i.test(c.chapter_title)),
      placeholder_count: 0,
      _source_type: "structured",
      structure: null,
      range_start: 1,
      range_end: rr.chapters.length,
      next_range_start: null,
      done: true,
    };
    langfuseTrace({
      name: "chapter-search-complete",
      model: "royalroad-direct",
      input: { title },
      output: { total_chapters: result.total_chapters, source: "Royal Road" },
      metadata: { title, step: "structured" },
    });
    return jsonResponse(result);
  }

  // ── Step 2: Sonar (LiteRouter) self-search — last resort only. Detect
  // structure first, then fetch just the FIRST batch; caller loops for
  // the rest via range_start/structure if `done` comes back false. ──
  if (!LITEROUTER_API_KEY) {
    return jsonResponse({
      chapters: [], total_chapters: 0, has_volumes: false, source: "none (no structured source matched, and LITEROUTER_API_KEY not configured for fallback)",
      done: true, next_range_start: null,
    });
  }

  const structureResult = await fallbackSonarStructure(title, LITEROUTER_API_KEY);
  if (structureResult.error) {
    const errRes = voidAIErrorResponse(structureResult.status);
    if (errRes) return errRes;
    return jsonResponse({ error: `AI API error: ${structureResult.status}` }, 502);
  }

  const rawStructure = structureResult.structure ?? {};
  const structure: Structure = {
    has_volumes: rawStructure.has_volumes === true,
    total_volumes: rawStructure.total_volumes || 0,
    total_chapters: Math.min(rawStructure.total_chapters || 0, MAX_CHAPTERS),
    source: rawStructure.source || "AI search",
    has_named_chapters: rawStructure.has_named_chapters === true,
  };

  langfuseTrace({ name: "chapter-search-structure", model: FALLBACK_MODEL, input: { title }, output: structure, metadata: { title, step: "fallback-structure" } });

  if (structure.total_chapters === 0) {
    return jsonResponse({
      chapters: [], total_chapters: 0, has_volumes: false, source: structure.source + " (no chapters found)",
      placeholder_count: 0, _source_type: "fallback", structure, done: true, next_range_start: null,
    });
  }

  const firstRangeEnd = Math.min(BATCH_SIZE, structure.total_chapters);
  const listResult = await fallbackSonarChapterList(
    title, LITEROUTER_API_KEY, structure.has_volumes, structure.total_volumes,
    structure.total_chapters, 1, firstRangeEnd,
  );
  if (listResult.error) {
    const errRes = voidAIErrorResponse(listResult.status);
    if (errRes) return errRes;
    return jsonResponse({ error: `AI API error: ${listResult.status}` }, 502);
  }

  const rawChapters: any[] = Array.isArray(listResult.parsed?.chapters) ? listResult.parsed.chapters : [];
  const chapters: Chapter[] = rawChapters
    .map((ch: any) => ({
      chapter_number: Number(ch.chapter_number) || 0,
      chapter_title: ch.chapter_title || `Chapter ${ch.chapter_number}`,
      external_url: ch.url && ch.url !== "#" ? ch.url : null,
      volume_number: structure.has_volumes ? (Number(ch.volume_number) || null) : null,
      volume_title: structure.has_volumes ? (ch.volume_title || null) : null,
    }))
    .filter((ch) => ch.chapter_number >= 1 && ch.chapter_number <= firstRangeEnd);

  const result = buildBatchResult(chapters, structure, 1, firstRangeEnd);

  langfuseTrace({
    name: "chapter-search-complete",
    model: FALLBACK_MODEL,
    input: { title },
    output: { total_chapters: structure.total_chapters, chapters_count: chapters.length, has_volumes: structure.has_volumes, source: structure.source, done: result.done },
    metadata: { title, step: "fallback-first-batch" },
  });

  return jsonResponse(result);
});
