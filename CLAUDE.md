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

**MyNovelHub** is a React 18 + TypeScript SPA (Vite) backed by Supabase (Postgres + Auth + Edge Functions). It's a catalog and tracking app for light novels and web novels (Japanese, Korean, Chinese, English).

### Data flow

All server state goes through TanStack React Query. Custom hooks in `src/hooks/` wrap Supabase queries — never use `useEffect + fetch` for data loading. Auth state lives in `src/contexts/AuthContext.tsx` and is accessed via `useAuth()`. Admin-only access is gated by `useIsAdmin()`.

```
Page component → hook (src/hooks/) → TanStack Query → Supabase client
                                                     → Edge Function (AI features)
```

### Key entry points

- `src/App.tsx` — all routes defined here (never scatter routes)
- `src/hooks/use-novels.ts` — core data queries (novels, chapters, reviews, genres, tags)
- `src/integrations/supabase/client.ts` — Supabase client
- `src/integrations/supabase/types.ts` — auto-generated DB types (do not edit manually)
- `src/index.css` — design tokens (HSL CSS custom properties)

### Edge Functions (`supabase/functions/`, Deno runtime)

| Function | Purpose |
|---|---|
| `novel-metadata-v2` | AI metadata extractor — AniList/Royal Road/NovelUpdates/WebNovel structured sourcing (SearXNG + Byparr discovery), merged via Void AI |
| `novel-cover-generate` | AI cover images via fal.ai (OpenAI's gpt-image-2, pinned) |
| `novel-chapter-search` | Discovers chapter lists from external sources — Royal Road structured scrape primary (single call), LiteRouter AI-search last-resort fallback batched in 60-chapter slices via `range_start`/`structure` cursor (large CN/KR web novels routinely exceed one completion's output) |
| `novel-cover-search` | Manual cover-art image search, proxied through self-hosted SearXNG (no dedicated key — reuses SEARX_PROXY_URL/KEY) |
| `novel-chapter-content` | Scrapes chapter text for in-app reading — Royal Road plain fetch (`.chapter-inner`), else Byparr + generic container heuristic with boilerplate/error-page rejection (no dedicated key — reuses BYPARR_URL) |
| `generate-cover-prompt` | Structured image prompt generation via LiteLLM |

Edge Functions are invoked from the frontend via `supabase.functions.invoke()`. Secrets are Infisical-managed
under the `NOVEL_SANCTUARY_` prefix (see `.kestra.yml`) and deployed automatically via the shared Kestra flow
on push to `main` — `NOVEL_SANCTUARY_VOID_AI_API_KEY` (metadata merge, plain non-search model),
`NOVEL_SANCTUARY_LITEROUTER_API_KEY` (chapter-search AI fallback, `gpt-4o-mini-search-preview` — VoidAI's
`sonar-pro` was persistently 500ing account-wide as of 2026-07-27), `NOVEL_SANCTUARY_FAL_API_KEY` (cover
generation, fal.ai `openai/gpt-image-2` — VoidAI's own gpt-image is down, KIE doesn't carry gpt-image),
`NOVEL_SANCTUARY_LITELLM_API_KEY`, `NOVEL_SANCTUARY_SEARX_PROXY_*`, and `NOVEL_SANCTUARY_LANGFUSE_*`.

### Admin features

`src/pages/AdminPage.tsx` and `src/components/admin/` contain the full moderation UI — novel approval, metadata/cover generation triggers, chapter management, genre/tag management, and user role assignment. All guarded by `useIsAdmin()`.

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
