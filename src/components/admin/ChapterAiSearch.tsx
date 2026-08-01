import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AiChapter {
  number: number;
  title: string;
  url: string;
  volume_number?: number | null;
  volume_title?: string | null;
}

interface ChapterAiSearchProps {
  novelTitle: string;
  onChaptersFound: (chapters: AiChapter[], source: string, hasVolumes?: boolean) => void;
}

// Safety net against a runaway loop if the backend ever returns a bad cursor.
// 40 batches * 60/batch = up to 2400 chapters auto-fetched, comfortably above
// MAX_CHAPTERS (3000 cap server-side) covers real-world CN webtoon sizes.
const MAX_BATCHES = 40;

function toAiChapters(raw: any[]): AiChapter[] {
  return raw.map((ch: any) => ({
    number: ch.chapter_number,
    title: ch.chapter_title || `Chapter ${ch.chapter_number}`,
    url: ch.external_url || "#",
    volume_number: ch.volume_number ?? null,
    volume_title: ch.volume_title ?? null,
  }));
}

export default function ChapterAiSearch({ novelTitle, onChaptersFound }: ChapterAiSearchProps) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const handleSearch = async () => {
    if (!novelTitle.trim()) {
      toast.error("Manga title is required");
      return;
    }
    setLoading(true);
    setProgress(null);

    // First request: no cursor. Royal Road returns everything `done:true` in
    // one shot; the AI fallback returns just the first batch plus a cursor
    // (`next_range_start` + the `structure` it detected) when there's more —
    // large Chinese manga & webtoons routinely run 600-3000+ chapters, too many
    // for one completion to return accurately or completely in one call.
    const { data, error } = await supabase.functions.invoke("manga-sanctuary-manga-chapter-search", {
      body: { title: novelTitle },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Failed to search chapters");
      setLoading(false);
      return;
    }

    let allRaw: any[] = Array.isArray(data.chapters) ? data.chapters : [];
    let done = data.done !== false; // structured (Royal Road) path has no `done` field — treat as complete
    let nextRangeStart: number | null = data.next_range_start ?? null;
    const structure = data.structure ?? null;
    const source = data.source || "AI search";
    const hasVolumes = data.has_volumes === true;
    const totalChapters = data.total_chapters || allRaw.length;

    if (!done && nextRangeStart && structure) {
      setProgress({ done: allRaw.length, total: totalChapters });
      let batches = 0;
      while (!done && nextRangeStart && batches < MAX_BATCHES) {
        batches++;
        const { data: batchData, error: batchError } = await supabase.functions.invoke(
          "manga-sanctuary-manga-chapter-search",
          { body: { title: novelTitle, range_start: nextRangeStart, structure } },
        );
        if (batchError || batchData?.error) {
          toast.warning(`Stopped early at chapter ${nextRangeStart - 1} — ${batchData?.error || batchError?.message || "batch fetch failed"}`);
          break;
        }
        allRaw = allRaw.concat(Array.isArray(batchData.chapters) ? batchData.chapters : []);
        done = batchData.done === true;
        nextRangeStart = batchData.next_range_start ?? null;
        setProgress({ done: allRaw.length, total: totalChapters });
      }
    }

    setProgress(null);
    setLoading(false);

    const chapters = toAiChapters(allRaw);
    if (chapters.length === 0) {
      toast.error("No chapters found");
      return;
    }

    const volCount = data.total_volumes || 0;
    toast.success(
      hasVolumes
        ? `Found ${chapters.length} chapters across ${volCount} volumes from ${source}`
        : `Found ${chapters.length} chapters from ${source}`
    );
    onChaptersFound(chapters, source, hasVolumes);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5 border-border/50 hover:border-primary/30 hover:bg-primary/5"
      onClick={handleSearch}
      disabled={loading}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      {progress ? `Fetching ${progress.done}/${progress.total}...` : loading ? "Searching..." : "AI Search Chapters"}
    </Button>
  );
}
