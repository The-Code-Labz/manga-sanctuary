<div align="center">

# 🗯️ Manga Sanctuary

**A modern catalog and reader for Manga, Manhwa, Manhua, and Webtoons**

*Discover, track, and read Japanese manga, Korean manhwa, Chinese manhua, and English webtoons.*

[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06b6d4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20+%20Auth-3ecf8e?logo=supabase&logoColor=white)](https://supabase.com/)

</div>

---

## Overview

Manga Sanctuary is a full-featured SPA for tracking manga, manhwa, manhua, and webtoons. Users can browse a curated catalog, track their reading progress, manage personal lists, rate and review titles, and submit new manga for approval.

Admins get a moderation dashboard with AI-assisted metadata enrichment, cover generation, and chapter/page management.

This repo is a **manga-focused fork** of [Novel Sanctuary](https://github.com/The-Code-Labz/novel-sanctuary), adapted for image-based reading.

---

## Features

### Reader Features
- 🏠 **Home feed** — Trending, recently updated, and highest-rated manga
- 🔍 **Search & filter** — Filter by language (JP / KR / CN / EN), type (Manga / Manhwa / Manhua / Webtoon), genre, tag, and status
- 📖 **Manga detail pages** — Full description, author/artist, genre/tag cloud, chapter list grouped by volume
- 🖼️ **In-app image reader** — Read chapters page-by-page with fit-to-width / fit-to-height / original size modes, keyboard navigation (←/→), prev/next chapter
- 📚 **Personal library** — Reading lists (Reading, Completed, Plan to Read, Dropped, Favorites)
- ⭐ **Ratings & reviews** — Community-driven rating system
- 👤 **User profiles** — Auth via Supabase (email/password + OAuth), password reset flow

### Admin Features
- 🛡️ **Role-gated admin panel**
- ✅ **Manga approval workflow**
- 🤖 **AI metadata generation** (same engine as Novel Sanctuary)
- 🎨 **AI cover generation**
- 🖼️ **Cover search picker**
- 📋 **Chapter & page management** — manual entry, bulk link patterns, AI-assisted discovery
- 🏷️ **Genre & tag managers**
- 👥 **User role management**

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | React 18 + TypeScript |
| **Build tool** | Vite 5 (SWC plugin) |
| **Styling** | Tailwind CSS 3 |
| **UI components** | shadcn/ui (Radix UI primitives) |
| **Routing** | React Router v6 |
| **Server state** | TanStack React Query v5 |
| **Animations** | Framer Motion |
| **Backend** | Supabase (Postgres + Row Level Security + Auth) |
| **Edge Functions** | Supabase Edge Functions |

---

## Project Structure

```
manga-sanctuary/
├── public/                 # Static assets
├── src/
│   ├── App.tsx            # Root component + routes
│   ├── main.tsx           # Entry point
│   ├── index.css          # Design tokens
│   ├── components/
│   │   ├── admin/         # Admin dashboard
│   │   ├── layout/        # Header, NavLink, LogoIcon
│   │   ├── library/       # BrowseLibrary
│   │   ├── manga/         # MangaCard, MangaSection, ChapterList, MangaTypeBadge
│   │   └── ui/            # shadcn/ui primitives
│   ├── contexts/          # AuthContext
│   ├── hooks/             # Data hooks (use-manga, use-admin-manga, etc.)
│   ├── integrations/
│   │   └── supabase/      # Supabase client + types
│   ├── lib/               # Utilities + mock-data.ts
│   └── pages/             # Route pages
├── supabase/              # Edge functions + migrations
└── README.md
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- A Supabase project (optional — mock data works without it)

### Local development

```bash
git clone https://github.com/The-Code-Labz/manga-sanctuary.git
cd manga-sanctuary
cp .env.example .env.local
# Add your Supabase URL + anon key, or leave blank to use demo data
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Production build

```bash
npm run build
npm run preview
```

---

## Environment Variables

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

If these are not set, the app falls back to mock manga/chapter/page data so the UI is still explorable.

---

## Database Schema Notes

Manga Sanctuary uses a dedicated `manga_sanctuary` Supabase schema that is completely separate from `novel_sanctuary`.

### Apply migrations

Run the SQL file in `supabase/migrations/` against your Supabase SQL Editor (or `supabase db push`):

- `20260730000000_manga_sanctuary_schema.sql` — full standalone schema:
  - `profiles`, `authors`, `artists`
  - `manga` table with `manga_type` enum (`Manga`, `Manhwa`, `Manhua`, `Webtoon`) and `artist_id`
  - `genres`, `tags`, `manga_genres`, `manga_tags`
  - `chapters` with `pages` JSONB cache
  - `chapter_pages` normalized table
  - `reading_progress` with `last_page_read`
  - `lists`, `list_items`, `reviews`, `ratings`, `user_roles`
  - RLS policies + indexes

After applying, regenerate TypeScript types:

```bash
supabase gen types typescript --project-id your-project-ref --schema manga_sanctuary > src/integrations/supabase/types.ts
```

### Page storage

The chapter table includes a `pages` JSONB column with the shape:

```json
[
  { "page_number": 1, "image_url": "https://.../page1.png" },
  { "page_number": 2, "image_url": "https://.../page2.png" }
]
```

A normalized `chapter_pages` table is also provided for relational queries. Use whichever fits your access pattern; images are never stored in Postgres — only URLs/object keys. Use Supabase Storage, MinIO, S3, R2, or any external CDN.

---

## License

MIT
