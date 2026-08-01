import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsResponse, jsonResponse, getSearxConfig, searchSearxImages } from "../_shared/manga-sanctuary/utils.ts";

// Cover-art image search, proxied through our own self-hosted SearXNG
// instance (same one manga-metadata-v2/novel-chapter-search use for
// discovery). Ported verbatim from novel-sanctuary — no schema-specific
// logic here at all, this is a pure SearXNG image-search proxy.

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
