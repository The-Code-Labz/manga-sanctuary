import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsResponse, jsonResponse, langfuseTrace } from "../_shared/manga-sanctuary/utils.ts";

// Manga cover art generation — ported from novel-sanctuary's
// novel-cover-generate, fal.ai, model hardcoded to OpenAI's
// GPT-Image-2 (per explicit instruction: use gpt-image-2 regardless of
// which provider is up). VoidAI's own /images/generations (gpt-image) is
// currently down, and KIE's unified media API does NOT carry gpt-image
// models at all — fal.ai is the only remaining provider that serves
// gpt-image-2 directly (`openai/gpt-image-2` on fal's async queue).
// Abacus (nano_banana2) was a prior stopgap; replaced now that we're
// pinning to gpt-image-2 specifically.
//
// fal's queue API (queue.fal.run) — 3-step submit/poll/result, auth header
// is `Authorization: Key <FAL_API_KEY>` (not Bearer):
//   SUBMIT: POST /openai/gpt-image-2          <input>      → { request_id, status_url, response_url }
//   POLL:   GET  {status_url}                              → { status: IN_QUEUE|IN_PROGRESS|COMPLETED, error?, error_type?, queue_position? }
//   RESULT: GET  {response_url}  (only once COMPLETED)     → { images: [{ url, width, height, content_type }] }
//
// gpt-image-2 has no native "style" param, so the selected art style is
// folded into the prompt text (same approach as prior VoidAI/Abacus
// revisions) — avoids the old bug where an auto-generated prompt (which
// writes its own [Style] section) could contradict the style button.

const FAL_BASE = "https://queue.fal.run";
const MODEL = "openai/gpt-image-2"; // pinned — do not swap models here.

const SUBMIT_TIMEOUT_MS = 20_000;
const POLL_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 2_500;
// IMPORTANT: this must stay comfortably UNDER the platform's hard ceilings —
// self-hosted Supabase's edge-runtime worker is hard-killed at 180s
// (nexus-1 main/index.ts workerTimeoutMs) and Kong's functions-v1 route has
// its own read_timeout (currently 200s). 240s here was silently dead code:
// gpt-image-2 "high" quality live-measured at ~127-150s inference alone, so
// on slower runs the isolate/gateway killed the request with an opaque
// 502/504 before this deadline was ever reached, and this function never
// got the chance to return its own clean error. 165s leaves real margin
// under both the 180s worker kill and the 200s Kong timeout.
const TOTAL_DEADLINE_MS = 165_000;
const SUBMIT_BACKOFF_MS = [1500, 4000, 8000];

// Default quality — live-measured against fal.ai directly (not guessed):
// "high" took 126.7s inference on one run and, including queue+network
// overhead, exceeded even the 165s deadline above on another — i.e. it's
// not just slow, it's unreliable inside any synchronous request budget.
// "medium" measured 44.6s inference on the same prompt — ~3x faster, real
// margin under every ceiling in this stack (Kong 200s, worker 180s, our
// own 165s). Defaulting to medium for reliability; callers can still opt
// into "high" (slower, marginally more detail) via body.quality.
const DEFAULT_QUALITY = "medium";
const ALLOWED_QUALITIES = new Set(["low", "medium", "high"]);

const STYLE_DESCRIPTORS: Record<string, string> = {
  "anime": "Japanese anime key visual art style, vibrant cel-shaded colors, clean linework",
  "manga": "black and white manga illustration style, screentone shading, dynamic ink linework",
  "digital-art": "polished digital painting, painterly brushwork, rich color grading",
  "artistic": "expressive fine-art illustration, painterly and evocative",
  "realistic": "photorealistic cinematic rendering, natural lighting, lifelike detail",
};

function isSafetyRejection(msg: string): boolean {
  return /sensitive content|not allowed by (?:our |the )?safety|safety system|content that is not allowed|content policy|content[_ ]policy[_ ]violation|moderation|different prompt/i
    .test(msg);
}

function isTransientError(status: number | undefined, detail: string): boolean {
  if (isSafetyRejection(detail)) return false;
  if (status === 429 || (typeof status === "number" && status >= 500)) return true;
  return /temporary error|please try again|try again later|overloaded|over capacity|rate limit|too many requests|service unavailable|econnreset|socket hang ?up|request timeout|timed? ?out/i
    .test(detail);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  const apiKey = Deno.env.get("MANGA_SANCTUARY_FAL_API_KEY");
  if (!apiKey) return jsonResponse({ error: "FAL_API_KEY secret not set" }, 500);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return jsonResponse({ error: "Missing title" }, 400);

  const selectedStyle = (typeof body?.style === "string" && body.style.trim()) || "anime";
  const styleDescriptor = STYLE_DESCRIPTORS[selectedStyle] ?? STYLE_DESCRIPTORS["anime"];
  const customPrompt = typeof body?.customPrompt === "string" ? body.customPrompt.trim() : "";
  const quality = (typeof body?.quality === "string" && ALLOWED_QUALITIES.has(body.quality))
    ? body.quality
    : DEFAULT_QUALITY;

  let prompt: string;
  if (customPrompt) {
    // User-supplied prompt — append the style pick so the button and the
    // prompt text never disagree (old bug: auto-prompt could write its own
    // contradictory [Style] section).
    prompt = `${customPrompt}\n\nArt style: ${styleDescriptor}.`;
    console.log("[cover-gen] using CUSTOM prompt, length:", prompt.length);
  } else {
    // Auto-generate a safe prompt from title only — never include description
    // because descriptions often contain mature/sexual content that gets rejected.
    prompt =
      `Professional manga volume cover art illustration for a manga titled "${title}". ` +
      `${styleDescriptor}. Dramatic, eye-catching cover with a main character in an iconic pose, ` +
      `dynamic composition, cinematic lighting, detailed background. Portrait orientation, ` +
      `high-quality published manga / manhwa volume cover.`;
    console.log("[cover-gen] using AUTO prompt (title only, no description)");
  }
  const MAX_PROMPT_CHARS = 4000;
  if (prompt.length > MAX_PROMPT_CHARS) prompt = prompt.slice(0, MAX_PROMPT_CHARS);

  console.log("[cover-gen] title:", title, "style:", selectedStyle, "model:", MODEL, "quality:", quality, "prompt length:", prompt.length);

  // Explicit portrait size (2:3) rather than a preset — gpt-image-2's
  // image_size presets (landscape_4_3/portrait_4_3/etc.) don't include a 2:3
  // option; an explicit {width,height} does. Constraints (verified against
  // fal's schema): both dims multiples of 16, max edge 3840px, aspect ratio
  // <= 3:1, total pixels within [655360, 8294400] — 1024x1536 clears all of
  // these (1,572,864 px, ratio 1.5).
  const input = {
    prompt,
    image_size: { width: 1024, height: 1536 },
    quality,
    num_images: 1,
    output_format: "png",
  };

  const authHeader = `Key ${apiKey}`;
  const startedAt = Date.now();

  // ── Submit (with retry on transient failures) ─────────────────────────
  let submitPayload: { request_id?: string; status_url?: string; response_url?: string } | undefined;
  for (let attempt = 0; ; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), SUBMIT_TIMEOUT_MS);
    let status: number | undefined;
    let detail = "";
    try {
      const res = await fetch(`${FAL_BASE}/${MODEL}`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: ac.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        submitPayload = await res.json();
        break;
      }
      status = res.status;
      detail = await res.text().catch(() => res.statusText);
    } catch (err) {
      clearTimeout(timer);
      detail = ac.signal.aborted
        ? `submit timeout after ${SUBMIT_TIMEOUT_MS}ms`
        : ((err as Error).message ?? String(err));
    }

    const backoff = SUBMIT_BACKOFF_MS[attempt];
    const elapsed = Date.now() - startedAt;
    if (isTransientError(status, detail) && backoff !== undefined && elapsed + backoff < TOTAL_DEADLINE_MS) {
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    if (isSafetyRejection(detail)) {
      return jsonResponse({
        error: "gpt-image-2 declined this prompt — its safety filter flagged the content. Try rephrasing.",
      }, 422);
    }
    if (status === 429) return jsonResponse({ error: "Rate limited by fal.ai — please try again shortly." }, 429);
    console.log("[cover-gen] submit failed:", status ?? "network/timeout", detail.slice(0, 300));
    return jsonResponse({ error: `Cover generation submit failed (${status ?? "network error"}): ${detail.slice(0, 300)}` }, 502);
  }

  const statusUrl = submitPayload?.status_url;
  const responseUrl = submitPayload?.response_url;
  if (!statusUrl || !responseUrl) {
    return jsonResponse({ error: "fal.ai submit response missing status_url/response_url." }, 502);
  }

  // ── Poll until COMPLETED (or error/deadline) ───────────────────────────
  // deno-lint-ignore no-explicit-any
  let statusPayload: any;
  for (;;) {
    if (Date.now() - startedAt > TOTAL_DEADLINE_MS) {
      return jsonResponse({
        error: `Cover generation is taking longer than usual (gpt-image-2 '${quality}' quality can be slow). Please try again — fal.ai's queue may be busy.`,
      }, 504);
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), POLL_TIMEOUT_MS);
    try {
      const res = await fetch(statusUrl, { headers: { Authorization: authHeader }, signal: ac.signal });
      clearTimeout(timer);
      if (res.ok) {
        statusPayload = await res.json();
      } else {
        const detail = await res.text().catch(() => res.statusText);
        if (!isTransientError(res.status, detail)) {
          console.log("[cover-gen] poll failed:", res.status, detail.slice(0, 300));
          return jsonResponse({ error: `Cover generation poll failed (${res.status}): ${detail.slice(0, 300)}` }, 502);
        }
        statusPayload = undefined;
      }
    } catch {
      clearTimeout(timer);
      statusPayload = undefined; // transient — retry on next loop
    }

    const errMsg = statusPayload?.error || statusPayload?.error_type;
    if (errMsg) {
      const msg = String(errMsg);
      if (isSafetyRejection(msg)) {
        return jsonResponse({
          error: "gpt-image-2 declined this prompt — its safety filter flagged the content. Try rephrasing.",
        }, 422);
      }
      console.log("[cover-gen] job failed:", msg.slice(0, 300));
      return jsonResponse({ error: `Cover generation failed: ${msg.slice(0, 300)}` }, 502);
    }

    const state = String(statusPayload?.status ?? "").toUpperCase();
    if (state === "COMPLETED") break;

    const queuePos = typeof statusPayload?.queue_position === "number" ? statusPayload.queue_position : undefined;
    const wait = queuePos !== undefined ? Math.min(POLL_INTERVAL_MS + queuePos * 500, 10_000) : POLL_INTERVAL_MS;
    await new Promise((r) => setTimeout(r, wait));
  }

  // ── Fetch result ────────────────────────────────────────────────────────
  // deno-lint-ignore no-explicit-any
  let resultPayload: any;
  try {
    const res = await fetch(responseUrl, { headers: { Authorization: authHeader } });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      return jsonResponse({ error: `Cover generation result fetch failed (${res.status}): ${detail.slice(0, 300)}` }, 502);
    }
    resultPayload = await res.json();
  } catch (err) {
    return jsonResponse({ error: `Cover generation result fetch failed: ${(err as Error).message}` }, 502);
  }

  const images = Array.isArray(resultPayload?.images) ? resultPayload.images : [];
  // deno-lint-ignore no-explicit-any
  const rawUrl: string | undefined = images[0]?.url;

  if (!rawUrl) {
    console.log("[cover-gen] no images in result, keys:", Object.keys(resultPayload ?? {}));
    return jsonResponse({ error: `fal.ai (${MODEL}) returned no image.` }, 502);
  }

  console.log("[cover-gen] success, model:", MODEL);

  langfuseTrace({
    name: "manga-cover-generate",
    input: { title, style: selectedStyle, model: MODEL, quality, promptLength: prompt.length },
    output: { hasCover: true },
    model: MODEL,
  });

  return jsonResponse({ cover_url: rawUrl, style: selectedStyle, quality });
});
