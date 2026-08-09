/**
 * Public REST API for Manga Sanctuary — lets external callers (our own
 * agents, scripts, or anything else with a valid key) search manga, read
 * manga/chapter data (including a chapter's full ordered page-image array),
 * create/update manga, attach/upsert chapters in bulk (page URLs, not
 * prose), delete chapters (single or by range), and fetch a raw page's
 * readable text for a URL so a caller can do its OWN chapter-number/title
 * parsing or page-scraping when a site's scheme doesn't fit our automatic
 * sources — then push the result back via PATCH /chapters/:id or
 * POST /manga/:id/chapters.
 *
 * Ported 1:1 from novel-sanctuary's novel-api (same auth layer, same route
 * shape, same admin-key/usage-dashboard split) — adapted for manga's
 * image-based content model: chapters carry an ordered `pages` array
 * ({page_number, image_url}) instead of prose `content`, manga has a
 * separate `artist` alongside `author`, and `manga_type` replaces
 * `novel_type`.
 *
 * This is a REAL path-routed API, not a single-endpoint POST-body dispatch
 * like the rest of this app's functions — callers hit
 * `{SUPABASE_URL}/functions/v1/manga-sanctuary-manga-api/<route>` directly
 * over plain HTTP (curl/fetch/etc.), not via the supabase-js client SDK.
 *
 * Auth is its OWN layer (api_keys table, SHA-256 hashed keys, three scopes:
 * read < write < admin), independent of Supabase auth/RLS — this API is for
 * trusted external callers, not logged-in end users. All DB access below
 * goes through PostgREST using the service-role key (bypasses RLS
 * entirely) — auth is enforced HERE, not by RLS.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsResponse, jsonResponse, BROWSER_UA, byparrFetch, htmlToReadableText } from "../_shared/manga-sanctuary/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SCHEMA = "manga_sanctuary";

const MAX_LIST_LIMIT = 100;
const MAX_CHAPTER_LIST_LIMIT = 500;
const MAX_BULK_CHAPTERS = 2000;
const MAX_PAGES_PER_CHAPTER = 300;
const EXTRACT_TIMEOUT_MS = 45_000;
const EXTRACT_TEXT_CAP = 60_000;
const EXTRACT_HTML_CAP = 300_000;

// ---------------------------------------------------------------------------
// PostgREST helper — every DB call goes through here.
// ---------------------------------------------------------------------------

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function pg(
  path: string,
  opts: { method?: string; query?: string; body?: unknown; prefer?: string; wantCount?: boolean } = {},
): Promise<{ data: unknown; count: number | null }> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new ApiError("Server misconfigured: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not available", 500);
  }
  const method = opts.method ?? "GET";
  const url = `${SUPABASE_URL}/rest/v1/${path}${opts.query ? `?${opts.query}` : ""}`;
  const headers: Record<string, string> = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Profile": SCHEMA,
    "Accept-Profile": SCHEMA,
  };
  const preferParts: string[] = [];
  if (opts.prefer) preferParts.push(opts.prefer);
  if (opts.wantCount) preferParts.push("count=exact");
  if (preferParts.length) headers["Prefer"] = preferParts.join(",");
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });

  let count: number | null = null;
  const contentRange = res.headers.get("content-range");
  if (contentRange) {
    const m = contentRange.match(/\/(\d+)$/);
    if (m) count = Number(m[1]);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new ApiError(`Database error (${res.status}): ${errBody.slice(0, 500)}`, res.status === 409 ? 409 : 502);
  }
  if (res.status === 204) return { data: null, count };
  const data = await res.json().catch(() => null);
  return { data, count };
}

// ---------------------------------------------------------------------------
// Auth — SHA-256(key) looked up against api_keys.key_hash. Scope ordinal:
// read(1) < write(2) < admin(3). A key satisfies a requirement if its own
// scope rank is >= the route's required rank.
// ---------------------------------------------------------------------------

const SCOPE_RANK: Record<string, number> = { read: 1, write: 2, admin: 3 };

async function sha256Hex(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface ApiKeyRow {
  id: string;
  name: string;
  scope: string;
}

async function authenticate(req: Request, requiredScope: "read" | "write" | "admin"): Promise<ApiKeyRow> {
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  const rawKey = bearer ?? req.headers.get("x-api-key");
  if (!rawKey?.trim()) {
    throw new ApiError("Missing API key — supply 'Authorization: Bearer <key>' or 'x-api-key: <key>'", 401);
  }
  const hash = await sha256Hex(rawKey.trim());
  const { data } = await pg("api_keys", {
    query: `key_hash=eq.${encodeURIComponent(hash)}&revoked_at=is.null&select=id,name,scope&limit=1`,
  });
  const row = Array.isArray(data) ? (data[0] as ApiKeyRow | undefined) : undefined;
  if (!row) throw new ApiError("Invalid or revoked API key", 401);
  if (SCOPE_RANK[row.scope] < SCOPE_RANK[requiredScope]) {
    throw new ApiError(`This key has '${row.scope}' scope; this route requires '${requiredScope}' or higher`, 403);
  }
  // Fire-and-forget last_used_at touch — never block/fail the request on it.
  pg(`api_keys?id=eq.${row.id}`, { method: "PATCH", body: { last_used_at: new Date().toISOString() } }).catch(() => {});
  // Stash on the Request object so the outer request-logger (which has no
  // other way to reach whichever handler ran) can attribute this call to a
  // key without threading a return value through every route function.
  (req as unknown as { _apiKeyRow?: ApiKeyRow })._apiKeyRow = row;
  return row;
}

// ---------------------------------------------------------------------------
// Admin-UI auth — a SEPARATE auth path used only by /admin/* routes below.
// Those are called from the site's own logged-in admin panel (Supabase
// session JWT via supabase-js, same as every other admin button in this
// app), not by external API callers with an api_keys row — there's no
// chicken-or-egg way to manage keys using a key. Verifies the bearer token
// against this instance's own GoTrue (/auth/v1/user), then checks the
// resulting user id against manga_sanctuary.user_roles the same way the
// frontend's own has_role() RPC does, just via the service-role key instead
// of RLS (this table has no RLS policies reachable by the caller directly).
// ---------------------------------------------------------------------------

async function authenticateAdminUI(req: Request): Promise<{ id: string; email: string }> {
  const jwt = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!jwt) throw new ApiError("Missing Supabase session token", 401);
  if (!SUPABASE_URL || !SERVICE_KEY) throw new ApiError("Server misconfigured", 500);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: SERVICE_KEY },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res || !res.ok) throw new ApiError("Invalid or expired session", 401);
  const user = await res.json().catch(() => null);
  if (!user?.id) throw new ApiError("Invalid or expired session", 401);
  const { data } = await pg("user_roles", {
    query: `user_id=eq.${encodeURIComponent(user.id)}&role=eq.admin&select=id&limit=1`,
  });
  if (!Array.isArray(data) || data.length === 0) throw new ApiError("Admin privileges required", 403);
  return { id: user.id, email: typeof user.email === "string" ? user.email : "" };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function clampInt(raw: string | null, def: number, min: number, max: number): number {
  // Number(null) === 0 (finite!) — must check for "param absent" BEFORE the
  // numeric conversion, or an omitted ?limit= silently becomes 0 clamped to
  // `min` instead of falling back to the intended default.
  if (raw === null || raw.trim() === "") return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

// Callers (agents, CLI users) sometimes send a literal placeholder instead of
// omitting the field entirely — e.g. "--author None"/"null"/"N/A" when there
// genuinely isn't one. Without this guard we'd create a real authors/artists
// row named "None" and attach every such manga to it.
const NAME_PLACEHOLDER_VALUES = new Set([
  "none", "null", "n/a", "na", "unknown", "undefined", "-", "tbd",
]);

async function resolvePersonId(table: "authors" | "artists", name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (NAME_PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return null;
  const { data: existing } = await pg(table, {
    query: `name=ilike.${encodeURIComponent(trimmed)}&select=id&limit=1`,
  });
  const existingRow = Array.isArray(existing) ? existing[0] as { id: string } | undefined : undefined;
  if (existingRow) return existingRow.id;
  const { data: created } = await pg(table, {
    method: "POST",
    body: { name: trimmed },
    prefer: "return=representation",
  });
  const createdRow = Array.isArray(created) ? created[0] as { id: string } | undefined : undefined;
  return createdRow?.id ?? null;
}

const MANGA_TYPES = new Set(["Manga", "Manhwa", "Manhua", "Webtoon"]);

const MANGA_WRITABLE_FIELDS = [
  "title", "alt_titles", "description", "language", "status",
  "manga_type", "cover_url", "is_approved",
] as const;

async function buildMangaPayload(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = {};
  for (const field of MANGA_WRITABLE_FIELDS) {
    if (body[field] !== undefined) payload[field] = body[field];
  }
  if (typeof body.manga_type === "string" && !MANGA_TYPES.has(body.manga_type)) {
    throw new ApiError(`manga_type must be one of: ${[...MANGA_TYPES].join(", ")}`, 400);
  }
  if (typeof body.author === "string" && body.author.trim()) {
    payload.author_id = await resolvePersonId("authors", body.author);
  }
  if (typeof body.artist === "string" && body.artist.trim()) {
    payload.artist_id = await resolvePersonId("artists", body.artist);
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Route handlers — Manga
// ---------------------------------------------------------------------------

async function listManga(req: Request, params: URLSearchParams) {
  await authenticate(req, "read");
  const filters: string[] = [];
  const q = params.get("q")?.trim();
  if (q) filters.push(`or=(title.ilike.*${encodeURIComponent(q)}*,description.ilike.*${encodeURIComponent(q)}*)`);
  for (const field of ["status", "language", "manga_type", "is_approved"]) {
    const v = params.get(field);
    if (v !== null) filters.push(`${field}=eq.${encodeURIComponent(v)}`);
  }
  const limit = clampInt(params.get("limit"), 20, 1, MAX_LIST_LIMIT);
  const offset = clampInt(params.get("offset"), 0, 0, 1_000_000);
  const sort = params.get("sort") === "recent" ? "created_at.desc" : "title.asc";
  filters.push(`select=id,title,alt_titles,description,language,status,manga_type,cover_url,is_approved,created_at,authors(name),artists(name)`);
  filters.push(`order=${sort}`, `limit=${limit}`, `offset=${offset}`);
  const { data, count } = await pg("manga", { query: filters.join("&"), wantCount: true });
  const rows = (Array.isArray(data) ? data : []).map((r: any) => ({
    ...r, author: r.authors?.name ?? null, artist: r.artists?.name ?? null, authors: undefined, artists: undefined,
  }));
  return jsonResponse({ manga: rows, limit, offset, total: count });
}

async function getManga(req: Request, id: string) {
  await authenticate(req, "read");
  const { data } = await pg("manga", {
    query: `id=eq.${encodeURIComponent(id)}&select=*,authors(name),artists(name),manga_genres(genres(name)),manga_tags(tags(name))&limit=1`,
  });
  const row = Array.isArray(data) ? data[0] as any : null;
  if (!row) return jsonResponse({ error: "Manga not found" }, 404);
  const { count } = await pg("chapters", { query: `manga_id=eq.${id}&select=id&limit=1`, wantCount: true });
  return jsonResponse({
    ...row,
    author: row.authors?.name ?? null,
    artist: row.artists?.name ?? null,
    authors: undefined,
    artists: undefined,
    genres: (row.manga_genres ?? []).map((g: any) => g.genres?.name).filter(Boolean),
    manga_genres: undefined,
    tags: (row.manga_tags ?? []).map((t: any) => t.tags?.name).filter(Boolean),
    manga_tags: undefined,
    chapter_count: count ?? 0,
  });
}

// Normalizes a title for duplicate detection: lowercases, strips punctuation
// (so curly vs straight apostrophes, colons, etc. don't create near-duplicate
// rows), and collapses whitespace. Ported verbatim from novel-api's guard —
// same class of bug applies here (an agent creating a manga it doesn't
// already have the UUID for is exactly a find-then-create race).
function normalizeTitleForDedup(title: string): string {
  return title
    .toLowerCase()
    .replace(/[‘’“”'"]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Picks a substring to `ilike` against the RAW (un-normalized) stored title —
// must be a word unaffected by punctuation-style differences we're trying to
// catch. See novel-api's identical helper for the full rationale.
function pickSafeSearchWord(rawTitle: string): string | null {
  const tokens = rawTitle.split(/\s+/).map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""));
  const safeWords = tokens.filter((t) => t.length >= 3 && /^[\p{L}\p{N}]+$/u.test(t));
  if (safeWords.length === 0) return null;
  return safeWords.reduce((longest, w) => (w.length > longest.length ? w : longest)).toLowerCase();
}

async function createManga(req: Request) {
  await authenticate(req, "write");
  const body = await req.json().catch(() => ({}));
  if (typeof body.title !== "string" || !body.title.trim()) {
    return jsonResponse({ error: "title is required" }, 400);
  }

  // Duplicate guard: fetch a broad candidate set (ilike on a punctuation-safe
  // word from the raw title) and compare normalized titles in-process, since
  // Postgres/PostgREST has no built-in "ignore punctuation" comparator.
  //
  // manga_type is the disambiguator here the same way novel_type is for
  // novel-api — a Manga vs a Manhwa adaptation can legitimately share a
  // title as two distinct rows.
  const normalizedTarget = normalizeTitleForDedup(body.title);
  const searchWord = pickSafeSearchWord(body.title);
  const requestedType = typeof body.manga_type === "string" ? body.manga_type.trim() : "";
  if (searchWord && !body.force_create) {
    const { data: candidates } = await pg("manga", {
      query: `title=ilike.*${encodeURIComponent(searchWord)}*&select=id,title,alt_titles,description,language,status,manga_type,cover_url,is_approved,created_at,authors(name),artists(name)&limit=50`,
    });
    const sameTitle = (Array.isArray(candidates) ? candidates : []).filter(
      (r: any) => normalizeTitleForDedup(r.title ?? "") === normalizedTarget,
    ) as any[];

    if (sameTitle.length > 0) {
      if (requestedType) {
        const sameEdition = sameTitle.find((r) => (r.manga_type ?? "") === requestedType);
        if (sameEdition) {
          return jsonResponse({
            manga: { ...sameEdition, author: sameEdition.authors?.name ?? null, artist: sameEdition.artists?.name ?? null, authors: undefined, artists: undefined },
            duplicate: true,
            message: `A "${sameEdition.manga_type || "untyped"}" edition of this title already exists — returning the existing row instead of creating a new one. Pass force_create:true to override.`,
          }, 200);
        }
      } else if (sameTitle.length === 1) {
        const only = sameTitle[0];
        return jsonResponse({
          manga: { ...only, author: only.authors?.name ?? null, artist: only.artists?.name ?? null, authors: undefined, artists: undefined },
          duplicate: true,
          message: "A manga with this title already exists — returning the existing row instead of creating a new one. Pass manga_type to target a specific edition, or force_create:true to override.",
        }, 200);
      } else {
        return jsonResponse({
          duplicate: false,
          ambiguous: true,
          existing_editions: sameTitle.map((r: any) => ({ id: r.id, manga_type: r.manga_type || null })),
          message: "Multiple editions of this title already exist (e.g. Manga vs Manhwa). Pass manga_type to reuse/create the matching edition, or force_create:true to add another anyway.",
        }, 200);
      }
    }
  }

  const payload = await buildMangaPayload(body);
  if (payload.is_approved === undefined) payload.is_approved = true;
  if (payload.manga_type === undefined) payload.manga_type = "Manga";
  const { data } = await pg("manga", { method: "POST", body: payload, prefer: "return=representation" });
  const row = Array.isArray(data) ? data[0] : data;
  return jsonResponse({ manga: row, duplicate: false }, 201);
}

async function updateManga(req: Request, id: string) {
  await authenticate(req, "write");
  const body = await req.json().catch(() => ({}));
  const payload = await buildMangaPayload(body);
  if (Object.keys(payload).length === 0) return jsonResponse({ error: "No updatable fields provided" }, 400);
  const { data } = await pg(`manga?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", body: payload, prefer: "return=representation",
  });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return jsonResponse({ error: "Manga not found" }, 404);
  return jsonResponse({ manga: row });
}

async function deleteManga(req: Request, id: string) {
  await authenticate(req, "admin");
  await pg(`manga?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  return jsonResponse({ deleted: true });
}

// ---------------------------------------------------------------------------
// Route handlers — Chapters
// ---------------------------------------------------------------------------

interface ApiPage {
  page_number: number;
  image_url: string;
}

function normalizePages(raw: unknown): ApiPage[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_PAGES_PER_CHAPTER) throw new ApiError(`Too many pages (max ${MAX_PAGES_PER_CHAPTER})`, 400);
  const pages: ApiPage[] = [];
  for (const [i, p] of raw.entries()) {
    const image_url = typeof p === "string" ? p : (p && typeof p.image_url === "string" ? p.image_url : null);
    if (!image_url) throw new ApiError(`pages[${i}] must be a URL string or {page_number, image_url}`, 400);
    const page_number = typeof p === "object" && p && Number.isFinite(Number(p.page_number)) ? Number(p.page_number) : i + 1;
    pages.push({ page_number, image_url });
  }
  return pages.sort((a, b) => a.page_number - b.page_number);
}

async function listChapters(req: Request, mangaId: string, params: URLSearchParams) {
  await authenticate(req, "read");
  const limit = clampInt(params.get("limit"), 100, 1, MAX_CHAPTER_LIST_LIMIT);
  const offset = clampInt(params.get("offset"), 0, 0, 1_000_000);
  const includePages = params.get("include_pages") === "true";
  const fields = includePages
    ? "id,manga_id,chapter_number,chapter_title,external_url,volume_number,volume_title,release_date,pages,strip_url,stitch_status"
    : "id,manga_id,chapter_number,chapter_title,external_url,volume_number,volume_title,release_date,strip_url,stitch_status";
  const filters = [`manga_id=eq.${encodeURIComponent(mangaId)}`, `select=${fields}`, "order=chapter_number.asc", `limit=${limit}`, `offset=${offset}`];
  const from = params.get("from");
  const to = params.get("to");
  if (from !== null) filters.push(`chapter_number=gte.${encodeURIComponent(from)}`);
  if (to !== null) filters.push(`chapter_number=lte.${encodeURIComponent(to)}`);
  const { data, count } = await pg("chapters", { query: filters.join("&"), wantCount: true });
  return jsonResponse({ chapters: data ?? [], limit, offset, total: count });
}

async function getChapter(req: Request, id: string) {
  await authenticate(req, "read");
  const { data } = await pg("chapters", { query: `id=eq.${encodeURIComponent(id)}&select=*&limit=1` });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return jsonResponse({ error: "Chapter not found" }, 404);
  return jsonResponse({ chapter: row });
}

const CHAPTER_UPSERT_META_FIELDS = [
  "chapter_title", "external_url", "volume_number", "volume_title", "release_date",
] as const;

async function bulkUpsertChapters(req: Request, mangaId: string) {
  await authenticate(req, "write");
  const body = await req.json().catch(() => ({}));
  const list = Array.isArray(body.chapters) ? body.chapters : null;
  if (!list || list.length === 0) return jsonResponse({ error: "Body must include a non-empty 'chapters' array" }, 400);
  if (list.length > MAX_BULK_CHAPTERS) {
    return jsonResponse({ error: `Too many chapters in one request (max ${MAX_BULK_CHAPTERS}); split into multiple calls` }, 400);
  }

  const chapterNumbers: number[] = [];
  const pagesByIndex: (ApiPage[] | null)[] = [];
  for (const [i, ch] of list.entries()) {
    const n = Number(ch?.chapter_number);
    if (!Number.isFinite(n)) return jsonResponse({ error: `chapters[${i}].chapter_number is required and must be a number` }, 400);
    chapterNumbers.push(n);
    try {
      pagesByIndex.push(ch?.pages !== undefined ? normalizePages(ch.pages) : null);
    } catch (err) {
      if (err instanceof ApiError) return jsonResponse({ error: `chapters[${i}]: ${err.message}` }, 400);
      throw err;
    }
  }

  // Look up whatever already exists for these exact (manga_id, chapter_number)
  // pairs so an omitted field on a chapter that's already saved gets
  // PRESERVED rather than nulled out. PostgREST's bulk upsert writes every
  // key present in the row object on conflict (no partial-column semantics)
  // AND requires every object in the array to carry the identical key set —
  // so every row below ends up with the full field list regardless.
  const { data: existingRows } = await pg("chapters", {
    query: `manga_id=eq.${encodeURIComponent(mangaId)}&chapter_number=in.(${chapterNumbers.join(",")})&select=chapter_number,${CHAPTER_UPSERT_META_FIELDS.join(",")},pages`,
  });
  const existingByNumber = new Map<number, Record<string, unknown>>(
    (Array.isArray(existingRows) ? existingRows : []).map((r: any) => [r.chapter_number, r]),
  );

  const rows: Record<string, unknown>[] = list.map((ch: any, i: number) => {
    const chapterNumber = chapterNumbers[i];
    const existing = existingByNumber.get(chapterNumber) ?? {};
    const row: Record<string, unknown> = { manga_id: mangaId, chapter_number: chapterNumber };

    for (const field of CHAPTER_UPSERT_META_FIELDS) {
      row[field] = ch[field] !== undefined ? ch[field] : (existing[field] ?? null);
    }
    const newPages = pagesByIndex[i];
    if (newPages) {
      row.pages = newPages;
      // A fresh page set invalidates any previously stitched long-strip —
      // same reset the admin content-fetch hook applies (use-chapters-admin.ts)
      // so a stale strip from an earlier run can never linger against new pages.
      row.strip_url = null;
      row.stitch_status = "none";
    } else {
      row.pages = existing.pages ?? [];
    }
    return row;
  });

  const { data } = await pg("chapters", {
    method: "POST",
    query: "on_conflict=manga_id,chapter_number",
    body: rows,
    prefer: "resolution=merge-duplicates,return=representation",
  });
  const saved = Array.isArray(data) ? data : [];
  return jsonResponse({ upserted: saved.length, chapters: saved.map((r: any) => ({ id: r.id, chapter_number: r.chapter_number })) }, 201);
}

async function updateChapter(req: Request, id: string) {
  await authenticate(req, "write");
  const body = await req.json().catch(() => ({}));
  const payload: Record<string, unknown> = {};
  if (body.chapter_number !== undefined) payload.chapter_number = body.chapter_number;
  if (typeof body.chapter_title === "string") payload.chapter_title = body.chapter_title;
  if (typeof body.external_url === "string") payload.external_url = body.external_url;
  if (body.volume_number !== undefined) payload.volume_number = body.volume_number;
  if (typeof body.volume_title === "string") payload.volume_title = body.volume_title;
  if (body.release_date !== undefined) payload.release_date = body.release_date;
  if (body.pages !== undefined) {
    let pages: ApiPage[] | null;
    try {
      pages = normalizePages(body.pages);
    } catch (err) {
      if (err instanceof ApiError) return jsonResponse({ error: err.message }, 400);
      throw err;
    }
    payload.pages = pages ?? [];
    payload.strip_url = null;
    payload.stitch_status = "none";
  }
  if (Object.keys(payload).length === 0) return jsonResponse({ error: "No updatable fields provided" }, 400);
  const { data } = await pg(`chapters?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", body: payload, prefer: "return=representation",
  });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return jsonResponse({ error: "Chapter not found" }, 404);
  return jsonResponse({ chapter: row });
}

async function deleteChapter(req: Request, id: string) {
  await authenticate(req, "write");
  await pg(`chapters?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  return jsonResponse({ deleted: true });
}

async function deleteChapterRange(req: Request, mangaId: string, params: URLSearchParams) {
  await authenticate(req, "write");
  const from = params.get("from");
  const to = params.get("to");
  if (from === null || to === null) return jsonResponse({ error: "Both 'from' and 'to' query params are required" }, 400);
  const { data } = await pg(
    `chapters?manga_id=eq.${encodeURIComponent(mangaId)}&chapter_number=gte.${encodeURIComponent(from)}&chapter_number=lte.${encodeURIComponent(to)}`,
    { method: "DELETE", prefer: "return=representation" },
  );
  const deleted = Array.isArray(data) ? data.length : 0;
  return jsonResponse({ deleted });
}

async function listTaxonomy(req: Request, table: "genres" | "tags", params: URLSearchParams) {
  await authenticate(req, "read");
  const q = params.get("q")?.trim();
  const filters = ["select=id,name", "order=name.asc", "limit=500"];
  if (q) filters.push(`name=ilike.*${encodeURIComponent(q)}*`);
  const { data } = await pg(table, { query: filters.join("&") });
  return jsonResponse({ [table]: data ?? [] });
}

// ---------------------------------------------------------------------------
// Admin key management + usage dashboard (/admin/*) — Supabase-session
// gated via authenticateAdminUI, not an api_keys row. Backs the site's own
// "API Keys" and "API Dashboard" admin pages.
// ---------------------------------------------------------------------------

interface AdminApiKeyRow {
  id: string; name: string; scope: string; created_at: string;
  last_used_at: string | null; revoked_at: string | null;
}

async function listApiKeysAdmin(req: Request) {
  await authenticateAdminUI(req);
  const { data } = await pg("api_keys", {
    query: "select=id,name,scope,created_at,last_used_at,revoked_at&order=created_at.desc",
  });
  return jsonResponse({ keys: (data as AdminApiKeyRow[] | null) ?? [] });
}

function randomApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `msapi_${hex}`;
}

async function createApiKeyAdmin(req: Request) {
  await authenticateAdminUI(req);
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const scope = typeof body.scope === "string" ? body.scope : "read";
  if (!name) return jsonResponse({ error: "name is required" }, 400);
  if (!SCOPE_RANK[scope]) return jsonResponse({ error: "scope must be one of read, write, admin" }, 400);
  const rawKey = randomApiKey();
  const key_hash = await sha256Hex(rawKey);
  const { data } = await pg("api_keys", {
    method: "POST",
    body: { name, scope, key_hash },
    prefer: "return=representation",
  });
  const row = Array.isArray(data) ? (data[0] as AdminApiKeyRow) : null;
  if (!row) return jsonResponse({ error: "Failed to create key" }, 500);
  // The raw key is returned exactly once — only its hash is ever stored.
  return jsonResponse({
    id: row.id, name: row.name, scope: row.scope, created_at: row.created_at, key: rawKey,
  }, 201);
}

async function revokeApiKeyAdmin(req: Request, id: string) {
  await authenticateAdminUI(req);
  const { data } = await pg(`api_keys?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", body: { revoked_at: new Date().toISOString() }, prefer: "return=representation",
  });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return jsonResponse({ error: "Key not found" }, 404);
  return jsonResponse({ revoked: true });
}

function normalizeUsagePath(path: string): string {
  return path.split("/").map((seg) => (UUID_RE.test(seg) ? ":id" : seg)).join("/") || "/";
}

async function getUsageAdmin(req: Request, params: URLSearchParams) {
  await authenticateAdminUI(req);
  const days = clampInt(params.get("days"), 14, 1, 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { count: totalAllTime } = await pg("api_request_logs", { query: "select=id&limit=1", wantCount: true });
  const { data: rows, count: totalInWindow } = await pg("api_request_logs", {
    query: `created_at=gte.${encodeURIComponent(since)}&select=method,path,status_code,duration_ms,created_at,key_name,api_key_id&order=created_at.desc&limit=5000`,
    wantCount: true,
  });
  const list = Array.isArray(rows) ? rows as {
    method: string; path: string; status_code: number; duration_ms: number | null;
    created_at: string; key_name: string | null; api_key_id: string | null;
  }[] : [];

  const byDay = new Map<string, { total: number; errors: number }>();
  const byEndpoint = new Map<string, { count: number; totalDuration: number; durationSamples: number }>();
  const byKey = new Map<string, { name: string; count: number; lastSeen: string }>();
  let errors4xx = 0, errors5xx = 0;

  for (const r of list) {
    const day = r.created_at.slice(0, 10);
    const d = byDay.get(day) ?? { total: 0, errors: 0 };
    d.total++;
    if (r.status_code >= 400) d.errors++;
    byDay.set(day, d);

    if (r.status_code >= 500) errors5xx++;
    else if (r.status_code >= 400) errors4xx++;

    const ep = `${r.method} ${normalizeUsagePath(r.path)}`;
    const e = byEndpoint.get(ep) ?? { count: 0, totalDuration: 0, durationSamples: 0 };
    e.count++;
    if (typeof r.duration_ms === "number") { e.totalDuration += r.duration_ms; e.durationSamples++; }
    byEndpoint.set(ep, e);

    const keyLabel = r.api_key_id ?? "unauthenticated";
    const k = byKey.get(keyLabel) ?? { name: r.key_name ?? "Unauthenticated / invalid key", count: 0, lastSeen: r.created_at };
    k.count++;
    if (r.created_at > k.lastSeen) k.lastSeen = r.created_at;
    byKey.set(keyLabel, k);
  }

  const dailySeries: { date: string; total: number; errors: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const d = byDay.get(date);
    dailySeries.push({ date, total: d?.total ?? 0, errors: d?.errors ?? 0 });
  }

  const topEndpoints = [...byEndpoint.entries()]
    .map(([endpoint, v]) => ({
      endpoint, count: v.count,
      avg_duration_ms: v.durationSamples ? Math.round(v.totalDuration / v.durationSamples) : null,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const keyUsage = [...byKey.entries()]
    .map(([id, v]) => ({ api_key_id: id === "unauthenticated" ? null : id, name: v.name, count: v.count, last_seen: v.lastSeen }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return jsonResponse({
    total_all_time: totalAllTime ?? 0,
    total_in_window: totalInWindow ?? 0,
    window_days: days,
    errors_4xx: errors4xx,
    errors_5xx: errors5xx,
    daily: dailySeries,
    top_endpoints: topEndpoints,
    key_usage: keyUsage,
    recent: list.slice(0, 50),
  });
}

// Same plain-fetch-first-then-Byparr pattern as manga-chapter-content, but
// intentionally NOT restricted to a curated safe-domain list — this route
// exists precisely so a caller can hand it an arbitrary/unknown site (an
// oddball reader layout our automatic sources don't recognize) and get back
// raw readable text/HTML to parse itself (e.g. to find its own <img> page
// URLs). Falls back to Byparr only if the plain fetch fails outright or the
// returned page looks too small to be real content.
async function fetchRawPage(url: string): Promise<{ html: string; via: "plain" | "byparr" } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const html = await res.text();
      if (html.length > 1000) return { html, via: "plain" };
    }
  } catch { /* fall through to Byparr */ }
  const html = await byparrFetch(url, EXTRACT_TIMEOUT_MS);
  return html ? { html, via: "byparr" } : null;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function extractPage(req: Request) {
  await authenticate(req, "read");
  const body = await req.json().catch(() => ({}));
  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  if (!rawUrl) return jsonResponse({ error: "url is required" }, 400);
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return jsonResponse({ error: "url is not a valid URL" }, 400);
  }
  const mode = body.mode === "html" || body.mode === "both" ? body.mode : "text";

  const result = await fetchRawPage(rawUrl);
  if (!result) {
    return jsonResponse({ success: false, reason: "Could not fetch this URL (site unreachable or a bot-wall we couldn't clear)." });
  }

  const titleMatch = result.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, " ") : null;
  const readable = htmlToReadableText(result.html);
  const textTruncated = readable.length > EXTRACT_TEXT_CAP;
  const responseBody: Record<string, unknown> = {
    success: true,
    hostname: parsed.hostname,
    fetched_via: result.via,
    title,
    word_count: wordCount(readable),
  };
  if (mode === "text" || mode === "both") {
    responseBody.readable_text = readable.slice(0, EXTRACT_TEXT_CAP);
    responseBody.readable_text_truncated = textTruncated;
  }
  if (mode === "html" || mode === "both") {
    responseBody.raw_html = result.html.slice(0, EXTRACT_HTML_CAP);
    responseBody.raw_html_truncated = result.html.length > EXTRACT_HTML_CAP;
  }
  return jsonResponse(responseBody);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function routeRequest(req: Request, route: string[], url: URL): Promise<Response> {
  // GET /health — no auth, quick liveness probe.
  if (req.method === "GET" && route.length === 1 && route[0] === "health") {
    return jsonResponse({ ok: true, time: new Date().toISOString() });
  }

  // /admin/keys, /admin/keys/:id, /admin/usage — Supabase-session gated,
  // backs the admin panel's key-management and usage-dashboard pages.
  if (route[0] === "admin") {
    if (route[1] === "keys") {
      if (route.length === 2) {
        if (req.method === "GET") return await listApiKeysAdmin(req);
        if (req.method === "POST") return await createApiKeyAdmin(req);
      }
      if (route.length === 3 && UUID_RE.test(route[2]) && req.method === "DELETE") {
        return await revokeApiKeyAdmin(req, route[2]);
      }
    }
    if (route.length === 2 && route[1] === "usage" && req.method === "GET") {
      return await getUsageAdmin(req, url.searchParams);
    }
  }

  // /manga, /manga/:id
  if (route[0] === "manga") {
    if (route.length === 1) {
      if (req.method === "GET") return await listManga(req, url.searchParams);
      if (req.method === "POST") return await createManga(req);
    }
    if (route.length === 2 && UUID_RE.test(route[1])) {
      const id = route[1];
      if (req.method === "GET") return await getManga(req, id);
      if (req.method === "PATCH") return await updateManga(req, id);
      if (req.method === "DELETE") return await deleteManga(req, id);
    }
    // /manga/:id/chapters
    if (route.length === 3 && UUID_RE.test(route[1]) && route[2] === "chapters") {
      const id = route[1];
      if (req.method === "GET") return await listChapters(req, id, url.searchParams);
      if (req.method === "POST") return await bulkUpsertChapters(req, id);
      if (req.method === "DELETE") return await deleteChapterRange(req, id, url.searchParams);
    }
  }

  // /chapters/:id
  if (route[0] === "chapters" && route.length === 2 && UUID_RE.test(route[1])) {
    const id = route[1];
    if (req.method === "GET") return await getChapter(req, id);
    if (req.method === "PATCH") return await updateChapter(req, id);
    if (req.method === "DELETE") return await deleteChapter(req, id);
  }

  // /extract
  if (route.length === 1 && route[0] === "extract" && req.method === "POST") {
    return await extractPage(req);
  }

  // /genres, /tags
  if (route.length === 1 && (route[0] === "genres" || route[0] === "tags") && req.method === "GET") {
    return await listTaxonomy(req, route[0], url.searchParams);
  }

  return jsonResponse({ error: "Not found", route: `/${route.join("/")}`, method: req.method }, 404);
}

// Fire-and-forget activity log, feeding the admin "API Dashboard" page.
// Deliberately excludes /admin/* itself — that's site-admin browsing, not
// third-party API traffic, and would just inflate the dashboard's own
// numbers about itself every time someone loads it.
async function logRequest(req: Request, route: string[], status: number, durationMs: number) {
  if (route[0] === "admin" || route[0] === "health") return;
  const keyRow = (req as unknown as { _apiKeyRow?: ApiKeyRow })._apiKeyRow;
  await pg("api_request_logs", {
    method: "POST",
    body: {
      api_key_id: keyRow?.id ?? null,
      key_name: keyRow?.name ?? null,
      method: req.method,
      path: `/${route.join("/")}`,
      status_code: status,
      duration_ms: Math.round(durationMs),
    },
  }).catch(() => {});
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  const url = new URL(req.url);
  // Strip everything up to and including this function's own path segment
  // — works whether invoked as .../manga-api/... (local dev) or
  // .../manga-sanctuary-manga-api/... (Kestra's prefixed deploy name).
  const segments = url.pathname.split("/").filter(Boolean);
  const fnIdx = segments.findIndex((s) => s === "manga-api" || s.endsWith("-manga-api"));
  const route = fnIdx >= 0 ? segments.slice(fnIdx + 1) : segments;

  const start = Date.now();
  let response: Response;
  try {
    response = await routeRequest(req, route, url);
  } catch (err) {
    if (err instanceof ApiError) {
      response = jsonResponse({ error: err.message }, err.status);
    } else {
      console.error("manga-api error:", err);
      response = jsonResponse({ error: "Internal error", detail: err instanceof Error ? err.message : String(err) }, 500);
    }
  }
  logRequest(req, route, response.status, Date.now() - start).catch(() => {});
  return response;
});
