import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ChapterInput {
  chapter_number: number;
  chapter_title: string | null;
  external_url: string | null;
  // Optional — the DB column defaults to now() at insert time; omit on
  // updates so bulk-saving edits to an existing chapter doesn't reset it.
  release_date?: string | null;
  volume_number?: number | null;
  volume_title?: string | null;
}

export function useAddChapter(mangaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (chapter: ChapterInput) => {
      const { error } = await supabase.from("chapters").insert({
        manga_id: mangaId,
        ...chapter,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chapters", mangaId] });
      qc.invalidateQueries({ queryKey: ["admin-manga"] });
      qc.invalidateQueries({ queryKey: ["manga"] });
    },
  });
}

export function useAddChaptersBulk(mangaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (chapters: ChapterInput[]) => {
      const rows = chapters.map((ch) => ({
        manga_id: mangaId,
        chapter_number: ch.chapter_number,
        chapter_title: ch.chapter_title,
        external_url: ch.external_url,
        release_date: ch.release_date,
        volume_number: ch.volume_number ?? null,
        volume_title: ch.volume_title ?? null,
      }));
      const { error } = await supabase.from("chapters").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chapters", mangaId] });
      qc.invalidateQueries({ queryKey: ["admin-manga"] });
      qc.invalidateQueries({ queryKey: ["manga"] });
    },
  });
}

// Saves a mixed batch in one go: rows with no `id` are inserted, rows with an
// `id` are upserted (updates the existing row). Introduced because the bulk
// link-pattern editor only touched local component state — chapters that
// were already saved (id present, not staged as "new") never got persisted
// unless AI-search or manual-add happened to mark them dirty too. See
// AdminChapterManager's handleSaveAll for the caller-side dirty tracking.
export function useSaveChaptersBulk(mangaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (chapters: (ChapterInput & { id?: string })[]) => {
      const toInsert = chapters.filter((c) => !c.id);
      const toUpdate = chapters.filter((c) => c.id);

      if (toInsert.length > 0) {
        const rows = toInsert.map(({ id, ...ch }) => ({ manga_id: mangaId, ...ch }));
        const { error } = await supabase.from("chapters").insert(rows);
        if (error) throw error;
      }
      if (toUpdate.length > 0) {
        const rows = toUpdate.map((ch) => ({ manga_id: mangaId, ...ch }));
        const { error } = await supabase.from("chapters").upsert(rows, { onConflict: "id" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chapters", mangaId] });
      qc.invalidateQueries({ queryKey: ["admin-manga"] });
      qc.invalidateQueries({ queryKey: ["manga"] });
    },
  });
}

// Scrapes chapter page images from its external_url via the
// manga-chapter-content edge function and writes them onto the chapter row
// so it can be read in-app. Note: unlike novel-sanctuary (chapters ARE
// prose, stored in a `content` text column), manga chapters have no such
// column — `chapters.pages` is a JSONB array of { page_number, image_url }
// (see PageRow in use-manga.ts), so the edge function's ordered page-URL
// array is mapped into that shape before writing.
export function useFetchChapterContent(mangaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, url }: { id: string; url: string }) => {
      const { data, error } = await supabase.functions.invoke("manga-sanctuary-novel-chapter-content", {
        body: { url },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.reason || "Could not extract chapter pages");

      const pages = (data.pages as string[]).map((image_url, i) => ({ page_number: i + 1, image_url }));

      const { error: updateError } = await supabase.from("chapters").update({ pages }).eq("id", id);
      if (updateError) throw updateError;

      return { page_count: data.page_count as number, source: data.source as string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chapters", mangaId] });
    },
  });
}

export function useUpdateChapter(mangaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ChapterInput>) => {
      const { error } = await supabase.from("chapters").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chapters", mangaId] });
    },
  });
}

export function useDeleteChapter(mangaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (chapterId: string) => {
      const { error } = await supabase.from("chapters").delete().eq("id", chapterId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chapters", mangaId] });
      qc.invalidateQueries({ queryKey: ["admin-manga"] });
      qc.invalidateQueries({ queryKey: ["manga"] });
    },
  });
}

export function useDeleteAllChapters(mangaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("chapters").delete().eq("manga_id", mangaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chapters", mangaId] });
      qc.invalidateQueries({ queryKey: ["admin-manga"] });
      qc.invalidateQueries({ queryKey: ["manga"] });
    },
  });
}