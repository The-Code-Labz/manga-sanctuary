import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsResponse,
  jsonResponse,
  repairJson,
  callVoidAI,
  voidAIErrorResponse,
  extractContent,
  getSearxConfig,
  searchSearx,
  byparrFetch,
  BROWSER_UA,
  stripTags,
  anchorTexts,
  divContent,
  titlesMatch,
  type SearxConfig,
} from "../_shared/utils.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Merge step no longer needs Sonar's built-in live search (structured sources
// below replace most of its value) — use a cheap plain chat model instead.
const MERGE_MODEL = Deno.env.get("NOVEL_MERGE_MODEL") ?? "gpt-4o-mini";

// ---------------------------------------------------------------------------
// Structured source: normalized shape every fetcher below produces
// ---------------------------------------------------------------------------

interface StructuredSource {
  source: string;
  title?: string | null;
  alt_titles?: string[];
  author?: string | null;
  artists?: string[];
  description?: string | null;
  language?: string | null;
  status?: string | null;
  novel_type?: string | null;
  year?: string | null;
  completely_translated?: boolean | null;
  genres?: string[];
  tags?: string[];
  cover_image?: string | null;
  url?: string | null;
}

// ---------------------------------------------------------------------------
// AniList — structured GraphQL API, covers LN/manga-adapted novels
// ---------------------------------------------------------------------------

async function queryAniList(title: string): Promise<StructuredSource | null> {
  const query = `query ($search: String) {
    Media(search: $search, type: MANGA, format_in: [NOVEL, ONE_SHOT], sort: SEARCH_MATCH) {
      title { romaji english native }
      synonyms
      description(asHtml: false)
      genres
      tags { name }
      status
      staff(sort: RELEVANCE, perPage: 5) { edges { role node { name { full } } } }
      coverImage { large }
      siteUrl
    }
  }`;

  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables: { search: title } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const media = data?.data?.Media;
    if (!media) return null;

    const author =
      media.staff?.edges?.find((e: any) => /story|author|original creator|original work/i.test(e.role ?? ""))
        ?.node?.name?.full ??
      media.staff?.edges?.[0]?.node?.name?.full ??
      null;

    return {
      source: "anilist",
      title: media.title?.english ?? media.title?.romaji ?? title,
      alt_titles: [media.title?.romaji, media.title?.native, ...(media.synonyms ?? [])].filter(Boolean),
      author,
      description: media.description?.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "") ?? null,
      status: media.status ? String(media.status).toLowerCase() : null,
      genres: media.genres ?? [],
      tags: (media.tags ?? []).map((t: any) => t.name),
      cover_image: media.coverImage?.large ?? null,
      url: media.siteUrl ?? null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Royal Road — plain fetch, no Cloudflare gate. Covers Western web-original
// serials (Guild Wars / Blood Warlock-type titles) that never touch AniList/NU.
// ---------------------------------------------------------------------------

async function findRoyalRoadUrl(title: string, searxConfig: SearxConfig | null): Promise<string | null> {
  if (!searxConfig) return null;
  const results = await searchSearx(`site:royalroad.com/fiction "${title}"`, searxConfig, 5);
  return results.find((r) => /royalroad\.com\/fiction\/\d+/.test(r.url))?.url ?? null;
}

function parseRoyalRoad(html: string, pageUrl: string): StructuredSource | null {
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let ld: any = null;
  if (ldMatch) {
    try {
      ld = JSON.parse(ldMatch[1]);
    } catch {
      /* ignore malformed JSON-LD */
    }
  }

  const tagMatches = [...html.matchAll(/class="[^"]*\bfiction-tag\b[^"]*"[^>]*>([^<]+)</g)].map((m) =>
    m[1].trim(),
  );
  const statusMatches = [...html.matchAll(/class="[^"]*\bbg-blue-hoki\b[^"]*"[^>]*>\s*([^<]+?)\s*</g)].map(
    (m) => m[1].trim(),
  );
  const originalFlag = statusMatches.find((s) => /original|fan fiction/i.test(s)) ?? null;
  const statusWord = statusMatches.find((s) => /ongoing|completed|hiatus|stub|inactive/i.test(s)) ?? null;

  if (!ld && tagMatches.length === 0) return null;

  return {
    source: "royalroad",
    title: ld?.name ?? null,
    author: ld?.author?.name ?? null,
    description: ld?.description ? stripTags(ld.description) : null,
    status: statusWord ? statusWord.toLowerCase() : null,
    novel_type: originalFlag ? (/fan/i.test(originalFlag) ? "Fan Fiction" : "Web Novel") : "Web Novel",
    genres: tagMatches,
    tags: tagMatches,
    cover_image: ld?.image ?? null,
    url: pageUrl,
  };
}

async function fetchRoyalRoad(title: string, searxConfig: SearxConfig | null): Promise<StructuredSource | null> {
  const url = await findRoyalRoadUrl(title, searxConfig);
  if (!url) return null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const html = await res.text();
    const parsed = parseRoyalRoad(html, url);
    if (!parsed || !titlesMatch(title, parsed.title)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// NovelUpdates — Cloudflare Turnstile-gated, cleared via Byparr. Cleanest
// taxonomy for translated Asian web novels.
// ---------------------------------------------------------------------------

async function findNovelUpdatesUrl(title: string, searxConfig: SearxConfig | null): Promise<string | null> {
  if (!searxConfig) return null;
  const results = await searchSearx(`site:novelupdates.com/series "${title}"`, searxConfig, 5);
  return results.find((r) => /novelupdates\.com\/series\//.test(r.url))?.url ?? null;
}

function parseNovelUpdates(html: string, pageUrl: string): StructuredSource | null {
  const ogTitle = html.match(/property="og:title" content="([^"]+)"/)?.[1] ?? null;
  const ogDesc = html.match(/property="og:description" content="([^"]+)"/)?.[1] ?? null;
  if (!ogTitle) return null;

  const genres = anchorTexts(divContent(html, "seriesgenre"));
  const tags = anchorTexts(divContent(html, "showtags"));
  const authors = anchorTexts(divContent(html, "showauthors"));
  const artists = anchorTexts(divContent(html, "showartists"));
  const typeRaw = stripTags(divContent(html, "showtype")).replace(/\(.*?\)/, "").trim() || null;
  const langRaw = stripTags(divContent(html, "showlang")) || null;
  const yearRaw = stripTags(divContent(html, "edityear")) || null;
  const statusRaw = stripTags(divContent(html, "editstatus")); // e.g. "1034(ongoing)"
  const translatedRaw = stripTags(divContent(html, "showtranslated"));
  const associated = divContent(html, "editassociated")
    .split(/<br\s*\/?>/)
    .map(stripTags)
    .filter(Boolean);

  const statusWordMatch = statusRaw.match(/\(([^)]+)\)/);

  return {
    source: "novelupdates",
    title: ogTitle,
    alt_titles: associated,
    author: authors[0] ?? null,
    artists,
    description: ogDesc,
    genres,
    tags,
    novel_type: typeRaw,
    language: langRaw,
    year: yearRaw,
    status: statusWordMatch ? statusWordMatch[1].toLowerCase() : null,
    completely_translated: /^yes/i.test(translatedRaw) ? true : /^no/i.test(translatedRaw) ? false : null,
    url: pageUrl,
  };
}

async function fetchNovelUpdates(title: string, searxConfig: SearxConfig | null): Promise<StructuredSource | null> {
  const url = await findNovelUpdatesUrl(title, searxConfig);
  if (!url) return null;
  const html = await byparrFetch(url);
  if (!html) return null;
  try {
    const parsed = parseNovelUpdates(html, url);
    if (!parsed || !titlesMatch(title, parsed.title)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// WebNovel.com — Cloudflare-gated, cleared via Byparr. Best-effort: page
// structure is less battle-tested than NU/RR, so failures here are non-fatal
// and the pipeline simply falls through to other sources.
// ---------------------------------------------------------------------------

async function findWebNovelUrl(title: string, searxConfig: SearxConfig | null): Promise<string | null> {
  if (!searxConfig) return null;
  const results = await searchSearx(`site:webnovel.com/book "${title}"`, searxConfig, 5);
  return results.find((r) => /webnovel\.com\/book\//.test(r.url))?.url ?? null;
}

function parseWebNovel(html: string, pageUrl: string): StructuredSource | null {
  const ogTitle = html.match(/property="og:title" content="([^"]+)"/)?.[1] ?? null;
  const ogDesc = html.match(/property="og:description" content="([^"]+)"/)?.[1] ?? null;
  if (!ogTitle) return null;

  // Genre markup isn't in static HTML classes anymore — WebNovel client-renders
  // categories/tags from an embedded JSON blob. Pull the primary category
  // ("categoryName") plus the finer-grained "tagInfos[].tagName" list from the
  // same book object (both appear once per book; recommend-list sidebar items
  // only carry categoryName, never tagInfos, so tagName alone is safe to
  // matchAll without cross-book bleed).
  const category = html.match(/"categoryName":"([^"]+)"/)?.[1];
  const tagNames = [...html.matchAll(/"tagName":"([^"]+)"/g)].map((m) => m[1]);
  const seenGenres = new Set<string>();
  const genres = [category, ...tagNames].filter((v): v is string => {
    if (!v) return false;
    const key = v.toLowerCase();
    if (seenGenres.has(key)) return false;
    seenGenres.add(key);
    return true;
  });

  // Author isn't in og: tags — pull from the embedded page JSON first
  // (most reliable), fall back to the <title> tag's " - Author - WebNovel"
  // suffix pattern.
  const author =
    html.match(/"authorName":"([^"]+)"/)?.[1] ??
    html.match(/<title>[^<]*-\s*([^-<]+?)\s*-\s*WebNovel<\/title>/)?.[1]?.trim() ??
    null;

  return {
    source: "webnovel",
    title: ogTitle,
    author,
    description: ogDesc,
    genres,
    url: pageUrl,
  };
}

async function fetchWebNovel(title: string, searxConfig: SearxConfig | null): Promise<StructuredSource | null> {
  const url = await findWebNovelUrl(title, searxConfig);
  if (!url) return null;
  const html = await byparrFetch(url);
  if (!html) return null;
  try {
    const parsed = parseWebNovel(html, url);
    if (!parsed || !titlesMatch(title, parsed.title)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// SearXNG snippet fallback — last resort only, when no structured source hit
// (also covers ScribbleHub, which has no direct-parse path: Cloudflare error
// 1005 IP/ASN ban, not a JS challenge — no solver fixes that).
// ---------------------------------------------------------------------------

async function fallbackSearxSnippets(
  title: string,
  searxConfig: SearxConfig,
): Promise<{ context: string; novelupdatesUrl: string | null }> {
  const [nuResults, generalResults, altResults] = await Promise.all([
    searchSearx(`site:novelupdates.com "${title}"`, searxConfig),
    searchSearx(`"${title}" light novel OR web novel synopsis author genres`, searxConfig),
    searchSearx(`"${title}" novel novelupdates OR webnovel OR scribblehub OR royalroad`, searxConfig),
  ]);

  const allResults = [...nuResults, ...generalResults, ...altResults];
  const seen = new Set<string>();
  const uniqueResults = allResults.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  const context = uniqueResults
    .slice(0, 12)
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`)
    .join("\n\n---\n\n");

  // Gate on snippet title too — same bug class as the structured fetchers:
  // a generic multi-word title can rank an unrelated NovelUpdates series first.
  const novelupdatesUrl =
    uniqueResults.find((r) => r.url.includes("novelupdates.com") && titlesMatch(title, r.title))?.url ?? null;

  return { context, novelupdatesUrl };
}

// ---------------------------------------------------------------------------
// Merge step — synthesizes whatever structured sources + fallback snippets
// landed into the final schema. No live search needed here anymore, so this
// runs on a plain chat model instead of sonar-pro.
// ---------------------------------------------------------------------------

const OUTPUT_SCHEMA = `{
  "title": "exact title as found",
  "alt_titles": ["alternative title 1", "alternative title 2"],
  "author": "author name",
  "description": "detailed multi-paragraph description",
  "language": "JP" | "CN" | "KR" | "EN",
  "status": "ongoing" | "completed" | "hiatus",
  "novel_type": "Light Novel" | "Web Novel" | null,
  "genres": ["Genre1", "Genre2"],
  "tags": ["Tag1", "Tag2"],
  "novelupdates_url": "url if found" | null,
  "confidence": {
    "title": 0.0,
    "author": 0.0,
    "description": 0.0,
    "language": 0.0,
    "status": 0.0,
    "novel_type": 0.0,
    "genres": 0.0,
    "tags": 0.0
  },
  "sources": ["url1", "url2"]
}`;

async function mergeSources(
  title: string,
  apiKey: string,
  structuredSources: StructuredSource[],
  fallbackContext: string,
): Promise<any> {
  const systemPrompt = `You are a precise metadata merger for light novels and web novels. You will be given structured data pulled directly from APIs/pages (AniList, Royal Road, NovelUpdates, WebNovel) and possibly raw web search snippets. Your job is to MERGE and SYNTHESIZE this into one clean record — not to search or invent.

IMPORTANT RULES:
- Prefer structured source fields over raw search snippets whenever both exist.
- When structured sources disagree, prefer NovelUpdates for genres/tags/status taxonomy, AniList for alt titles, Royal Road/AniList for description.
- For description: write a detailed multi-paragraph synopsis combining the available structured descriptions (do not just copy one verbatim if multiple exist — synthesize).
- If a field cannot be determined from any source, use null.
- Do not invent information not present in the sources.

Return ONLY a valid JSON object with NO markdown, NO code fences, NO explanation.

JSON structure:
${OUTPUT_SCHEMA}`;

  const structuredBlock = structuredSources.length
    ? structuredSources
        .map((s) => `### Source: ${s.source}${s.url ? ` (${s.url})` : ""}\n${JSON.stringify(s, null, 2)}`)
        .join("\n\n")
    : "None — no structured source (AniList/Royal Road/NovelUpdates/WebNovel) returned a match.";

  const userPrompt = `Merge metadata for the novel: "${title}"

## Structured sources
${structuredBlock}

## Raw web search snippets (fallback context, use only to fill gaps)
${fallbackContext || "None."}

Synthesize the final record. Set confidence scores based on source agreement and specificity (1.0 = confirmed by a structured source, 0.5 = inferred from snippets, 0.1 = guessed).`;

  // VoidAI intermittently returns bare 5xx/429s under load (observed
  // repeatedly this session, independent of key/model health) — retry a
  // couple of times before surfacing the failure. No retry existed here
  // before, unlike every other AI call in this codebase.
  const MERGE_BACKOFF_MS = [1000, 3000];
  let aiRes: Response | undefined;
  for (let attempt = 0; ; attempt++) {
    aiRes = await callVoidAI(
      apiKey,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { model: MERGE_MODEL, max_tokens: 4096, temperature: 0.2 },
    );
    if (aiRes.ok) break;
    const backoff = MERGE_BACKOFF_MS[attempt];
    const transient = aiRes.status === 429 || aiRes.status >= 500;
    if (transient && backoff !== undefined) {
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
    break;
  }

  if (!aiRes.ok) {
    return { error: true, status: aiRes.status };
  }

  const aiData = await aiRes.json();
  const content = extractContent(aiData);
  try {
    return { error: false, metadata: repairJson(content) };
  } catch {
    return { error: true, status: 502 };
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { title } = body;
  if (!title?.trim()) {
    return jsonResponse({ error: "Missing required field: title" }, 400);
  }

  const VOID_AI_API_KEY = Deno.env.get("NOVEL_SANCTUARY_VOID_AI_API_KEY");
  if (!VOID_AI_API_KEY) {
    return jsonResponse({ error: "VOID_AI_API_KEY is not configured" }, 500);
  }

  const searxConfig = getSearxConfig();

  // ── Step 1: structured sources in parallel ──
  // AniList only makes sense for titles resembling a known LN/manga tie-in,
  // but the call is cheap and returns null cleanly otherwise, so just fire it.
  const [aniListRes, royalRoadRes, novelUpdatesRes, webNovelRes] = await Promise.allSettled([
    queryAniList(title),
    fetchRoyalRoad(title, searxConfig),
    fetchNovelUpdates(title, searxConfig),
    fetchWebNovel(title, searxConfig),
  ]);

  const structuredSources: StructuredSource[] = [aniListRes, royalRoadRes, novelUpdatesRes, webNovelRes]
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((v): v is StructuredSource => v !== null);

  // ── Step 2: SearXNG snippet fallback — only when nothing structured hit ──
  let fallbackContext = "";
  let fallbackNovelUpdatesUrl: string | null = null;
  if (structuredSources.length === 0 && searxConfig) {
    const fb = await fallbackSearxSnippets(title, searxConfig);
    fallbackContext = fb.context;
    fallbackNovelUpdatesUrl = fb.novelupdatesUrl;
  }

  // ── Step 3: merge into final schema (cheap non-search model) ──
  const merged = await mergeSources(title, VOID_AI_API_KEY, structuredSources, fallbackContext);

  if (merged.error) {
    const errRes = voidAIErrorResponse(merged.status);
    if (errRes) return errRes;
    if (merged.status === 502) return jsonResponse({ error: "Failed to parse AI response" }, 502);
    return jsonResponse({ error: `AI API error: ${merged.status}` }, 502);
  }

  const metadata = merged.metadata;

  const nuSource = structuredSources.find((s) => s.source === "novelupdates");
  if (!metadata.novelupdates_url) {
    metadata.novelupdates_url = nuSource?.url ?? fallbackNovelUpdatesUrl ?? null;
  }

  // Attach diagnostic fields
  metadata._sources_used = structuredSources.map((s) => s.source);
  metadata._novelupdates_found = !!nuSource || !!fallbackNovelUpdatesUrl;
  metadata._searx_available = !!searxConfig;
  metadata._used_fallback_search = structuredSources.length === 0;

  return jsonResponse(metadata);
});
