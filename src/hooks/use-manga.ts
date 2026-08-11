import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { mockManga, chaptersByManga, mockReviews, type Manga as MockManga, type Chapter as MockChapter } from "@/lib/mock-data";

const hasSupabase = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

export type MangaType = "Manga" | "Webtoon" | "Manhwa" | "Manhua";

export interface MangaWithDetails {
  id: string;
  title: string;
  alt_titles: string[];
  description: string | null;
  author_id: string | null;
  author_name: string;
  artist_name: string | null;
  language: string;
  status: string;
  manga_type: MangaType | null;
  cover_url: string | null;
  genres: string[];
  tags: string[];
  rating: number;
  rating_count: number;
  reader_count: number;
  chapter_count: number;
  created_at: string;
}

function adaptMockManga(m: MockManga): MangaWithDetails {
  return {
    id: m.id,
    title: m.title,
    alt_titles: m.alt_titles,
    description: m.description,
    author_id: null,
    author_name: m.author_name,
    artist_name: m.artist_name,
    language: m.language,
    status: m.status,
    manga_type: m.manga_type,
    cover_url: m.cover_url,
    genres: m.genres,
    tags: m.tags,
    rating: m.rating,
    rating_count: m.rating_count,
    reader_count: m.reader_count,
    chapter_count: m.chapter_count,
    created_at: (m as any).created_at ?? new Date().toISOString(),
  };
}

async function fetchManga(): Promise<MangaWithDetails[]> {
  if (!hasSupabase) return mockManga.map(adaptMockManga);

  const { data: manga, error } = await supabase
    .from("manga")
    .select(`
      *,
      authors ( name ),
      manga_genres ( genres ( name ) ),
      manga_tags ( tags ( name ) ),
      chapters ( id ),
      ratings ( rating ),
      reading_progress ( id )
    `)
    .eq("is_approved", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Supabase fetchManga failed, falling back to mock data:", error.message);
    return mockManga.map(adaptMockManga);
  }

  return (manga ?? []).map((n: any) => ({
    id: n.id,
    title: n.title,
    alt_titles: n.alt_titles ?? [],
    description: n.description,
    author_id: n.author_id,
    author_name: n.authors?.name ?? "Unknown",
    artist_name: n.artist_name ?? null,
    language: n.language,
    status: n.status,
    manga_type: n.manga_type ?? null,
    cover_url: n.cover_url,
    genres: (n.manga_genres ?? []).map((ng: any) => ng.genres?.name).filter(Boolean),
    tags: (n.manga_tags ?? []).map((nt: any) => nt.tags?.name).filter(Boolean),
    rating: n.ratings?.length
      ? +(n.ratings.reduce((sum: number, r: any) => sum + r.rating, 0) / n.ratings.length).toFixed(1)
      : 0,
    rating_count: n.ratings?.length ?? 0,
    reader_count: n.reading_progress?.length ?? 0,
    chapter_count: n.chapters?.length ?? 0,
    created_at: n.created_at,
  }));
}

export function useMangaList() {
  return useQuery({
    queryKey: ["manga"],
    queryFn: fetchManga,
  });
}

async function fetchMangaById(id: string): Promise<MangaWithDetails | null> {
  const mock = mockManga.find((m) => m.id === id);
  if (!hasSupabase) return mock ? adaptMockManga(mock) : null;

  const { data: n, error } = await supabase
    .from("manga")
    .select(`
      *,
      authors ( name ),
      manga_genres ( genres ( name ) ),
      manga_tags ( tags ( name ) ),
      chapters ( id ),
      ratings ( rating ),
      reading_progress ( id )
    `)
    .eq("id", id)
    .single();

  if (error) {
    console.warn("Supabase fetchMangaById failed, falling back to mock data:", error.message);
    return mock ? adaptMockManga(mock) : null;
  }

  return {
    id: n.id,
    title: n.title,
    alt_titles: n.alt_titles ?? [],
    description: n.description,
    author_id: n.author_id,
    author_name: (n as any).authors?.name ?? "Unknown",
    artist_name: n.artist_name ?? null,
    language: n.language,
    status: n.status,
    manga_type: (n as any).manga_type ?? null,
    cover_url: n.cover_url,
    genres: ((n as any).manga_genres ?? []).map((ng: any) => ng.genres?.name).filter(Boolean),
    tags: ((n as any).manga_tags ?? []).map((nt: any) => nt.tags?.name).filter(Boolean),
    rating: (n as any).ratings?.length
      ? +((n as any).ratings.reduce((sum: number, r: any) => sum + r.rating, 0) / (n as any).ratings.length).toFixed(1)
      : 0,
    rating_count: (n as any).ratings?.length ?? 0,
    reader_count: (n as any).reading_progress?.length ?? 0,
    chapter_count: (n as any).chapters?.length ?? 0,
  };
}

export function useManga(id: string) {
  return useQuery({
    queryKey: ["manga", id],
    queryFn: () => fetchMangaById(id),
    enabled: !!id,
  });
}

export interface PageRow {
  page_number: number;
  image_url: string;
}

export interface ChapterRow {
  id: string;
  manga_id: string;
  chapter_number: number;
  chapter_title: string | null;
  external_url: string | null;
  release_date: string | null;
  volume_number: number | null;
  volume_title: string | null;
  pages: PageRow[];
  strip_url: string | null;
  stitch_status: "none" | "processing" | "ready" | "failed";
}

function adaptMockChapter(ch: MockChapter): ChapterRow {
  return {
    id: ch.id,
    manga_id: ch.manga_id,
    chapter_number: ch.chapter_number,
    chapter_title: ch.chapter_title,
    external_url: ch.external_url,
    release_date: ch.release_date,
    volume_number: ch.volume_number ?? null,
    volume_title: ch.volume_title ?? null,
    pages: ch.pages,
    strip_url: null,
    stitch_status: "none",
  };
}

export function useChapters(mangaId: string) {
  return useQuery({
    queryKey: ["chapters", mangaId],
    queryFn: async () => {
      const mock = chaptersByManga[mangaId];
      if (!hasSupabase) return mock?.map(adaptMockChapter) ?? [];

      const { data, error } = await supabase
        .from("chapters")
        .select("*")
        .eq("manga_id", mangaId)
        .order("volume_number", { ascending: true, nullsFirst: true })
        .order("chapter_number", { ascending: true });
      if (error) {
        console.warn("Supabase useChapters failed, falling back to mock data:", error.message);
        return mock?.map(adaptMockChapter) ?? [];
      }
      return (data as ChapterRow[]).map((row) => ({
        ...row,
        pages: Array.isArray(row.pages) ? row.pages : [],
      }));
    },
    enabled: !!mangaId,
  });
}

export type ChapterNavRow = Pick<ChapterRow, "id" | "chapter_number" | "chapter_title" | "volume_number" | "volume_title">;

export function useChapterNavList(mangaId: string) {
  return useQuery({
    queryKey: ["chapters-nav", mangaId],
    queryFn: async () => {
      const mock = chaptersByManga[mangaId];
      if (!hasSupabase) return mock?.map((ch) => ({
        id: ch.id,
        chapter_number: ch.chapter_number,
        chapter_title: ch.chapter_title,
        volume_number: ch.volume_number ?? null,
        volume_title: ch.volume_title ?? null,
      })) ?? [];

      const { data, error } = await supabase
        .from("chapters")
        .select("id, chapter_number, chapter_title, volume_number, volume_title")
        .eq("manga_id", mangaId)
        .order("volume_number", { ascending: true, nullsFirst: true })
        .order("chapter_number", { ascending: true });
      if (error) {
        console.warn("Supabase useChapterNavList failed, falling back to mock data:", error.message);
        return mock?.map((ch) => ({
          id: ch.id,
          chapter_number: ch.chapter_number,
          chapter_title: ch.chapter_title,
          volume_number: ch.volume_number ?? null,
          volume_title: ch.volume_title ?? null,
        })) ?? [];
      }
      return data as ChapterNavRow[];
    },
    enabled: !!mangaId,
  });
}

export function useChapter(chapterId: string) {
  return useQuery({
    queryKey: ["chapter", chapterId],
    queryFn: async () => {
      const mock = Object.values(chaptersByManga).flat().find((ch) => ch.id === chapterId);
      if (!hasSupabase) return mock ? adaptMockChapter(mock) : null;

      const { data, error } = await supabase
        .from("chapters")
        .select("*")
        .eq("id", chapterId)
        .single();
      if (error) {
        console.warn("Supabase useChapter failed, falling back to mock data:", error.message);
        return mock ? adaptMockChapter(mock) : null;
      }
      return {
        ...(data as ChapterRow),
        pages: Array.isArray((data as any).pages) ? (data as any).pages : [],
      };
    },
    enabled: !!chapterId,
  });
}

export function useReviews(mangaId: string) {
  return useQuery({
    queryKey: ["reviews", mangaId],
    queryFn: async () => {
      if (!hasSupabase) return mockReviews.filter((r) => r.manga_id === mangaId);

      const { data, error } = await supabase
        .from("reviews")
        .select("*, profiles ( username, avatar_url )")
        .eq("manga_id", mangaId)
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("Supabase useReviews failed, falling back to mock data:", error.message);
        return mockReviews.filter((r) => r.manga_id === mangaId);
      }
      return data as any[];
    },
    enabled: !!mangaId,
  });
}

export function useGenres() {
  return useQuery({
    queryKey: ["genres"],
    queryFn: async () => {
      if (!hasSupabase) return [];
      const { data } = await supabase.from("genres").select("*").order("name");
      return data ?? [];
    },
  });
}

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      if (!hasSupabase) return [];
      const { data } = await supabase.from("tags").select("*").order("name");
      return data ?? [];
    },
  });
}

// ── Reading progress ("Continue Reading") + personal library lists ─────────
// Ported from novel-sanctuary's use-novels.ts, renamed novel→manga. These
// features need a real signed-in user + Supabase (no mock-data fallback,
// matching novel's own pattern — there's nothing meaningful to mock here).

export interface ReadingProgressRow {
  id: string;
  manga_id: string;
  last_chapter_id: string | null;
  last_chapter_read: number;
  last_page_read: number | null;
  updated_at: string;
}

// "Continue Reading" — the signed-in user's saved place in this manga, if any.
export function useReadingProgress(mangaId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["reading-progress", mangaId, user?.id],
    queryFn: async (): Promise<ReadingProgressRow | null> => {
      const { data, error } = await supabase
        .from("reading_progress")
        .select("id, manga_id, last_chapter_id, last_chapter_read, last_page_read, updated_at")
        .eq("manga_id", mangaId)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as ReadingProgressRow | null;
    },
    enabled: !!mangaId && !!user,
  });
}

// Records the chapter a signed-in user last opened for a manga — called from
// the reader on load. Silently no-ops for signed-out users (nothing to save
// to). Upserts on (user_id, manga_id) since a reader only has one "last read"
// spot per manga at a time.
export function useSaveReadingProgress() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      mangaId,
      chapterId,
      chapterNumber,
    }: {
      mangaId: string;
      chapterId: string;
      chapterNumber: number;
    }) => {
      if (!user) return;
      const { error } = await supabase.from("reading_progress").upsert(
        {
          user_id: user.id,
          manga_id: mangaId,
          last_chapter_id: chapterId,
          last_chapter_read: chapterNumber,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,manga_id" }
      );
      if (error) throw error;
    },
    onSuccess: (_data, { mangaId }) => {
      queryClient.invalidateQueries({ queryKey: ["reading-progress", mangaId, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["manga"] });
    },
  });
}

// "Continue Reading" — every manga the signed-in user has a saved place in,
// across the whole catalog, newest progress first. Powers the homepage
// carousel. `manga` is null if the title was deleted since; filtered out.
export interface ContinueReadingItem {
  mangaId: string;
  chapterId: string | null;
  chapterNumber: number;
  updatedAt: string;
  manga: {
    id: string;
    title: string;
    cover_url: string | null;
    manga_type: MangaType | null;
    language: string;
  };
}

export function useContinueReading(limit = 12) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["continue-reading", user?.id],
    queryFn: async (): Promise<ContinueReadingItem[]> => {
      const { data, error } = await supabase
        .from("reading_progress")
        .select("manga_id, last_chapter_id, last_chapter_read, updated_at, manga ( id, title, cover_url, manga_type, language )")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? [])
        .filter((row: any) => row.manga)
        .map((row: any) => ({
          mangaId: row.manga_id,
          chapterId: row.last_chapter_id,
          chapterNumber: row.last_chapter_read,
          updatedAt: row.updated_at,
          manga: row.manga,
        }));
    },
    enabled: !!user,
  });
}

// Every user gets these 5 lists auto-created on signup (see
// handle_new_user_lists trigger) — "Add to Library" toggles membership in
// one of them rather than inventing a separate concept.
export const LIST_NAMES = ["Reading", "Completed", "Plan to Read", "Dropped", "Favorites"] as const;
export type ListName = (typeof LIST_NAMES)[number];

// Which of the current user's lists this manga is already in — drives the
// checkmarks/"In Library" state on the Add to Library dropdown.
export function useMangaListMembership(mangaId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["manga-list-membership", mangaId, user?.id],
    queryFn: async (): Promise<ListName[]> => {
      const { data, error } = await supabase
        .from("list_items")
        .select("lists!inner ( name )")
        .eq("manga_id", mangaId)
        .eq("lists.user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((row: any) => row.lists?.name).filter(Boolean);
    },
    enabled: !!mangaId && !!user,
  });
}

// Adds/removes a manga from one of the user's named lists. Looks the list up
// (falling back to creating it) rather than assuming the signup trigger's
// default 5 always exist, since a user could in theory have deleted one.
export function useToggleListMembership(mangaId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listName, add }: { listName: ListName; add: boolean }) => {
      if (!user) throw new Error("Sign in to add manga to your library");

      let listId: string;
      const { data: existingList, error: findErr } = await supabase
        .from("lists")
        .select("id")
        .eq("user_id", user.id)
        .eq("name", listName)
        .maybeSingle();
      if (findErr) throw findErr;

      if (existingList) {
        listId = existingList.id;
      } else {
        const { data: created, error: createErr } = await supabase
          .from("lists")
          .insert({ user_id: user.id, name: listName })
          .select("id")
          .single();
        if (createErr) throw createErr;
        listId = created.id;
      }

      if (add) {
        const { error } = await supabase.from("list_items").insert({ list_id: listId, manga_id: mangaId });
        // 23505 = unique_violation — already in this list, treat as success
        if (error && (error as any).code !== "23505") throw error;
      } else {
        const { error } = await supabase.from("list_items").delete().eq("list_id", listId).eq("manga_id", mangaId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manga-list-membership", mangaId] });
      queryClient.invalidateQueries({ queryKey: ["library-list"] });
    },
  });
}

const LIBRARY_LIST_SELECT = `
  *,
  authors ( name ),
  manga_genres ( genres ( name ) ),
  manga_tags ( tags ( name ) ),
  chapters ( id ),
  ratings ( rating ),
  reading_progress ( id )
`;

function mapLibraryMangaRow(n: any): MangaWithDetails {
  return {
    id: n.id,
    title: n.title,
    alt_titles: n.alt_titles ?? [],
    description: n.description,
    author_id: n.author_id,
    author_name: n.authors?.name ?? "Unknown",
    artist_name: n.artist_name ?? null,
    language: n.language,
    status: n.status,
    manga_type: n.manga_type ?? null,
    cover_url: n.cover_url,
    genres: (n.manga_genres ?? []).map((ng: any) => ng.genres?.name).filter(Boolean),
    tags: (n.manga_tags ?? []).map((nt: any) => nt.tags?.name).filter(Boolean),
    rating: n.ratings?.length
      ? +(n.ratings.reduce((sum: number, r: any) => sum + r.rating, 0) / n.ratings.length).toFixed(1)
      : 0,
    rating_count: n.ratings?.length ?? 0,
    reader_count: n.reading_progress?.length ?? 0,
    chapter_count: n.chapters?.length ?? 0,
    created_at: n.created_at,
  };
}

// Manga in one of the current user's named lists, for the "My Lists" tabs
// on the Library/Profile pages.
export function useLibraryList(listName: ListName) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["library-list", listName, user?.id],
    queryFn: async (): Promise<MangaWithDetails[]> => {
      const { data: list, error: listErr } = await supabase
        .from("lists")
        .select("id")
        .eq("user_id", user!.id)
        .eq("name", listName)
        .maybeSingle();
      if (listErr) throw listErr;
      if (!list) return [];

      const { data, error } = await supabase
        .from("list_items")
        .select(`manga_id, added_at, manga ( ${LIBRARY_LIST_SELECT} )`)
        .eq("list_id", list.id)
        .order("added_at", { ascending: false });
      if (error) throw error;

      return (data ?? [])
        .map((row: any) => (row.manga ? mapLibraryMangaRow(row.manga) : null))
        .filter((m: MangaWithDetails | null): m is MangaWithDetails => m !== null);
    },
    enabled: !!user,
  });
}

// ---------------------------------------------------------------------------
// Machine translation (MTL) — JP/CN/KR raw chapters. RLS grants anon+authed
// SELECT on both translation tables (see 20260809020000 migration), so the
// reader polls these directly instead of round-tripping through an edge
// function just to read status. Writes go through manga-translate-chapter.
// ---------------------------------------------------------------------------

export interface TranslationJob {
  id: string;
  chapter_id: string;
  source_lang: string;
  target_lang: string;
  status: "queued" | "running" | "done" | "failed";
  progress: number;
  error: string | null;
}

export interface TranslationPage {
  page_number: number;
  translated_url: string | null;
  status: "queued" | "running" | "done" | "failed";
}

// Polls while a job is in flight so the reader's progress UI advances on
// its own; stops polling once the job lands in a terminal state.
export function useTranslationJob(chapterId: string, targetLang = "en") {
  return useQuery({
    queryKey: ["translation-job", chapterId, targetLang],
    queryFn: async (): Promise<TranslationJob | null> => {
      const { data, error } = await supabase
        .from("translation_jobs")
        .select("id, chapter_id, source_lang, target_lang, status, progress, error")
        .eq("chapter_id", chapterId)
        .eq("target_lang", targetLang)
        .maybeSingle();
      if (error) throw error;
      return (data as TranslationJob | null) ?? null;
    },
    enabled: hasSupabase && !!chapterId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "running" ? 3000 : false;
    },
  });
}

export function useTranslationPages(jobId: string | undefined) {
  return useQuery({
    queryKey: ["translation-pages", jobId],
    queryFn: async (): Promise<TranslationPage[]> => {
      const { data, error } = await supabase
        .from("translation_job_pages")
        .select("page_number, translated_url, status")
        .eq("job_id", jobId!)
        .order("page_number", { ascending: true });
      if (error) throw error;
      return (data as TranslationPage[] | null) ?? [];
    },
    enabled: hasSupabase && !!jobId,
  });
}

export function useQueueTranslation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ chapterId, targetLang = "en", force = false }: { chapterId: string; targetLang?: string; force?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("manga-sanctuary-manga-translate-chapter", {
        body: { chapter_id: chapterId, target_lang: targetLang, force },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.message || data?.reason || "Could not queue translation");
      return data as { job: TranslationJob };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["translation-job", vars.chapterId, vars.targetLang ?? "en"] });
    },
  });
}
