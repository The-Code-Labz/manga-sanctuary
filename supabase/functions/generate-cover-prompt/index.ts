import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsResponse, jsonResponse, langfuseTrace } from "../_shared/utils.ts";

// Builds the 11-section structured prompt that novel-cover-generate's
// "custom prompt" path consumes. Accepts an optional `style` (the same
// STYLES ids used by AiCoverGenerateButton — anime/manga/digital-art/
// artistic/realistic) so the LLM's own [Style] section is written to AGREE
// with the user's style-picker choice instead of freelancing one from
// genre/tone alone. Previously this function never received `style` at
// all, so its example output ("NOT anime, NOT cartoon") could directly
// contradict a user who then picked "Anime" in the UI — novel-cover-generate
// only patched this downstream by appending its own descriptor at the end,
// which softened but didn't remove the contradiction. Fixed at the source.

const STYLE_GUIDANCE: Record<string, string> = {
  "anime": "Japanese anime key visual art style — vibrant cel-shaded colors, clean linework, expressive anime facial proportions. The [Style] section MUST call for anime/manga-key-visual style and must NOT include phrases like \"NOT anime\" or \"NOT cartoon\".",
  "manga": "black and white manga illustration style — screentone shading, dynamic ink linework, manga panel energy. The [Style] section MUST call for manga illustration style.",
  "digital-art": "polished digital painting — painterly brushwork, rich color grading, semi-stylized (not photorealistic, not anime).",
  "artistic": "expressive fine-art illustration — painterly and evocative, gallery-quality composition.",
  "realistic": "photorealistic cinematic rendering — natural lighting, lifelike detail, film-poster realism. The [Style] section MUST call for photorealism and must NOT include anime/cartoon keywords.",
};

// NOTE: void/gemini-3.1-flash-lite-preview is registered on LiteLLM's
// /v1/models but its backend deployment 404s on actual chat completions
// ("Model does not exist") — confirmed live 2026-07-27, pre-existing bug,
// unrelated to this file's other changes. Swapped to a live-verified model.
const LLM_MODEL = Deno.env.get("COVER_PROMPT_MODEL") ?? "void/gemini-3.5-flash";
const REQUEST_TIMEOUT_MS = 25_000;
const BACKOFF_MS = [1000, 3000];

function isTransientError(status: number | undefined, detail: string): boolean {
  if (status === 429 || (typeof status === "number" && status >= 500)) return true;
  return /temporary error|please try again|try again later|overloaded|over capacity|rate limit|too many requests|service unavailable|econnreset|socket hang ?up|request timeout|timed? ?out/i
    .test(detail);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  const apiKey = Deno.env.get("NOVEL_SANCTUARY_LITELLM_API_KEY");
  if (!apiKey) return jsonResponse({ error: "LITELLM_API_KEY secret not set" }, 500);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { title, description, style } = body ?? {};
  if (!title?.trim()) return jsonResponse({ error: "Missing title" }, 400);

  const selectedStyle = (typeof style === "string" && STYLE_GUIDANCE[style]) ? style : undefined;
  const styleGuidance = selectedStyle
    ? STYLE_GUIDANCE[selectedStyle]
    : "Choose a style direction that fits the novel's genre and tone (e.g. painterly, cinematic, anime key visual).";

  const systemPrompt = `You are a professional AI image prompt engineer specializing in light novel and web novel cover art. Your job is to generate detailed, structured image prompts for novel covers that will be sent to an image generation model.

OUTPUT FORMAT — always use this exact structure with each section on its own line. Be highly detailed and descriptive in every section. Here is an example of the quality and detail level expected:

[Meta] ultra detailed, cinematic, 8k, professional book cover illustration, soft film grain, sharp focus, shallow depth of field, dramatic composition, award-winning novel cover style, moody color grading, high dynamic range, 2:3 aspect ratio

[Subject] A teenage boy (Ryota Ken) standing alone in the rain at night, symbolizing grief and loss. He wears a simple hoodie, slightly soaked, head lowered but eyes looking forward with quiet resilience.

[Face] youthful face with soft features, pale skin, subtle tear streaks blending with rain, tired eyes with deep emotional weight, expression: quiet sorrow mixed with faint determination

[Body] slim build, slightly hunched posture showing emotional burden, hands loosely clenched at his sides

[Lighting] soft streetlight glow from above casting warm light on his face, contrasted by cool blue tones of the rainy night, subtle rim lighting outlining his silhouette, cinematic contrast between warmth (hope) and cold (grief)

[Scene] empty city street at night, rain falling steadily, puddles reflecting light. In the blurred background: a faint, ghostlike silhouette of a woman (his mother) glowing softly, not fully visible, symbolic and ethereal—not horror

[Atmosphere] melancholic, reflective, emotional depth, sense of loneliness but underlying hope, subtle fog and rain particles adding depth

[Composition] subject centered or slightly off-center, rule of thirds, space at top for title text, cinematic framing

[Color Palette] cool blues, desaturated tones, with soft warm highlights (yellow/orange) to represent fading hope returning

[Style] realistic with slight painterly touch, similar to high-end drama film posters, NOT anime, NOT cartoon

[Negative Prompt] low quality, blurry, distorted anatomy, extra limbs, horror, gore, overly bright colors, cartoon, anime, exaggerated expressions

---

Now generate a prompt following this EXACT format for the novel provided. Each section must be:
- [Meta] — technical quality tags, resolution, aspect ratio, rendering style keywords
- [Subject] — who is in the scene, what they are doing, what they represent symbolically, what they are wearing
- [Face] — face shape, skin tone, eye details, expression with emotional nuance
- [Body] — build, height, posture, what the body language conveys
- [Lighting] — light sources, color temperature contrasts, rim lighting, how light creates mood
- [Scene] — environment, weather, background elements (can include symbolic/ethereal elements)
- [Atmosphere] — emotional tone, mood keywords, sensory details like fog, particles, etc.
- [Composition] — framing, rule of thirds, where the subject is placed, space for title text
- [Color Palette] — dominant colors, accent colors, what the colors symbolize
- [Style] — REQUIRED STYLE DIRECTION FOR THIS REQUEST: ${styleGuidance} This section must be consistent with that direction — do not contradict it.
- [Negative Prompt] — things to avoid in generation (must not contradict the required style direction above — e.g. do not write "no anime" if anime style was required)

Be creative, emotionally resonant, and highly specific. Tailor every detail to the novel's genre, tone, and themes, while strictly honoring the required [Style] direction above. You MUST complete ALL 11 sections fully before stopping. Do not truncate or cut off any section. Return ONLY the prompt text — no explanation, no preamble, no markdown formatting.`;

  const userMessage = `Generate a professional novel cover art prompt for:

Title: "${title}"
${description?.trim() ? `Description: ${description.trim()}` : ""}
${selectedStyle ? `Required art style: ${selectedStyle}` : ""}

Create a compelling, visually striking cover art prompt following the required format. Base the visual style, character design, atmosphere, color palette, and composition on the novel's genre and tone, while strictly honoring the required [Style] direction. Be as detailed and evocative as the example shown. Complete ALL sections fully.`;

  const startedAt = Date.now();
  let rawText = "";
  let lastStatus: number | undefined;

  for (let attempt = 0; ; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
    let detail = "";
    try {
      const response = await fetch("https://litellm.neurolearninglabs.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          max_tokens: 8192,
          temperature: 0.75,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        }),
        signal: ac.signal,
      });
      clearTimeout(timer);
      rawText = await response.text();
      lastStatus = response.status;
      if (response.ok) break;
      try {
        const errData = JSON.parse(rawText);
        detail = errData.error?.message || errData.message || `LiteLLM error (${response.status})`;
      } catch {
        detail = rawText || `LiteLLM error (${response.status})`;
      }
    } catch (err) {
      clearTimeout(timer);
      detail = ac.signal.aborted ? `request timeout after ${REQUEST_TIMEOUT_MS}ms` : ((err as Error).message ?? String(err));
    }

    const backoff = BACKOFF_MS[attempt];
    if (isTransientError(lastStatus, detail) && backoff !== undefined) {
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    if (lastStatus === 429) return jsonResponse({ error: "Rate limited — please try again shortly." }, 429);
    return jsonResponse({ error: detail.slice(0, 300) }, 502);
  }

  // deno-lint-ignore no-explicit-any
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    return jsonResponse({ error: "Invalid JSON from LiteLLM" }, 502);
  }

  const prompt = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!prompt) return jsonResponse({ error: "No prompt generated" }, 502);

  langfuseTrace({
    name: "generate-cover-prompt",
    input: { title, style: selectedStyle ?? null, hasDescription: !!description?.trim() },
    output: { promptLength: prompt.length },
    model: LLM_MODEL,
    metadata: { durationMs: Date.now() - startedAt },
  });

  return jsonResponse({ prompt });
});
