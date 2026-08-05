import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useChapter, useChapterNavList, useManga } from "@/hooks/use-manga";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ArrowLeft, ChevronLeft, ChevronRight, List, Sparkles, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { motion } from "framer-motion";

type FitMode = "width" | "height" | "original";

export default function MangaReaderPage() {
  const { mangaId, chapterId } = useParams();
  const navigate = useNavigate();
  const { data: manga } = useManga(mangaId ?? "");
  const { data: chapter, isLoading } = useChapter(chapterId ?? "");
  const { data: navList = [] } = useChapterNavList(mangaId ?? "");
  const [fit, setFit] = useState<FitMode>("width");

  const index = useMemo(() => navList.findIndex((c) => c.id === chapterId), [navList, chapterId]);
  const prevChapter = index > 0 ? navList[index - 1] : null;
  const nextChapter = index >= 0 && index < navList.length - 1 ? navList[index + 1] : null;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [chapterId]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && prevChapter) {
        navigate(`/manga/${mangaId}/chapter/${prevChapter.id}`);
      } else if (e.key === "ArrowRight" && nextChapter) {
        navigate(`/manga/${mangaId}/chapter/${nextChapter.id}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mangaId, prevChapter, nextChapter, navigate]);

  const fitClass = {
    width: "max-w-full w-full h-auto",
    height: "max-h-[85vh] w-auto h-auto",
    original: "max-w-none w-auto h-auto",
  }[fit];

  if (isLoading) {
    return (
      <div className="py-20 text-center">
        <Sparkles className="h-6 w-6 text-primary animate-spin mx-auto mb-3" />
        <p className="text-muted-foreground">Loading chapter...</p>
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Chapter not found.</p>
        <Link to={mangaId ? `/manga/${mangaId}` : "/"} className="text-primary text-sm mt-2 inline-block hover:underline">
          Back to manga
        </Link>
      </div>
    );
  }

  // Large chapters (>25 pages) can't stitch synchronously — they're handed
  // off to the async manga-chapter-stitch Kestra flow, which PATCHes
  // strip_url/stitch_status onto the row once done. Until then (or on
  // failure) the untouched per-page array is the reader's source of truth;
  // once ready, prefer the single long-strip image over N separate <img>s.
  const useStrip = chapter.stitch_status === "ready" && !!chapter.strip_url;
  const pages = useStrip
    ? [{ page_number: 1, image_url: chapter.strip_url! }]
    : chapter.pages?.length > 0
      ? chapter.pages
      : [];
  const isStitching = chapter.stitch_status === "processing" && chapter.pages?.length > 1;

  const NavRow = () => (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 border-border/50 hover:border-primary/30"
        onClick={() => prevChapter && navigate(`/manga/${mangaId}/chapter/${prevChapter.id}`)}
        disabled={!prevChapter}
      >
        <ChevronLeft className="h-4 w-4" /> Prev
      </Button>
      <Link
        to={mangaId ? `/manga/${mangaId}` : "/"}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <List className="h-4 w-4" /> Chapter list
      </Link>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 border-border/50 hover:border-primary/30"
        onClick={() => nextChapter && navigate(`/manga/${mangaId}/chapter/${nextChapter.id}`)}
        disabled={!nextChapter}
      >
        Next <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div className="pb-16 space-y-6">
      <Link to={mangaId ? `/manga/${mangaId}` : "/"} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors duration-300">
        <ArrowLeft className="h-4 w-4" /> Back to {manga?.title ?? "manga"}
      </Link>

      <div className="text-center space-y-1">
        {manga && <p className="text-xs text-muted-foreground uppercase tracking-wider">{manga.title}</p>}
        <h1 className="text-xl md:text-2xl font-extrabold">
          {chapter.volume_number != null ? `Vol. ${chapter.volume_number} — ` : ""}
          Chapter {chapter.chapter_number}
          {chapter.chapter_title ? `: ${chapter.chapter_title}` : ""}
        </h1>
        <p className="text-xs text-muted-foreground">
          {useStrip ? "Long strip" : `${pages.length} ${pages.length === 1 ? "page" : "pages"}`}
          {isStitching && " · optimizing into a long strip…"}
        </p>
      </div>

      <div className="sticky top-20 z-30 space-y-3 bg-background/80 backdrop-blur-md py-3 rounded-xl border border-border/30">
        <NavRow />
        <div className="flex items-center justify-center gap-3">
          <span className="text-xs text-muted-foreground">Fit:</span>
          <ToggleGroup type="single" value={fit} onValueChange={(v) => v && setFit(v as FitMode)}>
            <ToggleGroupItem value="width" aria-label="Fit to width" className="text-xs h-8 px-2">
              <ZoomOut className="h-3.5 w-3.5 mr-1" /> Width
            </ToggleGroupItem>
            <ToggleGroupItem value="height" aria-label="Fit to height" className="text-xs h-8 px-2">
              <ZoomIn className="h-3.5 w-3.5 mr-1" /> Height
            </ToggleGroupItem>
            <ToggleGroupItem value="original" aria-label="Original size" className="text-xs h-8 px-2">
              <Maximize className="h-3.5 w-3.5 mr-1" /> Original
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {pages.length > 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-1 md:gap-2"
        >
          {pages.map((page, i) => (
            <img
              key={page.page_number}
              src={page.image_url}
              alt={`Page ${page.page_number}`}
              loading={i < 3 ? "eager" : "lazy"}
              className={`rounded-sm shadow-lg ${fitClass}`}
            />
          ))}
        </motion.div>
      ) : (
        <div className="text-center py-16 rounded-xl border border-border/30 bg-card/30 space-y-4">
          <p className="text-sm text-muted-foreground">No pages are available for this chapter yet.</p>
          {chapter.external_url && (
            <Button
              className="gap-2 gradient-neon border-0 text-white"
              onClick={() => window.open(chapter.external_url!, "_blank", "noopener,noreferrer")}
            >
              Read on original site
            </Button>
          )}
        </div>
      )}

      <div className="sticky bottom-4 z-30 bg-background/80 backdrop-blur-md py-3 rounded-xl border border-border/30">
        <NavRow />
      </div>
    </div>
  );
}
