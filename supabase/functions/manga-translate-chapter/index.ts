/**
 * Machine translation (MTL) orchestrator for JP/CN/KR raw chapters — per the
 * "Manga Sanctuary — Machine Image Translation (MTL) Handoff" spec. Thin
 * gateway only: does NOT run OCR/inpaint itself (that must not run in
 * Supabase edge — see spec) — it queues a job, hands page URLs to the
 * SHARED external MTL worker (same one doujin-sanctuary calls), and on the
 * worker's callback re-hosts the translated pages into OUR OWN Storage
 * bucket under a `manga/tl/en/{chapter_id}/` prefix, distinct from
 * doujin's `doujin/tl/en/` prefix (same bucket, app-prefixed paths — no
 * collision).
 *
 * Two routes:
 *   POST /            — reader-triggered: queue (or return existing/idempotent)
 *                        translation job for a chapter.
 *   POST /callback     — WORKER-triggered: reports progress/completion,
 *                        gated by a shared secret header (not end-user auth).
 *
 * Never overwrites `chapters.pages`/original page rows — translated pages
 * live in their own `translation_job_pages` table; the reader toggles
 * between the two sets (see MangaReader.tsx's Original|EN(MTL) control).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsResponse, jsonResponse, uploadBytesToStorage } from "../_shared/manga-sanctuary/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SCHEMA = "manga_sanctuary";

// Same shared worker doujin-sanctuary calls — both apps get their own
// prefixed copies of these two env vars pointing at the identical service,
// consistent with how MANGA_SANCTUARY_BYPARR_URL is already a per-app
// pointer to a genuinely shared Byparr instance.
const WORKER_URL = Deno.env.get("MANGA_SANCTUARY_MTL_WORKER_URL") ?? "";
const WORKER_SECRET = Deno.env.get("MANGA_SANCTUARY_MTL_WORKER_SECRET") ?? "";

const LANG_MAP: Record<string, string> = { JP: "ja", CN: "zh", KR: "ko" };

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function pg(
  path: string,
  opts: { method?: string; query?: string; body?: unknown; prefer?: string } = {},
): Promise<unknown> {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new ApiError("Server misconfigured: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not available", 500);
  const method = opts.method ?? "GET";
  const url = `${SUPABASE_URL}/rest/v1/${path}${opts.query ? `?${opts.query}` : ""}`;
  const headers: Record<string, string> = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Profile": SCHEMA,
    "Accept-Profile": SCHEMA,
  };
  if (opts.prefer) headers["Prefer"] = opts.prefer;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new ApiError(`Database error (${res.status}): ${errBody.slice(0, 500)}`, 502);
  }
  if (res.status === 204) return null;
  return await res.json().catch(() => null);
}

async function requireSignedInUser(req: Request): Promise<{ id: string }> {
  const jwt = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!jwt) throw new ApiError("Missing Supabase session token", 401);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: SERVICE_KEY },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res || !res.ok) throw new ApiError("Invalid or expired session", 401);
  const user = await res.json().catch(() => null);
  if (!user?.id) throw new ApiError("Invalid or expired session", 401);
  return { id: user.id };
}

// ---------------------------------------------------------------------------
// POST / — queue (or return existing) translation job
// ---------------------------------------------------------------------------

interface ChapterRow {
  id: string;
  manga_id: string;
  pages: { page_number: number; image_url: string }[] | null;
}
interface MangaRow {
  language: string;
  title: string;
}
interface JobRow {
  id: string;
  chapter_id: string;
  source_lang: string;
  target_lang: string;
  status: string;
  progress: number;
  error: string | null;
}

async function queueTranslation(req: Request): Promise<Response> {
  await requireSignedInUser(req);
  const body = await req.json().catch(() => ({}));
  const chapterId = typeof body.chapter_id === "string" ? body.chapter_id.trim() : "";
  const targetLang = typeof body.target_lang === "string" && body.target_lang.trim() ? body.target_lang.trim().toLowerCase() : "en";
  const force = body.force === true;
  if (!chapterId) return jsonResponse({ success: false, reason: "chapter_id is required" }, 400);
  if (!WORKER_URL) return jsonResponse({ success: false, reason: "worker_not_configured", message: "MANGA_SANCTUARY_MTL_WORKER_URL is not provisioned yet" }, 503);

  const chapterRows = await pg("chapters", { query: `id=eq.${encodeURIComponent(chapterId)}&select=id,manga_id,pages&limit=1` }) as ChapterRow[] | null;
  const chapter = chapterRows?.[0];
  if (!chapter) return jsonResponse({ success: false, reason: "chapter_not_found" }, 404);
  const pages = Array.isArray(chapter.pages) ? chapter.pages : [];
  if (pages.length === 0) return jsonResponse({ success: false, reason: "no_pages" });

  const mangaRows = await pg("manga", { query: `id=eq.${encodeURIComponent(chapter.manga_id)}&select=language,title&limit=1` }) as MangaRow[] | null;
  const manga = mangaRows?.[0];
  const sourceLang = manga ? LANG_MAP[manga.language] : undefined;
  if (!sourceLang) {
    // Covers both "already EN" (nothing to translate — prefer whatever
    // human content already exists) and any language this worker contract
    // doesn't cover yet.
    return jsonResponse({ success: false, reason: manga?.language === "EN" ? "already_english" : "unsupported_source_language" });
  }

  // Idempotency: a running/queued job for this (chapter, target_lang) is
  // reused as-is unless force. A done job is returned as already-complete.
  const existingRows = await pg("translation_jobs", {
    query: `chapter_id=eq.${encodeURIComponent(chapterId)}&target_lang=eq.${encodeURIComponent(targetLang)}&select=*&limit=1`,
  }) as JobRow[] | null;
  const existing = existingRows?.[0];
  if (existing && !force && (existing.status === "queued" || existing.status === "running" || existing.status === "done")) {
    return jsonResponse({ success: true, job: existing, reused: true });
  }

  const jobRows = await pg("translation_jobs", {
    method: "POST",
    query: "on_conflict=chapter_id,target_lang",
    body: { chapter_id: chapterId, source_lang: sourceLang, target_lang: targetLang, status: "queued", progress: 0, error: null, updated_at: new Date().toISOString() },
    prefer: "resolution=merge-duplicates,return=representation",
  }) as JobRow[] | null;
  const job = jobRows?.[0];
  if (!job) return jsonResponse({ success: false, reason: "job_create_failed" }, 500);

  // Reset per-page rows for a clean run (matters on `force` re-queue).
  await pg(`translation_job_pages?job_id=eq.${job.id}`, { method: "DELETE" }).catch(() => {});
  await pg("translation_job_pages", {
    method: "POST",
    body: pages.map((p) => ({ job_id: job.id, page_number: p.page_number, source_url: p.image_url, status: "queued" })),
    prefer: "return=minimal",
  }).catch(() => {});

  // Fire-and-forget to the shared worker — never await the actual
  // translation, only the enqueue. Worker reports back via /callback.
  const callbackUrl = `${SUPABASE_URL}/functions/v1/manga-sanctuary-manga-translate-chapter/callback`;
  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-mtl-worker-secret": WORKER_SECRET },
      body: JSON.stringify({
        job_id: job.id,
        pages: pages.map((p) => ({ page_number: p.page_number, url: p.image_url })),
        source_lang: sourceLang,
        target_lang: targetLang,
        callback_url: callbackUrl,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`worker returned ${res.status}`);
    await pg(`translation_jobs?id=eq.${job.id}`, { method: "PATCH", body: { status: "running", updated_at: new Date().toISOString() } });
    job.status = "running";
  } catch (err) {
    await pg(`translation_jobs?id=eq.${job.id}`, {
      method: "PATCH",
      body: { status: "failed", error: `Could not reach MTL worker: ${err instanceof Error ? err.message : String(err)}`, updated_at: new Date().toISOString() },
    }).catch(() => {});
    job.status = "failed";
  }

  return jsonResponse({ success: true, job, reused: false });
}

// ---------------------------------------------------------------------------
// POST /callback — worker reports progress/completion. Gated by a shared
// secret, NOT end-user auth (the worker has no Supabase session).
// ---------------------------------------------------------------------------

async function fetchAndRehostTranslatedPage(chapterId: string, pageNumber: number, translatedUrl: string): Promise<string | null> {
  try {
    const res = await fetch(translatedUrl, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/webp";
    if (!contentType.startsWith("image/")) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 10 * 1024 * 1024) return null;
    // Content-addressed under an app+chapter-scoped prefix — matches the
    // spec's `manga/tl/en/{chapter_id}/...` convention (page-number-named
    // files aren't needed for correctness since translation_job_pages
    // already tracks the page_number -> translated_url mapping explicitly).
    return await uploadBytesToStorage(bytes, contentType, `manga/tl/${chapterId}`);
  } catch {
    return null;
  }
}

async function handleCallback(req: Request): Promise<Response> {
  if (!WORKER_SECRET || req.headers.get("x-mtl-worker-secret") !== WORKER_SECRET) {
    return jsonResponse({ error: "Invalid or missing worker secret" }, 401);
  }
  const body = await req.json().catch(() => ({}));
  const jobId = typeof body.job_id === "string" ? body.job_id : "";
  if (!jobId) return jsonResponse({ error: "job_id is required" }, 400);

  const jobRows = await pg("translation_jobs", { query: `id=eq.${encodeURIComponent(jobId)}&select=*&limit=1` }) as JobRow[] | null;
  const job = jobRows?.[0];
  if (!job) return jsonResponse({ error: "Unknown job_id" }, 404);

  const incomingPages = Array.isArray(body.pages) ? body.pages as { page_number: number; translated_url?: string; status?: string; error?: string }[] : [];
  for (const p of incomingPages) {
    if (typeof p.page_number !== "number") continue;
    let translatedUrl: string | null = null;
    let status = p.status === "failed" ? "failed" : "done";
    if (p.translated_url) {
      translatedUrl = await fetchAndRehostTranslatedPage(job.chapter_id, p.page_number, p.translated_url);
      if (!translatedUrl) status = "failed";
    } else if (status === "done") {
      status = "failed"; // reported done with no image — treat as failed, never silently mark a page complete with nothing to show
    }
    await pg(`translation_job_pages?job_id=eq.${jobId}&page_number=eq.${p.page_number}`, {
      method: "PATCH",
      body: { translated_url: translatedUrl, status, error: p.error ?? null },
    }).catch(() => {});
  }

  const allPages = await pg("translation_job_pages", { query: `job_id=eq.${encodeURIComponent(jobId)}&select=status` }) as { status: string }[] | null;
  const total = allPages?.length ?? 0;
  const done = (allPages ?? []).filter((p) => p.status === "done").length;
  const failed = (allPages ?? []).filter((p) => p.status === "failed").length;
  const progress = total > 0 ? done / total : 0;

  let status = typeof body.status === "string" ? body.status : job.status;
  if (total > 0 && done + failed === total) {
    status = done > 0 ? "done" : "failed";
  }

  await pg(`translation_jobs?id=eq.${jobId}`, {
    method: "PATCH",
    body: { status, progress, error: typeof body.error === "string" ? body.error : (status === "failed" ? job.error : null), updated_at: new Date().toISOString() },
  });

  return jsonResponse({ ok: true, status, progress });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const fnIdx = segments.findIndex((s) => s === "manga-translate-chapter" || s.endsWith("-manga-translate-chapter"));
  const route = fnIdx >= 0 ? segments.slice(fnIdx + 1) : segments;

  try {
    if (route.length === 1 && route[0] === "callback") return await handleCallback(req);
    if (route.length === 0) return await queueTranslation(req);
    return jsonResponse({ error: "Not found" }, 404);
  } catch (err) {
    if (err instanceof ApiError) return jsonResponse({ error: err.message }, err.status);
    console.error("manga-translate-chapter error:", err);
    return jsonResponse({ error: "Internal error", detail: err instanceof Error ? err.message : String(err) }, 500);
  }
});
