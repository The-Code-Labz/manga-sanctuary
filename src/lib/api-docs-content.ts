// Source of truth for the API Docs page AND its "Copy as Markdown" button —
// both render this exact string, so it can never drift out of sync with
// itself. Keep endpoint descriptions here in lockstep with
// supabase/functions/manga-api/index.ts whenever a route changes.

export function buildApiDocsMarkdown(baseUrl: string): string {
  return `# Manga Sanctuary — Public API

A real, path-routed REST API (not the single-endpoint POST-body pattern the
rest of this app's internal edge functions use) for reading and writing
manga/chapters programmatically — search manga, pull a chapter's full
ordered page-image array, create manga, attach/upsert chapters in bulk
(page URLs, not prose), edit an existing chapter's pages, delete chapters,
and fetch a raw page's readable text/HTML for a URL so you can do your own
page-image scraping when a reader site's layout doesn't fit our automatic
sources.

**Base URL:** \`${baseUrl}\`

---

## Authentication

Every route below (except \`GET /health\`) requires an API key, either as:

\`\`\`
Authorization: Bearer <your-key>
\`\`\`

or:

\`\`\`
x-api-key: <your-key>
\`\`\`

Keys are managed from **Admin → API Keys** in this app and carry one of
three scopes, each satisfying anything at or below it:

| Scope | Can do |
|---|---|
| \`read\` | GET routes only |
| \`write\` | \`read\` + create/update manga, upsert/edit/delete chapters |
| \`admin\` | \`write\` + delete whole manga entries |

A revoked or unknown key returns \`401\`. A key with insufficient scope
returns \`403\`.

---

## Manga

### \`GET /manga\`
List/search manga.

**Query params:** \`q\` (search title/description) · \`status\` · \`language\` ·
\`manga_type\` (\`Manga\` \\| \`Manhwa\` \\| \`Manhua\` \\| \`Webtoon\`) · \`is_approved\` ·
\`sort\` (\`recent\` or default title A-Z) · \`limit\` (default 20, max 100) ·
\`offset\`

\`\`\`bash
curl "${baseUrl}/manga?q=solo&manga_type=Manhwa&limit=5" \\
  -H "Authorization: Bearer <key>"
\`\`\`

### \`GET /manga/:id\`
Full manga record: metadata, author, artist, genres, tags, chapter_count.

### \`POST /manga\` — *write*
Create a manga entry.

\`\`\`bash
curl -X POST "${baseUrl}/manga" \\
  -H "Authorization: Bearer <key>" -H "Content-Type: application/json" \\
  -d '{"title":"My Manga","author":"Some Author","artist":"Some Artist","manga_type":"Manhwa","status":"ongoing","description":"..."}'
\`\`\`

Writable fields: \`title\` (required), \`author\` (name — resolved/created
automatically), \`artist\` (name — resolved/created automatically,
separate from \`author\`), \`alt_titles\`, \`description\`, \`language\`,
\`status\`, \`manga_type\` (defaults to \`"Manga"\`), \`cover_url\`,
\`is_approved\` (defaults to \`true\`), \`genres\` (array of names —
resolved/created automatically, same as \`author\`/\`artist\`), \`tags\`
(array of names, same behavior).

\`\`\`bash
curl -X POST "${baseUrl}/manga" \\
  -H "Authorization: Bearer <key>" -H "Content-Type: application/json" \\
  -d '{"title":"My Manga","genres":["Action","Fantasy"],"tags":["Reincarnation","Overpowered MC"]}'
\`\`\`

A create call with a title matching an existing row returns the existing
row instead (\`duplicate: true\`) rather than creating a near-duplicate —
disambiguated by \`manga_type\` when two editions (e.g. a Manga and its
Manhwa adaptation) share a title. Pass \`force_create:true\` to bypass.

### \`PATCH /manga/:id\` — *write*
Update any subset of the same writable fields, including \`genres\`/\`tags\`.
Sending either **replaces that manga's full genre or tag list** with the
names you send (each name resolved/created automatically) — it's not an
additive merge. Omit the field entirely to leave the existing genres/tags
untouched; send \`[]\` to clear them.

### \`DELETE /manga/:id\` — *admin*
Deletes the manga and its chapters (cascade).

---

## Chapters

### \`GET /manga/:id/chapters\`
List a manga's chapters, ordered by chapter number.

**Query params:** \`limit\` (default 100, max 500) · \`offset\` · \`from\` /
\`to\` (chapter-number range) · \`include_pages=true\` (adds the full ordered
\`pages\` array — omitted by default to keep listing responses light)

### \`GET /chapters/:id\`
One chapter, full record including \`pages\`, \`strip_url\`, \`stitch_status\`.

### \`POST /manga/:id/chapters\` — *write*
**Bulk upsert** by \`(manga_id, chapter_number)\` — up to 2000 per call. Any
field you omit on a chapter that already exists is preserved, not nulled
out, so you can bulk-attach chapter metadata first and fill in pages later.

\`\`\`bash
curl -X POST "${baseUrl}/manga/<manga_id>/chapters" \\
  -H "Authorization: Bearer <key>" -H "Content-Type: application/json" \\
  -d '{"chapters":[
    {"chapter_number":1,"chapter_title":"Chapter 1","external_url":"https://example.com/c1","pages":["https://cdn.example.com/c1/p1.jpg","https://cdn.example.com/c1/p2.jpg"]},
    {"chapter_number":2,"chapter_title":"Chapter 2","pages":[{"page_number":1,"image_url":"https://cdn.example.com/c2/p1.jpg"}]}
  ]}'
\`\`\`

Chapter fields: \`chapter_number\` (required), \`chapter_title\`,
\`external_url\`, \`volume_number\`, \`volume_title\`, \`release_date\`,
\`pages\` (array — either plain URL strings in reading order, or
\`{page_number, image_url}\` objects; max 300 pages/chapter). Sending
\`pages\` on a chapter that already had a stitched long-strip clears
\`strip_url\`/resets \`stitch_status\` to \`"none"\`, since the old strip no
longer matches the new pages — the reader falls back to the paged view
until it's re-stitched.

### \`PATCH /chapters/:id\` — *write*
Edit a single chapter — **this is the route to use to correct a chapter's
page list**, fix a mis-parsed title, or attach a proper reading link after
the fact. Only the fields you send are changed.

\`\`\`bash
curl -X PATCH "${baseUrl}/chapters/<chapter_id>" \\
  -H "Authorization: Bearer <key>" -H "Content-Type: application/json" \\
  -d '{"pages":["https://cdn.example.com/c1/p1-fixed.jpg","https://cdn.example.com/c1/p2-fixed.jpg"]}'
\`\`\`

### \`DELETE /chapters/:id\` — *write*
Delete a single chapter.

### \`DELETE /manga/:id/chapters?from=N&to=M\` — *write*
Delete every chapter in a chapter-number range in one call — e.g. to wipe
out a bad AI-search result that pulled the wrong manga's chapters.

---

## Extract — read any page yourself

### \`POST /extract\`
Fetch a URL and return its readable text and/or raw HTML, bypassing
Cloudflare where needed (Byparr fallback). Use this when a reader site's
layout doesn't fit our automatic sources — pull the raw HTML here, parse
out the page-image URLs yourself, then push the result back with
\`PATCH /chapters/:id\` or \`POST /manga/:id/chapters\`.

\`\`\`bash
curl -X POST "${baseUrl}/extract" \\
  -H "Authorization: Bearer <key>" -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/some-chapter-page","mode":"html"}'
\`\`\`

\`mode\`: \`"text"\` (default, readable text only — mostly useful for a
chapter's title/metadata page), \`"html"\` (raw HTML, capped at 300KB — what
you want for finding \`<img>\` page URLs), or \`"both"\`. Readable text is
capped at 60,000 characters (\`readable_text_truncated: true\` if cut off).

---

## Taxonomy

### \`GET /genres\` · \`GET /tags\`
List genres/tags (optionally filtered with \`?q=\`), for tagging a manga
correctly instead of inventing free-text values.

### \`POST /genres\` · \`POST /tags\` — *write*
Create a standalone term, e.g. to seed the taxonomy ahead of tagging manga.
Idempotent by name — \`{"name": "Isekai"}\` against an existing term returns
it (\`duplicate: true\`, \`200\`) instead of erroring. You don't need this
route to tag a manga — \`POST /manga\`/\`PATCH /manga/:id\`'s \`genres\`/\`tags\`
fields already resolve-or-create by name on their own.

\`\`\`bash
curl -X POST "${baseUrl}/genres" \\
  -H "Authorization: Bearer <key>" -H "Content-Type: application/json" \\
  -d '{"name":"Isekai"}'
\`\`\`

---

## Health

### \`GET /health\`
No auth required. \`{"ok": true, "time": "..."}\`.

---

## Notes

- All responses are JSON. Errors are \`{"error": "message"}\` with an
  appropriate HTTP status code.
- This API is independent of Supabase Row-Level Security — auth is
  enforced entirely by the API key layer described above.
- Every call (aside from the admin dashboard's own requests) is logged and
  visible in **Admin → API Dashboard**.
`;
}
