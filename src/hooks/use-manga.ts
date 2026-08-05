import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
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
