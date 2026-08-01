import { useState, useEffect } from "react";
import { useChapters } from "@/hooks/use-manga";
import { useSaveChaptersBulk, useDeleteAllChapters, useUpdateChapter, useDeleteChapter, useFetchChapterContent } from "@/hooks/use-chapters-admin";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Save, Trash2, Loader2, BookOpen, AlertTriangle, Layers, Download } from "lucide-react";
import ChapterAiSearch from "./ChapterAiSearch";
import ChapterManualAdd from "./ChapterManualAdd";
import ChapterBulkLinkEditor from "./ChapterBulkLinkEditor";
import ChapterListItem from "./ChapterListItem";

interface StagedChapter {
  id?: string;
  number: number;
  title: string;
  url: string;
  isNew?: boolean;
  dirty?: boolean;
  volume_number?: number | null;
  volume_title?: string | null;
  hasContent?: boolean;
}

interface AdminChapterManagerProps {
  mangaId: string;
  mangaTitle: string;
}

function groupByVolume(chapters: StagedChapter[]): Map<string, StagedChapter[]> {
  const groups = new Map<string, StagedChapter[]>();
  for (const ch of chapters) {
    const key = ch.volume_number != null
      ? `vol-${ch.volume_number}`
      : "no-volume";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ch);
  }
  return groups;
}

export default function AdminChapterManager({ mangaId, mangaTitle }: AdminChapterManagerProps) {
  const { data: existingChapters = [], isLoading } = useChapters(mangaId);
  const saveBulk = useSaveChaptersBulk(mangaId);
  const deleteAll = useDeleteAllChapters(mangaId);
  const updateChapter = useUpdateChapter(mangaId);
  const deleteChapter = useDeleteChapter(mangaId);
  const fetchContent = useFetchChapterContent(mangaId);

  const [staged, setStaged] = useState<StagedChapter[]>([]);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [hasVolumes, setHasVolumes] = useState(false);
  const [contentProgress, setContentProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (existingChapters.length > 0 && staged.length === 0) {
      const mapped = existingChapters.map((ch) => ({
        id: ch.id,
        number: ch.chapter_number,
        title: ch.chapter_title || `Chapter ${ch.chapter_number}`,
        url: ch.external_url || "#",
        isNew: false,
        volume_number: ch.volume_number ?? null,
        volume_title: ch.volume_title ?? null,
        hasContent: Array.isArray(ch.pages) && ch.pages.length > 0,
      }));
      setStaged(mapped);
      setHasVolumes(mapped.some((c) => c.volume_number != null));
    }
  }, [existingChapters]);

  // The effect above only ever populates `staged` once (guarded so it
  // doesn't clobber in-progress local edits). That meant `hasContent`
  // badges never refreshed after Fetch Content invalidated the underlying
  // query — the DB write landed fine, but the admin UI kept showing the
  // pre-fetch state until a full page reload. Patch just the `hasContent`
  // flag in from the fresh query result whenever it changes, without
  // touching anything else the user may have staged.
  useEffect(() => {
    if (existingChapters.length === 0) return;
    const contentById = new Map(existingChapters.map((ch) => [ch.id, Array.isArray(ch.pages) && ch.pages.length > 0]));
    setStaged((prev) => {
      let changed = false;
      const next = prev.map((ch) => {
        if (!ch.id) return ch;
        const fresh = contentById.get(ch.id);
        if (fresh !== undefined && fresh !== ch.hasContent) {
          changed = true;
          return { ...ch, hasContent: fresh };
        }
        return ch;
      });
      return changed ? next : prev;
    });
  }, [existingChapters]);

  const handleAiChaptersFound = (
    chapters: { number: number; title: string; url: string; volume_number?: number | null; volume_title?: string | null }[],
    _source: string,
    aiHasVolumes?: boolean
  ) => {
    const newStaged: StagedChapter[] = chapters.map((ch) => ({
      number: ch.number,
      title: ch.title,
      url: ch.url,
      isNew: true,
      volume_number: ch.volume_number ?? null,
      volume_title: ch.volume_title ?? null,
    }));
    setStaged(newStaged);
    setHasVolumes(aiHasVolumes ?? newStaged.some((c) => c.volume_number != null));
    setHasUnsaved(true);
  };

  const handleManualAdd = (chapter: { number: number; title: string; url: string }) => {
    setStaged((prev) => {
      const exists = prev.find((c) => c.number === chapter.number && c.volume_number == null);
      if (exists) {
        toast.error(`Chapter ${chapter.number} already exists`);
        return prev;
      }
      return [...prev, { ...chapter, isNew: true, volume_number: null, volume_title: null }].sort((a, b) => a.number - b.number);
    });
    setHasUnsaved(true);
  };

  const handleBulkLinks = (baseUrl: string) => {
    // Was only updating local component state — chapters that already exist
    // in the DB (id present, not `isNew`) never got persisted by this alone,
    // since handleSaveAll only ever wrote rows flagged `isNew`. Marking them
    // `dirty` here makes Save Chapters pick them up too.
    setStaged((prev) =>
      prev.map((ch) => ({
        ...ch,
        url: baseUrl.replace("{n}", String(ch.number)).replace("{v}", String(ch.volume_number ?? "")),
        dirty: ch.id ? true : ch.dirty,
      }))
    );
    setHasUnsaved(true);
    toast.success("Links applied — click Save Chapters to persist");
  };

  const handleUpdateStaged = (index: number, title: string, url: string) => {
    setStaged((prev) => {
      const updated = [...prev];
      const ch = updated[index];
      if (ch.id) {
        updateChapter.mutate({ id: ch.id, chapter_title: title, external_url: url || null });
      }
      updated[index] = { ...ch, title, url };
      return updated;
    });
  };

  const handleFetchContent = async (index: number) => {
    const ch = staged[index];
    if (!ch.id || !ch.url || ch.url === "#") return;
    try {
      const res = await fetchContent.mutateAsync({ id: ch.id, url: ch.url });
      setStaged((prev) => prev.map((c, i) => (i === index ? { ...c, hasContent: true } : c)));
      toast.success(`Fetched ${res.page_count.toLocaleString()} pages from ${res.source}`);
    } catch (err: any) {
      toast.error(err.message || "Could not fetch chapter content");
    }
  };

  // Sequential, not parallel — Byparr/target sites will choke on a burst of
  // concurrent requests for a 600+ chapter manga, and this only needs to run
  // once per chapter (guarded by hasContent).
  const handleFetchAllContent = async () => {
    const targets = staged
      .map((ch, i) => ({ ch, i }))
      .filter(({ ch }) => ch.id && ch.url && ch.url !== "#" && !ch.hasContent);
    if (targets.length === 0) {
      toast.info("Every chapter with a link already has content fetched");
      return;
    }
    setContentProgress({ done: 0, total: targets.length });
    let ok = 0;
    for (let n = 0; n < targets.length; n++) {
      const { ch, i } = targets[n];
      try {
        await fetchContent.mutateAsync({ id: ch.id!, url: ch.url });
        setStaged((prev) => prev.map((c, idx) => (idx === i ? { ...c, hasContent: true } : c)));
        ok++;
      } catch {
        /* best-effort — keep going, some chapters just won't be scrapable */
      }
      setContentProgress({ done: n + 1, total: targets.length });
    }
    setContentProgress(null);
    toast.success(`Fetched content for ${ok}/${targets.length} chapters (${targets.length - ok} skipped — read externally)`);
  };

  const handleDeleteStaged = (index: number) => {
    const ch = staged[index];
    if (ch.id) deleteChapter.mutate(ch.id);
    setStaged((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveAll = async () => {
    // "New" = not yet in the DB (from AI search / manual add). "Dirty" =
    // already in the DB but edited locally since (e.g. bulk link pattern
    // applied) without going through the per-row auto-save path. Both need
    // to be written on Save Chapters — previously only `isNew` did anything,
    // which is why bulk-applied links on already-saved chapters silently
    // never persisted unless you re-ran AI search or manually re-added them.
    const newChapters = staged.filter((ch) => ch.isNew);
    const dirtyExisting = staged.filter((ch) => ch.dirty && !ch.isNew && ch.id);
    if (newChapters.length === 0 && dirtyExisting.length === 0) {
      toast.info("No changes to save");
      return;
    }

    const allNew = staged.length > 0 && staged.every((ch) => ch.isNew);
    if (allNew && existingChapters.length > 0) {
      await deleteAll.mutateAsync();
    }

    const toSave = allNew ? newChapters : [...newChapters, ...dirtyExisting];

    saveBulk.mutate(
      toSave.map((ch) => ({
        id: ch.isNew ? undefined : ch.id,
        chapter_number: ch.number,
        chapter_title: ch.title,
        external_url: ch.url === "#" ? null : ch.url,
        ...(ch.isNew ? { release_date: new Date().toISOString() } : {}),
        volume_number: ch.volume_number ?? null,
        volume_title: ch.volume_title ?? null,
      })),
      {
        onSuccess: () => {
          toast.success(`${toSave.length} chapter${toSave.length === 1 ? "" : "s"} saved!`);
          setHasUnsaved(false);
          setStaged((prev) => prev.map((ch) => ({ ...ch, isNew: false, dirty: false })));
        },
        onError: (err: any) => toast.error(err.message),
      }
    );
  };

  const handleClearAll = () => {
    if (!confirm("Remove all chapters? This will delete them from the database too.")) return;
    deleteAll.mutate(undefined, {
      onSuccess: () => {
        setStaged([]);
        setHasUnsaved(false);
        setHasVolumes(false);
        toast.success("All chapters removed");
      },
      onError: (err: any) => toast.error(err.message),
    });
  };

  if (isLoading) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
        Loading chapters...
      </div>
    );
  }

  const groups = groupByVolume(staged);
  const volumeKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "no-volume") return -1;
    if (b === "no-volume") return 1;
    return parseInt(a.replace("vol-", "")) - parseInt(b.replace("vol-", ""));
  });

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border/30">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">{staged.length} chapters</span>
        </div>
        {hasVolumes && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
            <Layers className="h-4 w-4 text-violet-400" />
            <span className="text-sm font-semibold text-violet-400">{volumeKeys.filter(k => k !== "no-volume").length} volumes</span>
          </div>
        )}
        {hasUnsaved && (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-golden/10 border border-golden/20">
            <AlertTriangle className="h-3.5 w-3.5 text-golden" />
            <span className="text-xs font-semibold text-golden">Unsaved changes</span>
          </div>
        )}
      </div>

      {/* Actions row */}
      <div className="flex flex-wrap gap-2">
        <ChapterAiSearch mangaTitle={mangaTitle} onChaptersFound={handleAiChaptersFound} />
        {staged.length > 0 && (
          <>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 gradient-neon border-0 text-white"
              onClick={handleSaveAll}
              disabled={saveBulk.isPending || !hasUnsaved}
            >
              {saveBulk.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Chapters
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
              onClick={handleFetchAllContent}
              disabled={!!contentProgress}
              title="Scrape chapter text so readers stay in-app instead of leaving to the source site"
            >
              {contentProgress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {contentProgress ? `Fetching ${contentProgress.done}/${contentProgress.total}...` : "Fetch Missing Content"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={handleClearAll}
              disabled={deleteAll.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear All
            </Button>
          </>
        )}
      </div>

      {/* Bulk link editor */}
      {staged.length > 0 && (
        <ChapterBulkLinkEditor onApply={handleBulkLinks} />
      )}

      {/* Manual add */}
      <ChapterManualAdd
        nextNumber={staged.filter(c => c.volume_number == null).length > 0
          ? Math.max(...staged.filter(c => c.volume_number == null).map((c) => c.number)) + 1
          : 1}
        onAdd={handleManualAdd}
      />

      {/* Chapter list — grouped by volume if applicable */}
      {staged.length > 0 ? (
        <ScrollArea className="h-[450px] rounded-xl border border-border/30 bg-card/30 p-2">
          <div className="space-y-1">
            {hasVolumes ? (
              volumeKeys.map((key) => {
                const volChapters = groups.get(key)!;
                const firstCh = volChapters[0];
                const volNum = firstCh.volume_number;
                const volTitle = firstCh.volume_title;
                const globalIndices = volChapters.map((ch) => staged.indexOf(ch));

                return (
                  <div key={key} className="space-y-0.5">
                    {/* Volume header */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 sticky top-0 z-10">
                      <Layers className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                      <span className="text-xs font-bold text-violet-400">
                        {volNum != null ? `Volume ${volNum}` : "Chapters"}
                        {volTitle ? ` — ${volTitle}` : ""}
                      </span>
                      <span className="text-[10px] text-violet-400/60 ml-auto">{volChapters.length} ch.</span>
                    </div>
                    {/* Chapters in this volume */}
                    {volChapters.map((ch, localIdx) => {
                      const globalIdx = globalIndices[localIdx];
                      return (
                        <ChapterListItem
                          key={`${ch.volume_number}-${ch.number}-${localIdx}`}
                          number={ch.number}
                          title={ch.title}
                          url={ch.url}
                          hasContent={ch.hasContent}
                          fetchingContent={fetchContent.isPending}
                          onUpdate={(title, url) => handleUpdateStaged(globalIdx, title, url)}
                          onDelete={() => handleDeleteStaged(globalIdx)}
                          onFetchContent={ch.id ? () => handleFetchContent(globalIdx) : undefined}
                        />
                      );
                    })}
                  </div>
                );
              })
            ) : (
              staged.map((ch, i) => (
                <ChapterListItem
                  key={`${ch.number}-${i}`}
                  number={ch.number}
                  title={ch.title}
                  url={ch.url}
                  hasContent={ch.hasContent}
                  fetchingContent={fetchContent.isPending}
                  onUpdate={(title, url) => handleUpdateStaged(i, title, url)}
                  onDelete={() => handleDeleteStaged(i)}
                  onFetchContent={ch.id ? () => handleFetchContent(i) : undefined}
                />
              ))
            )}
          </div>
        </ScrollArea>
      ) : (
        <div className="text-center py-12 rounded-xl border border-border/30 bg-card/30">
          <BookOpen className="h-8 w-8 text-primary/15 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No chapters yet. Use AI search or add manually.</p>
        </div>
      )}
    </div>
  );
}