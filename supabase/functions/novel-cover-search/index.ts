import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsResponse, jsonResponse, getSearxConfig, searchSearxImages } from "../_shared/utils.ts";

// Cover-art image search, proxied through our own self-hosted SearXNG
// instance (same one novel-metadata-v2/novel-chapter-search use for
// discovery). Replaces the old CoverSearchPicker.tsx implementation, which
// called a hardcoded, long-dead Supabase project
// (gpugbzwexfkrmmbmvofs.supabase.co/functions/v1/searx-proxy — DNS no
// longer resolves) with a hardcoded anon key baked into frontend source.
// This function keeps the SearXNG proxy URL/key server-side, matching the
// rest of this app's edge functions.

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const body = await req.json().catch(() => ({}));
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) return jsonResponse({ error: "query is required" }, 400);

    const searxConfig = getSearxConfig();
    if (!searxConfig) return jsonResponse({ error: "Image search is not configured" }, 503);

    const results = await searchSearxImages(query, searxConfig, 30);
    return jsonResponse({ results });
  } catch (err) {
    console.error("novel-cover-search error:", err);
    return jsonResponse({ error: "Image search failed" }, 500);
  }
});
