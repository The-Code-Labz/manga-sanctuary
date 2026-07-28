import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MangaType } from "@/hooks/use-manga";

export interface AdminManga {
  id: string;
  title: string;
  description: string | null;
  author_id: string | null;
  author_name: string;
  language: string;
  status: string;
  novel_type: MangaType | null;
  cover_url: string | null;
  is_approved: boolean;
  created_at: string;
  genres: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  chapter_count: number;
  rating_count: number;
}

export function useAdminManga() {
  return useQuery({
    queryKey: ["admin-manga"],
    queryFn: async () => {
      const { data: manga, error } = await supabase
        .from("manga")
        .select(`
          *,
          authors ( name ),
          novel_genres ( genres ( id, name ) ),
          novel_tags ( tags ( id, name ) ),
          chapters ( id ),
          ratings ( id )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (manga ?? []).map((n: any) => ({
        id: n.id,
        title: n.title,
        description: n.description,
        author_id: n.author_id,
        author_name: n.authors?.name ?? "Unknown",
        language: n.language,
        status: n.status,
        novel_type: n.novel_type ?? null,
        cover_url: n.cover_url,
        is_approved: n.is_approved,
        created_at: n.created_at,
        genres: (n.novel_genres ?? []).map((ng: any) => ng.genres).filter(Boolean),
        tags: (n.novel_tags ?? []).map((nt: any) => nt.tags).filter(Boolean),
        chapter_count: n.chapters?.length ?? 0,
        rating_count: n.ratings?.length ?? 0,
      })) as AdminManga[];
    },
  });
}