import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsResponse,
  jsonResponse,
  repairJson,
  callLiteRouter,
  voidAIErrorResponse,
  extractContent,
  langfuseTrace,
  titlesMatch,
  byparrFetch,
  decodeEntities,
  BROWSER_UA,
} from "../_shared/manga-sanctuary/utils.ts";

// ---------------------------------------------------------------------------
// Ported from novel-sanctuary's novel-chapter-search. The response contract
// (chapters/done/next_range_start/structure/source/has_volumes/total_chapters/
// total_volumes) is preserved EXACTLY — the frontend (ChapterAiSearch.tsx)
// drives the batching loop against this shape and was not changed.
//
// The structured-source layer underneath is entirely different, though.
// Novel's version needed FOUR separate site-specific HTML scrapers (Royal
// Road, ReadNovelFull, NovelFire, NovelHi) plus a generic-aggregator seed
// scraper, each individually reverse-engineered and live-tested against real
// pages — because none of those sites expose a real API. Manga's primary
// aggregator, MangaDex, has an official public JSON REST API that returns a
// series' entire chapter feed (number, title, volume, external reader link)
// directly — no scraping, no Cloudflare-clearing, no per-site markup to keep
// in sync. That single structured source below replaces all five of novel's
// scrapers. The AI self-search fallback (LiteRouter, batched, gap-retried)
// is kept for manga/manhwa/manhua not indexed on MangaDex at all — same
// architecture as novel's, since that part is provider/search plumbing that
// doesn't care whether the underlying content is prose or page images.
// novel's translator-title-enrichment step (SearXNG search for a translator
// blog's real chapter names) is NOT ported — that was specific to unnamed
// "Chapter N" web-novel chapters on fan translation sites and has no manga
// analogue worth the added complexity here.
// ---------------------------------------------------------------------------

const FALLBACK_MODEL = Deno.env.get("MANGA_CHAPTER_FALLBACK_MODEL") ?? "gpt-4o-mini-search-preview";
const MAX_CHAPTERS = 3000;
const BATCH_SIZE = 40;
const MAX_RETRIES = 2;
const LITEROUTER_COOLDOWN_MS = 8_000;
const FETCH_TIMEOUT_MS = 15_000;

interface Chapter {
  chapter_number: number;
  chapter_title: string;
  external_url: string | null;
  volume_number: number | null;
  volume_title: string | null;
  is_placeholder?: boolean;
}

interface VolumeBoundary {
  number: number;
  title: string | null;
  start: number;
  end: number;
}

interface Structure {
  has_volumes: boolean;
  total_volumes: number;
  total_chapters: number;
  source: string;
  has_named_chapters: boolean;
  source_url: string | null;
  volumes: VolumeBoundary[];
}

function parseVolumeBoundaries(raw: unknown): VolumeBoundary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v: any) => ({
      number: Number(v?.number),
      title: typeof v?.title === "string" && v.title.trim() ? v.title.trim() : null,
      start: Number(v?.start_chapter),
      end: Number(v?.end_chapter),
    }))
    .filter((v) => Number.isFinite(v.number) && Number.isFinite(v.start) && Number.isFinite(v.end) && v.start <= v.end)
    .sort((a, b) => a.start - b.start);
}

function resolveVolume(structure: Structure, chapterNumber: number): { volume_number: number | null; volume_title: string | null } {
  if (!structure.has_volumes || structure.volumes.length === 0) {
    return { volume_number: null, volume_title: null };
  }
  const match = structure.volumes.find((v) => chapterNumber >= v.start && chapterNumber <= v.end);
  if (!match) return { volume_number: null, volume_title: null };
  return { volume_number: match.number, volume_title: match.title };
}

function isGenericChapterTitle(t: string): boolean {
  return /^chapter\s*\d+\.?$/i.test(t.trim());
}

// ---------------------------------------------------------------------------
// MangaDex — official REST API. Search for the manga, then page through its
// full chapter feed (500/request cap, so a 2000+ chapter title needs a few
// internal pagination hops — still one edge-function call, no cursor handed
// back to the frontend, since this is fast structured JSON, not slow AI
// generation). One row per chapter_number kept (first occurrence in
// order[chapter]=asc — MangaDex often has several scanlation groups covering
// the same chapter; we don't need every group, just one real reading link).
// ---------------------------------------------------------------------------

async function findMangaDexId(title: string): Promise<string | null> {
  const params = new URLSearchParams();
  params.set("title", title);
  params.set("limit", "5");
  for (const r of ["safe", "suggestive", "erotica", "pornographic"]) params.append("contentRating[]", r);

  const res = await fetch(`https://api.mangadex.org/manga?${params}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  const data = await res.json();
  const candidates: any[] = data?.data ?? [];

  const titleOf = (m: any): string | null =>
    m.attributes?.title?.en ?? (Object.values(m.attributes?.title ?? {})[0] as string) ?? null;
  const altTitlesOf = (m: any): string[] =>
    (m.attributes?.altTitles ?? []).flatMap((t: Record<string, string>) => Object.values(t));

  const match = candidates.find((m) => titlesMatch(title, titleOf(m)) || altTitlesOf(m).some((t) => titlesMatch(title, t)));
  return match?.id ?? null;
}

// ---------------------------------------------------------------------------
// Completeness gap detection. MangaDex's `/feed` above is scoped to
// translatedLanguage[]=en — fine for series with a full English scanlation,
// but plenty of real series only have PARTIAL English coverage there
// (scanlator dropped it, official simulpub lags, licensing pulled chapters
// for a region) while raw/other-language releases (or other aggregators
// entirely) continue well past that point. Treating a partial EN feed as
// "done:true, structured, complete" silently hides everything after the gap.
//
// `/manga/{id}/aggregate` (no language filter) returns every chapter number
// MangaDex knows about in ANY language in one cheap call — comparing its max
// chapter number against our EN feed's max is a real, source-grounded signal
// (not a guess) that more chapters exist than we surfaced in English.
// ---------------------------------------------------------------------------

async function fetchMangaDexMaxKnownChapter(mangaId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.mangadex.org/manga/${mangaId}/aggregate`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const volumes: Record<string, any> = data?.volumes ?? {};
    let max = -Infinity;
    for (const vol of Object.values(volumes)) {
      for (const cnum of Object.keys(vol?.chapters ?? {})) {
        const n = Number(cnum);
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
    return Number.isFinite(max) ? max : null;
  } catch {
    return null;
  }
}

async function fetchMangaDexChapters(
  title: string,
): Promise<{ chapters: Chapter[]; hasVolumes: boolean; mangaId: string; maxKnownChapter: number | null } | null> {
  const mangaId = await findMangaDexId(title);
  if (!mangaId) return null;

  const byNumber = new Map<number, Chapter>();
  let offset = 0;
  const limit = 500;
  for (let page = 0; page < 20; page++) { // 20*500 = 10,000 ceiling, well above MAX_CHAPTERS
    const params = new URLSearchParams();
    params.append("translatedLanguage[]", "en");
    params.set("order[chapter]", "asc");
    params.set("order[createdAt]", "asc");
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    for (const r of ["safe", "suggestive", "erotica", "pornographic"]) params.append("contentRating[]", r);

    const res = await fetch(`https://api.mangadex.org/manga/${mangaId}/feed?${params}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) break;
    const data = await res.json();
    const rows: any[] = data?.data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const attrs = row.attributes ?? {};
      const chapterNumber = Number(attrs.chapter);
      if (!Number.isFinite(chapterNumber) || byNumber.has(chapterNumber)) continue;
      const volumeNumber = attrs.volume != null ? Number(attrs.volume) : null;
      byNumber.set(chapterNumber, {
        chapter_number: chapterNumber,
        chapter_title: attrs.title?.trim() || `Chapter ${chapterNumber}`,
        external_url: attrs.externalUrl || `https://mangadex.org/chapter/${row.id}`,
        volume_number: Number.isFinite(volumeNumber) ? volumeNumber : null,
        volume_title: null,
      });
    }

    const total = Number(data?.total) || 0;
    offset += limit;
    if (offset >= total || byNumber.size >= MAX_CHAPTERS) break;
  }

  if (byNumber.size === 0) return null;
  const chapters = [...byNumber.values()].sort((a, b) => a.chapter_number - b.chapter_number).slice(0, MAX_CHAPTERS);
  const hasVolumes = chapters.some((c) => c.volume_number !== null);
  const maxKnownChapter = await fetchMangaDexMaxKnownChapter(mangaId);
  return { chapters, hasVolumes, mangaId, maxKnownChapter };
}

// ---------------------------------------------------------------------------
// ComicK — second structured source, tried only when MangaDex is missing the
// title entirely or has a real English-coverage gap (see hasRealGap below).
// ComicK's official API (api.comick.dev) has broader scanlation-group
// coverage for a lot of titles MangaDex's official-license takedowns or slow
// groups leave incomplete — but unlike MangaDex, api.comick.dev sits behind
// a Cloudflare Turnstile challenge (live-verified: plain fetch always 403s
// "Just a moment..."). Byparr solves it, but a COLD Turnstile solve against
// the bare API subdomain reliably fails/times out (live-verified: 2/2
// attempts, ~60s each, HTTP 500) — whereas priming with a normal page fetch
// against the site root first establishes a domain-wide cf_clearance cookie
// that the API subdomain then honors directly (live-verified: 3/3 warm API
// calls succeeded in 3-4s each). So every ComicK call goes through
// comickFetchJson(), which primes once (cached for COMICK_PRIME_TTL_MS,
// since Byparr's underlying browser session persists across calls) before
// ever hitting the API. JSON responses come back wrapped in Firefox's
// built-in <pre> JSON viewer (Byparr renders with a real browser), so the
// wrapper has to be stripped and HTML-entity-decoded before parsing.
// ---------------------------------------------------------------------------

const COMICK_API_BASE = "https://api.comick.dev";
const COMICK_SITE = "https://comick.dev";
const COMICK_MAX_PAGES = 20; // 20*100 = 2,000 chapter-group rows ceiling, well above MAX_CHAPTERS
const COMICK_PRIME_TTL_MS = 5 * 60_000;
const COMICK_TIMEOUT_MS = 45_000;

let comickPrimedAt = 0;

async function comickPrime(): Promise<void> {
  if (Date.now() - comickPrimedAt < COMICK_PRIME_TTL_MS) return;
  await byparrFetch(`${COMICK_SITE}/`, 30_000);
  comickPrimedAt = Date.now(); // set even on failure — avoid hammering a down/blocked site every call
}

function extractComickJsonText(raw: string): string | null {
  if (/just a moment|checking your browser|cf-browser-verification|__cf_chl_/i.test(raw)) return null;
  const m = raw.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  const body = (m ? m[1] : raw).trim();
  return body ? decodeEntities(body) : null;
}

async function comickFetchJson(url: string): Promise<any | null> {
  await comickPrime();
  const raw = await byparrFetch(url, COMICK_TIMEOUT_MS);
  if (!raw) return null;
  const jsonText = extractComickJsonText(raw);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

async function findComickMatch(title: string): Promise<{ hid: string; slug: string; lastChapter: number | null } | null> {
  const data = await comickFetchJson(`${COMICK_API_BASE}/v1.0/search?q=${encodeURIComponent(title)}&limit=5`);
  if (!Array.isArray(data)) return null;

  const titleOf = (m: any): string | null => (typeof m?.title === "string" ? m.title : null);
  const altTitlesOf = (m: any): string[] =>
    (Array.isArray(m?.md_titles) ? m.md_titles : []).map((t: any) => t?.title).filter((t: unknown): t is string => typeof t === "string");

  const match = data.find((m) => titlesMatch(title, titleOf(m)) || altTitlesOf(m).some((t) => titlesMatch(title, t)));
  if (!match?.hid || !match?.slug) return null;

  const lastChapter = Number(match.last_chapter);
  return { hid: match.hid, slug: match.slug, lastChapter: Number.isFinite(lastChapter) ? lastChapter : null };
}

async function fetchComickChapters(title: string): Promise<{ chapters: Chapter[]; hasVolumes: boolean; maxKnownChapter: number | null } | null> {
  const found = await findComickMatch(title);
  if (!found) return null;

  const byNumber = new Map<number, { title: string; vol: number | null; hid: string; upCount: number }>();
  const limit = 100;
  for (let page = 1; page <= COMICK_MAX_PAGES; page++) {
    const data = await comickFetchJson(
      `${COMICK_API_BASE}/comic/${found.hid}/chapters?lang=en&limit=${limit}&page=${page}&chap-order=1`,
    );
    const rows: any[] = Array.isArray(data?.chapters) ? data.chapters : [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const chapterNumber = Number(row.chap);
      if (!Number.isFinite(chapterNumber)) continue;
      const upCount = Number(row.up_count) || 0;
      const existing = byNumber.get(chapterNumber);
      // Same chapter number is often uploaded by multiple scanlation groups —
      // keep the most-upvoted one as the representative reading link.
      if (!existing || upCount > existing.upCount) {
        const vol = Number(row.vol);
        byNumber.set(chapterNumber, {
          title: typeof row.title === "string" && row.title.trim() ? row.title.trim() : "",
          vol: Number.isFinite(vol) ? vol : null,
          hid: row.hid,
          upCount,
        });
      }
    }

    const total = Number(data?.total) || 0;
    if (page * limit >= total || byNumber.size >= MAX_CHAPTERS) break;
  }

  if (byNumber.size === 0) return null;
  const chapters: Chapter[] = [...byNumber.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, MAX_CHAPTERS)
    .map(([chapterNumber, row]) => ({
      chapter_number: chapterNumber,
      chapter_title: row.title || `Chapter ${chapterNumber}`,
      external_url: `${COMICK_SITE}/comic/${found.slug}/${row.hid}-chapter-${chapterNumber}-en`,
      volume_number: row.vol,
      volume_title: null,
    }));

  const hasVolumes = chapters.some((c) => c.volume_number !== null);
  const localMax = chapters[chapters.length - 1].chapter_number;
  const maxKnownChapter = found.lastChapter != null ? Math.max(found.lastChapter, localMax) : localMax;
  return { chapters, hasVolumes, maxKnownChapter };
}

// ---------------------------------------------------------------------------
// ArenaScan — third structured source, same gap-gated tier as ComicK. Unlike
// MangaDex/ComicK (broad aggregator indexes), ArenaScan is a single
// scanlation group's own WordPress site — it will only ever have titles that
// group actually translates, but for those it's a real, complete, first-party
// chapter list (often AHEAD of MangaDex/ComicK for titles that group's
// scanlating live, since aggregators mirror them with a delay). No
// Cloudflare/Turnstile gate (live-verified: plain fetch, 200 OK, no
// challenge) — this is the classic "eplister" WordPress manga-reader theme
// (id="chapterlist" > li[data-num]), same theme family already confirmed
// working for manga-chapter-content's #readerarea selector. Search results
// and the full per-series chapter list are both fully server-rendered in one
// plain GET each — no ajax/pagination hop needed.
// ---------------------------------------------------------------------------

const ARENASCAN_BASE = "https://arenascan.com";
const ARENASCAN_TIMEOUT_MS = 15_000;

async function arenaFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(ARENASCAN_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function findArenaScanMatch(title: string): Promise<string | null> {
  const html = await arenaFetch(`${ARENASCAN_BASE}/?s=${encodeURIComponent(title)}`);
  if (!html) return null;

  // <div class="bsx"> ... <a href="{seriesUrl}" title="{seriesTitle}"> — one
  // block per search result, href+title always adjacent on the same tag.
  const candidates: { url: string; title: string }[] = [];
  for (const m of html.matchAll(/<div class="bsx">\s*<a href="(https:\/\/arenascan\.com\/manga\/[^"]+)"\s+title="([^"]+)"/g)) {
    candidates.push({ url: m[1], title: decodeEntities(m[2]) });
  }
  const match = candidates.find((c) => titlesMatch(title, c.title));
  return match?.url ?? null;
}

async function fetchArenaScanChapters(title: string): Promise<{ chapters: Chapter[]; maxKnownChapter: number | null } | null> {
  const seriesUrl = await findArenaScanMatch(title);
  if (!seriesUrl) return null;

  const html = await arenaFetch(seriesUrl);
  if (!html) return null;

  const listMatch = html.match(/<div class="eplister"[^>]*id="chapterlist"[^>]*>[\s\S]*?<\/ul>/);
  if (!listMatch) return null;

  const byNumber = new Map<number, Chapter>();
  for (const m of listMatch[0].matchAll(
    /<li data-num="([0-9.]+)">[\s\S]*?<a href="([^"]+)">[\s\S]*?<span class="chapternum">([^<]*)<\/span>/g,
  )) {
    const chapterNumber = Number(m[1]);
    if (!Number.isFinite(chapterNumber) || byNumber.has(chapterNumber)) continue;
    const rawTitle = decodeEntities(m[3]).trim();
    byNumber.set(chapterNumber, {
      chapter_number: chapterNumber,
      chapter_title: rawTitle || `Chapter ${chapterNumber}`,
      external_url: m[2],
      volume_number: null,
      volume_title: null,
    });
  }

  if (byNumber.size === 0) return null;
  const chapters = [...byNumber.values()].sort((a, b) => a.chapter_number - b.chapter_number).slice(0, MAX_CHAPTERS);
  const maxKnownChapter = chapters[chapters.length - 1].chapter_number;
  return { chapters, maxKnownChapter };
}

function mergeChapterSets(primary: Chapter[], secondary: Chapter[]): Chapter[] {
  const byNumber = new Map<number, Chapter>();
  for (const c of primary) byNumber.set(c.chapter_number, c);
  for (const c of secondary) if (!byNumber.has(c.chapter_number)) byNumber.set(c.chapter_number, c);
  return [...byNumber.values()].sort((a, b) => a.chapter_number - b.chapter_number);
}

// ---------------------------------------------------------------------------
// AI self-search fallback (LiteRouter) — last resort, only when neither
// structured source (MangaDex, ComicK) has any match at all. Architecture
// ported as-is from novel-sanctuary's version (batching/cursor/gap-retry)
// since it's search/provider plumbing, not content-type-specific; prompts
// reworded for manga/manhwa/manhua sources.
// ---------------------------------------------------------------------------

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
      const res = await callLiteRouter(apiKey, messages, { model: FALLBACK_MODEL, max_tokens: maxTokens });
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

async function fallbackStructure(title: string, apiKey: string): Promise<any> {
  const messages: { role: "system" | "user"; content: string }[] = [
    {
      role: "system",
      content: `You are a manga/manhwa/manhua structure researcher. Search the internet to determine the chapter/volume structure of a manga series.

Search MangaDex (mangadex.org), MangaUpdates (mangaupdates.com), AniList, and official publisher/reader sites (Viz, MangaPlus, Webtoon, Tapas, etc.).

Determine:
1. Does this series group chapters into VOLUMES (tankobon)? Or is it a flat ongoing chapter list?
2. How many volumes are there (if any)?
3. How many total chapters are there?
4. What SPECIFIC page/URL did you use to determine the chapter count? Pick one concrete, re-searchable page — later requests reuse this exact source to keep chapter numbering consistent.
5. Do chapters have unique named titles beyond just "Chapter X"?
6. If it HAS volumes, what is the exact chapter-number range of EACH volume?

Return ONLY a valid JSON object. No markdown, no code fences.

JSON structure:
{
  "has_volumes": true,
  "total_volumes": 5,
  "total_chapters": 250,
  "source": "MangaUpdates",
  "source_url": "https://www.mangaupdates.com/series/example/" or null,
  "has_named_chapters": true,
  "volumes": [
    { "number": 1, "title": "Volume 1", "start_chapter": 1, "end_chapter": 50 }
  ],
  "structure_notes": "Brief description of how the series is structured"
}

If has_volumes is false, total_volumes should be 0 or null and "volumes" should be an empty array — do not invent volume boundaries for a flat-chapter-list series.`,
    },
    {
      role: "user",
      content: `Determine the chapter/volume structure for the manga "${title}". Return ONLY a JSON object.`,
    },
  ];

  const res = await callAIWithRetry(apiKey, messages, 2048);
  if (!res.ok) return { error: true, status: res.status };
  const data = await res.json();
  try {
    return { error: false, structure: repairJson(extractContent(data)) };
  } catch {
    return { error: false, structure: { has_volumes: false, total_volumes: 0, total_chapters: 0, source: "AI", source_url: null } };
  }
}

async function fallbackChapterList(
  title: string,
  apiKey: string,
  hasVolumes: boolean,
  totalVolumes: number,
  totalChapters: number,
  rangeStart: number,
  rangeEnd: number,
  sourceUrl: string | null,
): Promise<any> {
  const anchorInstruction = sourceUrl
    ? `\n\nIMPORTANT — use this EXACT source for the chapter list: ${sourceUrl}. Earlier (and later) batches of this same request are being fetched from this same source to keep chapter numbering consistent — do NOT switch sources mid-list.`
    : "";

  const messages: { role: "system" | "user"; content: string }[] = [
    {
      role: "system",
      content: `You are a chapter list researcher for manga/manhwa/manhua. Search the internet to find chapters for a series.

Search MangaUpdates, MangaDex, official reader sites, and scanlation aggregators.${anchorInstruction}

You only need to return chapters numbered ${rangeStart} through ${rangeEnd} (of ${totalChapters} total) — this is one slice of a larger list being fetched in batches. Do not return chapters outside this range. Do NOT include volume information — that was already determined separately.

Return ONLY a valid JSON object. No markdown, no code fences.

JSON structure:
{
  "chapters": [
    { "chapter_number": ${rangeStart}, "chapter_title": "...", "url": "https://..." }
  ]
}

RULES:
- List every chapter you can find numbered ${rangeStart}-${rangeEnd} (inclusive)
- chapter_number should be the chapter's GLOBAL/overall number, not renumbered within this slice
- If a chapter has no special title, use "Chapter X" format
- Use "#" for url if no reading link is available`,
    },
    {
      role: "user",
      content: `Find chapters ${rangeStart} through ${rangeEnd} for "${title}". ${hasVolumes ? `It has ${totalVolumes} volumes and ${totalChapters} total chapters.` : `It has ${totalChapters} chapters in a flat list.`} Return ONLY a JSON object.`,
    },
  ];

  const res = await callAIWithRetry(apiKey, messages, 12000);
  if (!res.ok) return { error: true, status: res.status };
  const data = await res.json();
  try {
    return { error: false, parsed: repairJson(extractContent(data)) };
  } catch {
    return { error: false, parsed: { chapters: [] } };
  }
}

async function fallbackMissingChapters(
  title: string,
  apiKey: string,
  structure: Structure,
  missing: number[],
  rangeStart: number,
  rangeEnd: number,
): Promise<any> {
  const anchorInstruction = structure.source_url
    ? `\n\nUse this EXACT source, the same one used to find the rest of this batch: ${structure.source_url}.`
    : "";

  const messages: { role: "system" | "user"; content: string }[] = [
    {
      role: "system",
      content: `You are a chapter list researcher. A previous search for this manga's chapter list already found most chapters in the range ${rangeStart}-${rangeEnd}, but missed a handful of specific ones. Search the internet (MangaUpdates, MangaDex, official/scanlation aggregators) to find ONLY the missing chapters listed below.${anchorInstruction}

Return ONLY a valid JSON object, no markdown, no code fences.

JSON structure:
{ "chapters": [ { "chapter_number": ${missing[0]}, "chapter_title": "...", "url": "https://..." } ] }

Only include chapters from this list: ${missing.join(", ")}. If you cannot find a specific one, omit it rather than guessing.`,
    },
    {
      role: "user",
      content: `For the manga "${title}", find these specific missing chapter numbers: ${missing.join(", ")}. Return ONLY a JSON object.`,
    },
  ];

  const res = await callAIWithRetry(apiKey, messages, 4096);
  if (!res.ok) return { error: true, status: res.status };
  const data = await res.json();
  try {
    return { error: false, parsed: repairJson(extractContent(data)) };
  } catch {
    return { error: false, parsed: { chapters: [] } };
  }
}

function mapRawChapters(rawChapters: any[], structure: Structure, rangeStart: number, rangeEnd: number): Chapter[] {
  return rawChapters
    .map((ch: any) => {
      const chapterNumber = Number(ch.chapter_number) || 0;
      const { volume_number, volume_title } = resolveVolume(structure, chapterNumber);
      const chapter_title: string = ch.chapter_title || `Chapter ${ch.chapter_number}`;
      return {
        chapter_number: chapterNumber,
        chapter_title,
        external_url: ch.url && ch.url !== "#" ? ch.url : null,
        volume_number,
        volume_title,
      };
    })
    .filter((ch) => ch.chapter_number >= rangeStart && ch.chapter_number <= rangeEnd);
}

async function fetchChapterBatchWithGapRetry(
  title: string,
  apiKey: string,
  structure: Structure,
  rangeStart: number,
  rangeEnd: number,
): Promise<{ error: true; status: number } | { error: false; chapters: Chapter[] }> {
  const listResult = await fallbackChapterList(
    title, apiKey, structure.has_volumes, structure.total_volumes,
    structure.total_chapters, rangeStart, rangeEnd, structure.source_url,
  );
  if (listResult.error) return { error: true, status: listResult.status };

  const rawChapters: any[] = Array.isArray(listResult.parsed?.chapters) ? listResult.parsed.chapters : [];
  const chapters: Chapter[] = mapRawChapters(rawChapters, structure, rangeStart, rangeEnd);

  const foundNums = new Set(chapters.map((c) => c.chapter_number));
  const missing: number[] = [];
  for (let i = rangeStart; i <= rangeEnd; i++) if (!foundNums.has(i)) missing.push(i);
  const missRate = missing.length / (rangeEnd - rangeStart + 1);

  if (missing.length > 0 && missRate <= 0.7) {
    const retryResult = await fallbackMissingChapters(title, apiKey, structure, missing, rangeStart, rangeEnd);
    if (!retryResult.error) {
      const retryChapters = mapRawChapters(
        Array.isArray(retryResult.parsed?.chapters) ? retryResult.parsed.chapters : [],
        structure, rangeStart, rangeEnd,
      );
      for (const ch of retryChapters) {
        if (foundNums.has(ch.chapter_number)) continue;
        chapters.push(ch);
        foundNums.add(ch.chapter_number);
      }
    }
  }

  return { error: false, chapters };
}

function buildBatchResult(chapters: Chapter[], structure: Structure, rangeStart: number, rangeEnd: number) {
  let placeholderCount = 0;
  {
    const existingNums = new Set(chapters.map((c) => c.chapter_number));
    for (let i = rangeStart; i <= rangeEnd; i++) {
      if (!existingNums.has(i)) {
        const { volume_number, volume_title } = resolveVolume(structure, i);
        chapters.push({
          chapter_number: i, chapter_title: `Chapter ${i}`, external_url: null,
          volume_number, volume_title, is_placeholder: true,
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

  const LITEROUTER_API_KEY = Deno.env.get("MANGA_SANCTUARY_LITEROUTER_API_KEY");

  // ── Continuing a batched fallback job ──
  if (typeof range_start === "number" && passedStructure) {
    if (!LITEROUTER_API_KEY) {
      return jsonResponse({ error: "LITEROUTER_API_KEY not configured" }, 502);
    }
    const structure: Structure = passedStructure;
    const rangeEnd = Math.min(range_start + BATCH_SIZE - 1, structure.total_chapters);
    const batchResult = await fetchChapterBatchWithGapRetry(title, LITEROUTER_API_KEY, structure, range_start, rangeEnd);
    if (batchResult.error) {
      const errRes = voidAIErrorResponse(batchResult.status);
      if (errRes) return errRes;
      return jsonResponse({ error: `AI API error: ${batchResult.status}` }, 502);
    }
    const result = buildBatchResult(batchResult.chapters, structure, range_start, rangeEnd);
    langfuseTrace({
      name: "manga-chapter-search-batch", model: FALLBACK_MODEL, input: { title, range_start, range_end: rangeEnd },
      output: { chapters_count: batchResult.chapters.length, done: result.done }, metadata: { title, step: "fallback-batch" },
    });
    return jsonResponse(result);
  }

  // ── Fresh request. Step 1: MangaDex structured full chapter list — real,
  // complete, zero LLM guessing. ──
  const mdx = await fetchMangaDexChapters(title);

  // Gap check: does a real, any-language aggregate/total know about more
  // chapters than we've found in English so far? A few chapters' lag is
  // normal for an ongoing series (scanlation catch-up); a real gap means
  // English coverage on this source is genuinely incomplete for this title.
  // `mdx == null` (no MangaDex match at all) also counts as a gap — that's
  // exactly the case ComicK, a second real source, exists to cover.
  let mergedChapters: Chapter[] = mdx ? mdx.chapters : [];
  let mergedHasVolumes = mdx ? mdx.hasVolumes : false;
  let bestKnownMax: number | null = mdx?.maxKnownChapter ?? null;
  const sourcesUsed: string[] = mdx ? [`MangaDex (${mdx.chapters.length} EN chapters)`] : [];

  let enMaxChapter = mergedChapters.length ? mergedChapters[mergedChapters.length - 1].chapter_number : 0;
  const mdxGapChapters = bestKnownMax != null ? bestKnownMax - enMaxChapter : 0;
  const mdxGapRatio = bestKnownMax && bestKnownMax > 0 ? enMaxChapter / bestKnownMax : 1;
  const mdxHasGap = mdx == null || (bestKnownMax != null && mdxGapChapters >= 5 && mdxGapRatio < 0.85);

  // ── Step 2: ComicK + ArenaScan — second/third structured sources, only
  // tried when MangaDex is missing the title or has a real gap (keeps the
  // fast/cheap path for titles MangaDex already covers completely,
  // unchanged). Run concurrently — independent sources, no reason to serialize. ──
  if (mdxHasGap) {
    const [cmk, arena] = await Promise.all([fetchComickChapters(title), fetchArenaScanChapters(title)]);
    if (cmk) {
      mergedChapters = mergeChapterSets(mergedChapters, cmk.chapters);
      mergedHasVolumes = mergedHasVolumes || cmk.hasVolumes;
      sourcesUsed.push(`ComicK (${cmk.chapters.length} EN chapters)`);
      if (cmk.maxKnownChapter != null) {
        bestKnownMax = bestKnownMax != null ? Math.max(bestKnownMax, cmk.maxKnownChapter) : cmk.maxKnownChapter;
      }
    }
    if (arena) {
      mergedChapters = mergeChapterSets(mergedChapters, arena.chapters);
      sourcesUsed.push(`ArenaScan (${arena.chapters.length} chapters)`);
      if (arena.maxKnownChapter != null) {
        bestKnownMax = bestKnownMax != null ? Math.max(bestKnownMax, arena.maxKnownChapter) : arena.maxKnownChapter;
      }
    }
    enMaxChapter = mergedChapters.length ? mergedChapters[mergedChapters.length - 1].chapter_number : 0;
  }

  const gapChapters = bestKnownMax != null ? bestKnownMax - enMaxChapter : 0;
  const gapRatio = bestKnownMax && bestKnownMax > 0 ? enMaxChapter / bestKnownMax : 1;
  const hasRealGap = bestKnownMax != null && gapChapters >= 5 && gapRatio < 0.85;

  if (mergedChapters.length > 0) {
    const sourceLabel = sourcesUsed.join(" + ");

    if (hasRealGap && LITEROUTER_API_KEY) {
      const structure: Structure = {
        has_volumes: mergedHasVolumes,
        total_volumes: mergedHasVolumes ? new Set(mergedChapters.map((c) => c.volume_number)).size : 0,
        total_chapters: Math.min(Math.ceil(bestKnownMax!), MAX_CHAPTERS),
        source: `${sourceLabel} + AI search (gap-fill)`,
        has_named_chapters: mergedChapters.some((c) => !isGenericChapterTitle(c.chapter_title)),
        source_url: null, // deliberately unanchored — both structured sources are exhausted, let the AI search broadly (MangaUpdates/aggregators) instead of re-checking either
        volumes: [],
      };
      const rangeStart = Math.floor(enMaxChapter) + 1;
      const rangeEnd = Math.min(rangeStart + BATCH_SIZE - 1, structure.total_chapters);
      const batchResult = await fetchChapterBatchWithGapRetry(title, LITEROUTER_API_KEY, structure, rangeStart, rangeEnd);

      if (!batchResult.error) {
        const combined = buildBatchResult(batchResult.chapters, structure, rangeStart, rangeEnd);
        combined.chapters = mergedChapters.concat(combined.chapters);
        combined.total_chapters = structure.total_chapters;
        combined.has_volumes = mergedHasVolumes;
        combined.total_volumes = structure.total_volumes;
        combined.source = `${sourceLabel} + AI search (${gapChapters} more chapters detected, filling from ${rangeStart})`;
        combined.has_named_chapters = structure.has_named_chapters;
        (combined as any)._source_type = "structured+fallback";
        combined.range_start = 1;
        langfuseTrace({
          name: "manga-chapter-search-gapfill", model: FALLBACK_MODEL, input: { title, enMaxChapter, bestKnownMax, sources: sourcesUsed },
          output: { chapters_count: combined.chapters.length, done: combined.done }, metadata: { title, step: "gap-fill" },
        });
        return jsonResponse(combined);
      }
      // Fallback errored (rate limit/etc.) — don't fail the whole request,
      // just return what the structured sources actually have and let the
      // admin retry AI search manually later for the tail if they want it.
    }

    const result = {
      chapters: mergedChapters,
      total_chapters: mergedChapters.length,
      has_volumes: mergedHasVolumes,
      total_volumes: mergedHasVolumes ? new Set(mergedChapters.map((c) => c.volume_number)).size : 0,
      source: hasRealGap ? `${sourceLabel} (${gapChapters} more chapters known but not in English yet)` : sourceLabel,
      has_named_chapters: mergedChapters.some((c) => !isGenericChapterTitle(c.chapter_title)),
      placeholder_count: 0,
      _source_type: sourcesUsed.length > 1 ? "structured+structured" : "structured",
      structure: null,
      range_start: 1,
      range_end: mergedChapters.length,
      next_range_start: null,
      done: true,
    };
    langfuseTrace({
      name: "manga-chapter-search-complete", model: "structured-direct", input: { title },
      output: { total_chapters: result.total_chapters, source: result.source }, metadata: { title, step: "structured" },
    });
    return jsonResponse(result);
  }

  // ── Step 3: AI self-search — last resort, only when neither MangaDex nor
  // ComicK matched the title at all. ──
  if (!LITEROUTER_API_KEY) {
    return jsonResponse({
      chapters: [], total_chapters: 0, has_volumes: false,
      source: "none (no structured source matched, and LITEROUTER_API_KEY not configured for fallback)",
      done: true, next_range_start: null,
    });
  }

  const structureResult = await fallbackStructure(title, LITEROUTER_API_KEY);
  if (structureResult.error) {
    const errRes = voidAIErrorResponse(structureResult.status);
    if (errRes) return errRes;
    return jsonResponse({ error: `AI API error: ${structureResult.status}` }, 502);
  }

  const rawStructure = structureResult.structure ?? {};
  const hasVolumesDetected = rawStructure.has_volumes === true;
  const structure: Structure = {
    has_volumes: hasVolumesDetected,
    total_volumes: rawStructure.total_volumes || 0,
    total_chapters: Math.min(rawStructure.total_chapters || 0, MAX_CHAPTERS),
    source: rawStructure.source || "AI search",
    has_named_chapters: rawStructure.has_named_chapters === true,
    source_url: rawStructure.source_url || null,
    volumes: hasVolumesDetected ? parseVolumeBoundaries(rawStructure.volumes) : [],
  };

  langfuseTrace({ name: "manga-chapter-search-structure", model: FALLBACK_MODEL, input: { title }, output: structure, metadata: { title, step: "fallback-structure" } });

  if (structure.total_chapters === 0) {
    return jsonResponse({
      chapters: [], total_chapters: 0, has_volumes: false, source: structure.source + " (no chapters found)",
      placeholder_count: 0, _source_type: "fallback", structure, done: true, next_range_start: null,
    });
  }

  const firstRangeEnd = Math.min(BATCH_SIZE, structure.total_chapters);
  const batchResult = await fetchChapterBatchWithGapRetry(title, LITEROUTER_API_KEY, structure, 1, firstRangeEnd);
  if (batchResult.error) {
    const errRes = voidAIErrorResponse(batchResult.status);
    if (errRes) return errRes;
    return jsonResponse({ error: `AI API error: ${batchResult.status}` }, 502);
  }

  const result = buildBatchResult(batchResult.chapters, structure, 1, firstRangeEnd);

  langfuseTrace({
    name: "manga-chapter-search-complete",
    model: FALLBACK_MODEL,
    input: { title },
    output: { total_chapters: structure.total_chapters, chapters_count: batchResult.chapters.length, has_volumes: structure.has_volumes, source: structure.source, done: result.done },
    metadata: { title, step: "fallback-first-batch" },
  });

  return jsonResponse(result);
});
