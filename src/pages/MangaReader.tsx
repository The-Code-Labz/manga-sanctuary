import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useChapter, useChapterNavList, useManga, useSaveReadingProgress } from "@/hooks/use-manga";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  LayoutList,
  Menu,
  Rows3,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Maximize,
  X,
} from "lucide-react";
import { motion } from "framer-motion";

type FitMode = "width" | "height" | "original";

const MENU_VISIBLE_KEY = "manga-reader-menu-visible";

function loadMenuVisible(): boolean {
  const stored = localStorage.getItem(MENU_VISIBLE_KEY);
  return stored === null ? true : stored === "1";
}

export default function MangaReaderPage() {
  const { mangaId, chapterId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: manga } = useManga(mangaId ?? "");
  const { data: chapter, isLoading } = useChapter(chapterId ?? "");
  const { data: navList = [] } = useChapterNavList(mangaId ?? "");
  const [fit, setFit] = useState<FitMode>("width");
  const [showMenu, setShowMenu] = useState(loadMenuVisible);
  const saveProgress = useSaveReadingProgress();

  const index = useMemo(() => navList.findIndex((c) => c.id === chapterId), [navList, chapterId]);
  const prevChapter = index > 0 ? navList[index - 1] : null;
  const nextChapter = index >= 0 && index < navList.length - 1 ? navList[index + 1] : null;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [chapterId]);

  // "Continue Reading" save point — record this as the last-opened chapter
  // for signed-in users. Fires once per chapter visit (mutation is a no-op
  // for signed-out users); saves on external-link chapters too, since
  // landing on the reader for a chapter is the "I read this" signal
  // regardless of whether the pages render in-app.
  useEffect(() => {
    if (!user || !mangaId || !chapter || chapter.id !== chapterId) return;
    saveProgress.mutate({ mangaId, chapterId: chapter.id, chapterNumber: chapter.chapter_number });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, mangaId, chapter?.id]);

  const toggleMenu = () => {
    setShowMenu((prev) => {
      const next = !prev;
      localStorage.setItem(MENU_VISIBLE_KEY, next ? "1" : "0");
      return next;
    });
  };

  // Keyboard navigation + immersive-menu toggle ('m'). Ignored while a real
  // text input has focus so it can't hijack typing elsewhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowLeft" && prevChapter) {
        navigate(`/manga/${mangaId}/chapter/${prevChapter.id}`);
      } else if (e.key === "ArrowRight" && nextChapter) {
        navigate(`/manga/${mangaId}/chapter/${nextChapter.id}`);
      } else if (e.key === "m" || e.key === "M") {
        toggleMenu();
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

  // Large chapters can't stitch synchronously — they're handed off to the
  // async manga-chapter-stitch Kestra flow, which PATCHes strip_url/
  // stitch_status onto the row once done. Until then (or on failure) the
  // untouched per-page array is the reader's source of truth; once ready,
  // prefer the single long-strip image over N separate <img>s.
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

      {navList.length > 0 && (
        <Select
          value={chapterId}
          onValueChange={(id) => navigate(`/manga/${mangaId}/chapter/${id}`)}
        >
          <SelectTrigger className="h-9 w-auto min-w-[160px] max-w-[280px] gap-1.5 text-xs">
            <Rows3 className="h-3.5 w-3.5 shrink-0 opacity-70" />
            <SelectValue placeholder="Jump to chapter" />
          </SelectTrigger>
          <SelectContent className="max-h-[60vh]">
            {navList.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-xs">
                {c.volume_number != null ? `Vol. ${c.volume_number} — ` : ""}
                Ch. {c.chapter_number}
                {c.chapter_title ? `: ${c.chapter_title}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

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
      {/* Always-visible floating control — the only way back once the menu
          is hidden for immersive reading. Keyboard users can just press M. */}
      <button
        type="button"
        onClick={toggleMenu}
        title={`${showMenu ? "Hide" : "Show"} menu (M)`}
        aria-label={`${showMenu ? "Hide" : "Show"} menu`}
        className="fixed top-20 right-3 z-40 h-10 w-10 rounded-full bg-background/80 backdrop-blur-md border border-border/50 shadow-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
      >
        {showMenu ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {showMenu && (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground"
              onClick={() => navigate(mangaId ? `/manga/${mangaId}` : "/")}
            >
              <LayoutList className="h-4 w-4" /> Index
            </Button>
          </div>

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
              {navList.length > 0 && index >= 0 && ` · Chapter ${index + 1} of ${navList.length}`}
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
        </>
      )}

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
              onClick={toggleMenu}
              className={`rounded-sm shadow-lg cursor-pointer ${fitClass}`}
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

      {showMenu && (
        <div className="sticky bottom-4 z-30 bg-background/80 backdrop-blur-md py-3 rounded-xl border border-border/30">
          <NavRow />
        </div>
      )}
    </div>
  );
}
