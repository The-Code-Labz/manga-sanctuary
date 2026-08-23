import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsResponse, jsonResponse, needsCoverRehost, rehostCoverImage } from "../_shared/manga-sanctuary/utils.ts";

// Thin gateway: given a cover_url, if it's from a host known to break for
// readers when hotlinked directly (MangaDex's uploads CDN — see
// COVER_REHOST_HOSTS/needsCoverRehost in _shared), pull it server-side and
// re-host into our own Storage bucket. Called from AdminMangaForm right
// before it writes cover_url via the supabase-js client (which — unlike
// manga-api's create/update — has no server-side hook of its own to do this
// automatically), and from the admin bulk-backfill route for existing rows.
//
// Always returns 200 with { url, rehosted } — a cover that doesn't need
// rehosting, or that fails to rehost, still returns the original url
// unchanged so callers never have to special-case failure.

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url) return jsonResponse({ error: "url is required" }, 400);

    if (!needsCoverRehost(url)) {
      return jsonResponse({ url, rehosted: false });
    }

    const hosted = await rehostCoverImage(url);
    if (!hosted) return jsonResponse({ url, rehosted: false });
    return jsonResponse({ url: hosted, rehosted: true });
  } catch (err) {
    console.error("manga-rehost-cover error:", err);
    return jsonResponse({ error: "Cover rehost failed" }, 500);
  }
});
