# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server on http://localhost:8080
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Run tests once
npm run test:watch   # Watch mode

# Run a single test file
npm run test -- src/path/to/file.test.ts
```

## Architecture

**Manga Sanctuary** is a React 18 + TypeScript SPA (Vite) backed by Supabase (Postgres + Auth + Edge Functions). It's a catalog and tracking app for manga, manhwa, and manhua (Japanese, Korean, Chinese). Forked from `novel-sanctuary` (a light-novel/web-novel version of this same app) — schema lives in its own `manga_sanctuary` Postgres schema, not shared with novel-sanctuary's `novel_sanctuary` schema.

### Data flow

All server state goes through TanStack React Query. Custom hooks in `src/hooks/` wrap Supabase queries — never use `useEffect + fetch` for data loading. Auth state lives in `src/contexts/AuthContext.tsx` and is accessed via `useAuth()`. Admin-only access is gated by `useIsAdmin()`.

```
Page component → hook (src/hooks/) → TanStack Query → Supabase client
                                                     → Edge Function (AI features)
```

### Key entry points

- `src/App.tsx` — all routes defined here (never scatter routes)
- `src/hooks/use-manga.ts` — core data queries (manga, chapters, reviews, genres, tags)
- `src/integrations/supabase/client.ts` — Supabase client
- `src/integrations/supabase/types.ts` — auto-generated DB types (do not edit manually)
- `src/index.css` — design tokens (HSL CSS custom properties)

### Edge Functions (`supabase/functions/`, Deno runtime)

Function folder names are kept identical to novel-sanctuary's (`novel-metadata-v2`, `novel-chapter-search`,
etc.) even though this is the manga app — the deployed function name is `${app_slug}-${folder_name}`
(`.kestra.yml` sets `app_slug: manga-sanctuary`), so the frontend already calls e.g.
`manga-sanctuary-novel-chapter-search`. Do not rename the folders, it would break the frontend's invoke calls.

| Function | Purpose |
|---|---|
| `novel-metadata-v2` | AI metadata extractor — AniList/MangaDex/MangaUpdates structured sourcing (all official JSON APIs, no scraping), SearXNG snippet fallback only when all three miss, merged via LiteRouter/OpenAI |
| `novel-cover-generate` | AI cover images via fal.ai (OpenAI's gpt-image-2, pinned) |
| `novel-chapter-search` | Discovers chapter lists — MangaDex feed API primary (paginated internally, one call, real chapter/volume numbers), LiteRouter AI-search last-resort fallback batched in 40-chapter slices via `range_start`/`structure` cursor (for series not indexed on MangaDex at all) |
| `novel-cover-search` | Manual cover-art image search, proxied through self-hosted SearXNG (no dedicated key — reuses SEARX_PROXY_URL/KEY) |
| `novel-chapter-content` | Fetches chapter PAGE IMAGES (not text) for in-app reading — MangaDex `/at-home/server` API primary (real page image URLs, re-hosted to our own Storage), else a generic `<img>`-gallery scraper (Byparr for Cloudflare-gated aggregators) with min-page-count gating to reject false positives |
| `generate-cover-prompt` | Structured image prompt generation via LiteRouter |

Edge Functions are invoked from the frontend via `supabase.functions.invoke()`. Secrets are Infisical-managed
under the `MANGA_SANCTUARY_` prefix (see `.kestra.yml`) and deployed automatically via the shared Kestra flow
on push to `main` — `MANGA_SANCTUARY_LITEROUTER_API_KEY` / `MANGA_SANCTUARY_OPENAI_API_KEY` (metadata merge +
chapter-search AI fallback + cover-prompt synthesis), `MANGA_SANCTUARY_FAL_API_KEY` (cover generation, fal.ai
`openai/gpt-image-2`), `MANGA_SANCTUARY_SEARX_PROXY_*`, `MANGA_SANCTUARY_BYPARR_URL` (generic chapter-content
fallback only), `MANGA_SANCTUARY_SUPABASE_PUBLIC_URL` (page-image re-hosting), and `MANGA_SANCTUARY_LANGFUSE_*`.
See `supabase/functions/.env.example` for the full per-function breakdown. NOT yet live-verified as of this
port — confirm these secrets are actually provisioned in Infisical before relying on any of these functions.

### Admin features

`src/pages/AdminPage.tsx` and `src/components/admin/` contain the full moderation UI — manga approval, metadata/cover generation triggers, chapter management, genre/tag management, and user role assignment. All guarded by `useIsAdmin()`.

## Rules from AI_RULES.md

### Library constraints

| Concern | Use | Avoid |
|---|---|---|
| Styling | Tailwind CSS classes | Inline `style`, CSS modules, styled-components |
| UI primitives | shadcn/ui from `@/components/ui/*` | MUI, Ant Design, Chakra UI |
| Icons | `lucide-react` | Any other icon library |
| Routing | `react-router-dom` v6 | `window.location` for navigation |
| Data fetching | `@tanstack/react-query` | `useEffect + fetch`, SWR |
| Auth/DB | Supabase JS client | Direct `fetch` to Supabase REST endpoints |
| Toasts | `sonner` — `import { toast } from "sonner"` | react-hot-toast, window.alert |
| Animations | `framer-motion` | CSS `@keyframes` for complex animations |
| Forms | `react-hook-form` + `zod` | Formik |
| Dates | `date-fns` | Moment.js, Day.js |

### Coding rules

- **Do not edit `src/components/ui/*`** — shadcn/ui generated files. Create wrappers if customization is needed.
- **One component per file**, keep under ~100 lines.
- **Use existing design tokens** (`text-golden`, `bg-surface`, `lang-badge-jp`, etc.) — do not add new CSS custom properties without good reason.
- **No `try/catch`** unless explicitly required — let errors surface in development.
- **Env vars** must be prefixed `VITE_` and accessed via `import.meta.env`.
- **Mobile-first** responsive design using Tailwind breakpoints (`sm:`, `md:`, `lg:`, `xl:`).

### Adding new database columns

Supabase types in `src/integrations/supabase/types.ts` are auto-generated — after writing a migration in `supabase/migrations/`, regenerate types rather than editing the file manually.
