import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsResponse,
  jsonResponse,
  repairJson,
  callOpenAI,
  callLiteRouter,
  voidAIErrorResponse,
  extractContent,
  getSearxConfig,
  searchSearx,
  titlesMatch,
  type SearxConfig,
} from "../_shared/manga-sanctuary/utils.ts";

// ---------------------------------------------------------------------------
// Ported from novel-sanctuary's novel-metadata-v2. Same overall shape
// (structured sources in parallel -> SearXNG snippet fallback only when
// nothing structured hit -> cheap non-search LLM merges everything into the
// final schema), but the structured sources themselves are swapped for
// manga-appropriate ones. Unlike novel-metadata-v2's structured sources
// (Royal Road/NovelUpdates/WebNovel), which all required a SearXNG
// url-discovery hop + HTML scraping + Byparr for Cloudflare, EVERY structured
// source below is a real, official, directly-queryable JSON API — no
// scraping, no Cloudflare-clearing, no URL discovery step needed at all.
// ---------------------------------------------------------------------------

// Merge step — same rationale as novel-metadata-v2: pure synthesis over
// already-fetched structured data, no live search needed, so a cheap plain
// chat model is enough. Primary (LiteRouter/Grok) picked there for being
// least euphemistic on explicit/ecchi content, same reasoning applies here
// (this catalog also skews Ecchi/Adult/Mature) — see generate-cover-prompt.
const MERGE_MODEL = Deno.env.get("MANGA_SANCTUARY_MERGE_MODEL") ?? "grok-4.1-fast-non-reasoning";
const MERGE_FALLBACK_MODEL = Deno.env.get("MANGA_SANCTUARY_MERGE_FALLBACK_MODEL") ?? "gpt-4o-mini";

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
  manga_type?: string | null;
  year?: string | null;
  genres?: string[];
  tags?: string[];
  cover_image?: string | null;
  url?: string | null;
}

// ---------------------------------------------------------------------------
// AniList — structured GraphQL API. Adapted from novel-metadata-v2's query
// (which filtered format_in: [NOVEL, ONE_SHOT] under type: MANGA — AniList's
// "type: MANGA" is a broad bucket covering manga/manhwa/manhua/novels/
// doujinshi/one-shots). Here we want the actual comic formats, not the prose
// ones, so format_in becomes [MANGA, ONE_SHOT] instead. countryOfOrigin is
// new here (novel had no use for it) — it's the strongest signal for
// Manga(JP)/Manhwa(KR)/Manhua(CN) that the merge step gets, since neither
// AniList's genre/tag list nor MangaUpdates' `type` field reliably
// distinguishes them either.
// ---------------------------------------------------------------------------

async function queryAniList(title: string): Promise<StructuredSource | null> {
  const query = `query ($search: String) {
    Media(search: $search, type: MANGA, format_in: [MANGA, ONE_SHOT], sort: SEARCH_MATCH) {
      title { romaji english native }
      synonyms
      description(asHtml: false)
      genres
      tags { name }
      status
      countryOfOrigin
      staff(sort: RELEVANCE, perPage: 6) { edges { role node { name { full } } } }
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

    const staffEdges: any[] = media.staff?.edges ?? [];
    const author =
      staffEdges.find((e) => /story|original creator|original work/i.test(e.role ?? ""))?.node?.name?.full ??
      staffEdges[0]?.node?.name?.full ??
      null;
    const artists = staffEdges
      .filter((e) => /art|illustrat/i.test(e.role ?? ""))
      .map((e) => e.node?.name?.full)
      .filter(Boolean);

    const mangaTypeHint = media.countryOfOrigin === "KR" ? "Manhwa" : media.countryOfOrigin === "CN" ? "Manhua" : "Manga";

    return {
      source: "anilist",
      title: media.title?.english ?? media.title?.romaji ?? title,
      alt_titles: [media.title?.romaji, media.title?.native, ...(media.synonyms ?? [])].filter(Boolean),
      author,
      artists,
      description: media.description?.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "") ?? null,
      status: media.status ? String(media.status).toLowerCase() : null,
      manga_type: mangaTypeHint,
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
// MangaDex — official REST API (api.mangadex.org), no auth, no Cloudflare
// gate. Includes[] pulls author/artist/cover_art relationships in the same
// call. contentRating[] includes erotica/pornographic (not just the
// safe/suggestive default) since this catalog skews Ecchi/Adult/Mature.
// ---------------------------------------------------------------------------

async function queryMangaDex(title: string): Promise<StructuredSource | null> {
  try {
    const params = new URLSearchParams();
    params.set("title", title);
    params.set("limit", "5");
    for (const r of ["safe", "suggestive", "erotica", "pornographic"]) params.append("contentRating[]", r);
    for (const inc of ["author", "artist", "cover_art"]) params.append("includes[]", inc);

    const res = await fetch(`https://api.mangadex.org/manga?${params}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const data = await res.json();
    const candidates: any[] = data?.data ?? [];
    if (candidates.length === 0) return null;

    // Prefer the first candidate whose title (or an alt title) actually
    // matches the query — MangaDex's own relevance ranking can surface an
    // unrelated doujinshi/spinoff ahead of the real series for common titles.
    const titleOf = (m: any): string | null =>
      m.attributes?.title?.en ?? Object.values(m.attributes?.title ?? {})[0] as string ?? null;
    const altTitlesOf = (m: any): string[] =>
      (m.attributes?.altTitles ?? []).flatMap((t: Record<string, string>) => Object.values(t));

    const manga =
      candidates.find((m) => titlesMatch(title, titleOf(m)) || altTitlesOf(m).some((t) => titlesMatch(title, t))) ??
      null;
    if (!manga) return null;

    const attrs = manga.attributes ?? {};
    const rels: any[] = manga.relationships ?? [];
    const author = rels.find((r) => r.type === "author")?.attributes?.name ?? null;
    const artists = rels.filter((r) => r.type === "artist").map((r) => r.attributes?.name).filter(Boolean);
    const coverFile = rels.find((r) => r.type === "cover_art")?.attributes?.fileName;
    const cover_image = coverFile ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFile}` : null;

    const tags: any[] = attrs.tags ?? [];
    const genres = tags.filter((t) => t.attributes?.group === "genre").map((t) => t.attributes?.name?.en).filter(Boolean);
    const themeTags = tags
      .filter((t) => t.attributes?.group === "theme" || t.attributes?.group === "format")
      .map((t) => t.attributes?.name?.en)
      .filter(Boolean);

    const originalLang = attrs.originalLanguage as string | undefined;
    const mangaTypeHint = originalLang === "ko" ? "Manhwa" : originalLang === "zh" || originalLang === "zh-hk" ? "Manhua" : "Manga";

    return {
      source: "mangadex",
      title: titleOf(manga) ?? title,
      alt_titles: altTitlesOf(manga),
      author,
      artists,
      description: attrs.description?.en ?? Object.values(attrs.description ?? {})[0] as string ?? null,
      language: originalLang ? originalLang.toUpperCase() : null,
      status: attrs.status ?? null,
      manga_type: mangaTypeHint,
      year: attrs.year ? String(attrs.year) : null,
      genres,
      tags: themeTags,
      cover_image,
      url: `https://mangadex.org/title/${manga.id}`,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// MangaUpdates — official v1 REST API (api.mangaupdates.com/v1), no auth
// needed for search/read. Two-step: search-by-title to get a series_id, then
// fetch the full series record for authors/status/genres. This is the manga
// equivalent of novel-metadata-v2's NovelUpdates fetcher, but structured JSON
// instead of scraped HTML (no Byparr/Cloudflare-clearing needed at all).
// `categories` are community-voted free-tag entries (much larger and noisier
// than `genres`) — top-voted N used as the tags list.
// ---------------------------------------------------------------------------

async function queryMangaUpdates(title: string): Promise<StructuredSource | null> {
  try {
    const searchRes = await fetch("https://api.mangaupdates.com/v1/series/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ search: title, perpage: 5 }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const results: any[] = searchData?.results ?? [];
    const match = results.find((r) => titlesMatch(title, r.record?.title))?.record;
    if (!match?.series_id) return null;

    const detailRes = await fetch(`https://api.mangaupdates.com/v1/series/${match.series_id}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!detailRes.ok) return null;
    const d = await detailRes.json();

    const authorsRaw: any[] = d.authors ?? [];
    const author = authorsRaw.find((a) => a.type === "Author")?.name ?? authorsRaw[0]?.name ?? null;
    const artists = authorsRaw.filter((a) => a.type === "Artist").map((a) => a.name).filter(Boolean);

    const statusRaw: string = d.status ?? "";
    const status = /completed/i.test(statusRaw) || d.completed === true
      ? "completed"
      : /hiatus/i.test(statusRaw)
      ? "hiatus"
      : /ongoing/i.test(statusRaw)
      ? "ongoing"
      : null;

    const genres = (d.genres ?? []).map((g: any) => g.genre).filter(Boolean);
    const categories = (d.categories ?? [])
      .slice()
      .sort((a: any, b: any) => (b.votes ?? 0) - (a.votes ?? 0))
      .slice(0, 15)
      .map((c: any) => c.category)
      .filter(Boolean);

    const altTitles = (d.associated ?? []).map((a: any) => a.title).filter(Boolean);

    // MangaUpdates' own `type` field ("Manga"/"Manhwa"/"Manhua"/...) is a
    // direct, human-curated signal — pass it through as-is when it matches
    // one of our enum values, don't infer.
    const mangaType = ["Manga", "Manhwa", "Manhua"].includes(d.type) ? d.type : null;

    return {
      source: "mangaupdates",
      title: d.title ?? match.title ?? null,
      alt_titles: altTitles,
      author,
      artists,
      description: d.description ?? null,
      status,
      manga_type: mangaType,
      year: d.year ? String(d.year) : null,
      genres,
      tags: categories,
      cover_image: d.image?.url?.original ?? null,
      url: d.url ?? match.url ?? null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// SearXNG snippet fallback — genuine last resort, only when NONE of the
// three structured APIs above found a match (unlike novel-metadata-v2, which
// needed this far more often since its structured sources depended on a
// title-guess -> SearXNG url-discovery hop that could itself miss).
// ---------------------------------------------------------------------------

async function fallbackSearxSnippets(title: string, searxConfig: SearxConfig): Promise<string> {
  const [muResults, generalResults] = await Promise.all([
    searchSearx(`site:mangaupdates.com "${title}"`, searxConfig),
    searchSearx(`"${title}" manga OR manhwa OR manhua synopsis author artist genres`, searxConfig),
  ]);

  const allResults = [...muResults, ...generalResults];
  const seen = new Set<string>();
  const uniqueResults = allResults.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  return uniqueResults
    .slice(0, 12)
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`)
    .join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Merge step
// ---------------------------------------------------------------------------

const OUTPUT_SCHEMA = `{
  "title": "exact title as found",
  "alt_titles": ["alternative title 1", "alternative title 2"],
  "author": "author name",
  "description": "detailed multi-paragraph description",
  "language": "JP" | "CN" | "KR" | "EN",
  "status": "ongoing" | "completed" | "hiatus",
  "manga_type": "Manga" | "Manhwa" | "Manhua" | "Webtoon" | null,
  "genres": ["Genre1", "Genre2"],
  "tags": ["Tag1", "Tag2"],
  "mangaupdates_url": "MangaUpdates url if found" | null,
  "confidence": {
    "title": 0.0,
    "author": 0.0,
    "description": 0.0,
    "language": 0.0,
    "status": 0.0,
    "manga_type": 0.0,
    "genres": 0.0,
    "tags": 0.0
  },
  "sources": ["url1", "url2"]
}`;

async function mergeSources(
  title: string,
  openAIKey: string | null,
  liteRouterKey: string | null,
  structuredSources: StructuredSource[],
  fallbackContext: string,
): Promise<any> {
  const systemPrompt = `You are a precise metadata merger for manga, manhwa, and manhua. You will be given structured data pulled directly from APIs (AniList, MangaDex, MangaUpdates) and possibly raw web search snippets. Your job is to MERGE and SYNTHESIZE this into one clean record — not to search or invent.

IMPORTANT RULES:
- Prefer structured source fields over raw search snippets whenever both exist.
- When structured sources disagree, prefer MangaUpdates for genres/tags/status/type taxonomy (it is human-curated), MangaDex for alt titles and description completeness, AniList's countryOfOrigin as a tiebreaker signal for Manga(JP)/Manhwa(KR)/Manhua(CN) vs "Webtoon" (long-strip vertical format — only use this when a source explicitly signals it, e.g. genre/tag mentions "Webtoon" or "Long strip", never invent it purely from country of origin).
- author = story writer. If a source separates "author" (story) from "artist" (art), keep them separate — the output schema only asks for author, but do not merge an artist-only name into author unless no distinct author is listed.
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
    : "None — no structured source (AniList/MangaDex/MangaUpdates) returned a match.";

  const userPrompt = `Merge metadata for the manga: "${title}"

## Structured sources
${structuredBlock}

## Raw web search snippets (fallback context, use only to fill gaps)
${fallbackContext || "None."}

Synthesize the final record. Set confidence scores based on source agreement and specificity (1.0 = confirmed by a structured source, 0.5 = inferred from snippets, 0.1 = guessed). Put the MangaUpdates series URL (if any structured source found one) into "mangaupdates_url".`;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ];

  const BACKOFF_MS = [1000, 3000];
  let aiRes: Response | undefined;
  if (liteRouterKey) {
    for (let attempt = 0; ; attempt++) {
      aiRes = await callLiteRouter(liteRouterKey, messages, { model: MERGE_MODEL, max_tokens: 4096 });
      if (aiRes.ok) break;
      const backoff = BACKOFF_MS[attempt];
      const transient = aiRes.status === 429 || aiRes.status >= 500;
      if (transient && backoff !== undefined) {
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      break;
    }
  }

  if ((!aiRes || !aiRes.ok) && openAIKey) {
    const oaRes = await callOpenAI(openAIKey, messages, {
      model: MERGE_FALLBACK_MODEL,
      max_tokens: 4096,
      temperature: 0.2,
    });
    if (oaRes.ok || !aiRes) aiRes = oaRes;
  }

  if (!aiRes) return { error: true, status: 500 };
  if (!aiRes.ok) return { error: true, status: aiRes.status };

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

  const OPENAI_API_KEY = Deno.env.get("MANGA_SANCTUARY_OPENAI_API_KEY") ?? null;
  const LITEROUTER_API_KEY = Deno.env.get("MANGA_SANCTUARY_LITEROUTER_API_KEY") ?? null;
  if (!OPENAI_API_KEY && !LITEROUTER_API_KEY) {
    return jsonResponse(
      { error: "No merge LLM provider configured (set MANGA_SANCTUARY_OPENAI_API_KEY and/or MANGA_SANCTUARY_LITEROUTER_API_KEY)" },
      500,
    );
  }

  const searxConfig = getSearxConfig();

  // ── Step 1: structured sources in parallel ──
  const [aniListRes, mangaDexRes, mangaUpdatesRes] = await Promise.allSettled([
    queryAniList(title),
    queryMangaDex(title),
    queryMangaUpdates(title),
  ]);

  const structuredSources: StructuredSource[] = [aniListRes, mangaDexRes, mangaUpdatesRes]
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((v): v is StructuredSource => v !== null);

  // ── Step 2: SearXNG snippet fallback — only when nothing structured hit ──
  let fallbackContext = "";
  let fallbackMangaUpdatesUrl: string | null = null;
  if (structuredSources.length === 0 && searxConfig) {
    fallbackContext = await fallbackSearxSnippets(title, searxConfig);
    const muMatch = fallbackContext.match(/URL: (https:\/\/www\.mangaupdates\.com\/series\/[^\s]+)/);
    fallbackMangaUpdatesUrl = muMatch ? muMatch[1] : null;
  }

  // ── Step 3: merge into final schema (cheap non-search model) ──
  const merged = await mergeSources(title, OPENAI_API_KEY, LITEROUTER_API_KEY, structuredSources, fallbackContext);

  if (merged.error) {
    const errRes = voidAIErrorResponse(merged.status);
    if (errRes) return errRes;
    if (merged.status === 502) return jsonResponse({ error: "Failed to parse AI response" }, 502);
    return jsonResponse({ error: `AI API error: ${merged.status}` }, 502);
  }

  const metadata = merged.metadata;

  const muSource = structuredSources.find((s) => s.source === "mangaupdates");
  if (!metadata.mangaupdates_url) {
    metadata.mangaupdates_url = muSource?.url ?? fallbackMangaUpdatesUrl ?? null;
  }

  metadata._sources_used = structuredSources.map((s) => s.source);
  metadata._mangaupdates_found = !!muSource || !!fallbackMangaUpdatesUrl;
  metadata._searx_available = !!searxConfig;
  metadata._used_fallback_search = structuredSources.length === 0;

  return jsonResponse(metadata);
});
