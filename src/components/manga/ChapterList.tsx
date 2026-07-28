import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { BookOpen, ExternalLink, Layers, BookOpenCheck } from "lucide-react";
import type { ChapterRow } from "@/hooks/use-manga";

interface ChapterListProps {
  chapters: ChapterRow[];
  mangaId: string;
}

function groupByVolume(chapters: ChapterRow[]): Map<string, ChapterRow[]> {
  const groups = new Map<string, ChapterRow[]>();
  for (const ch of chapters) {
    const key = ch.volume_number != null ? `vol-${ch.volume_number}` : "no-volume";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ch);
  }
  return groups;
}

function ChapterRow_({ ch, index, mangaId }: { ch: ChapterRow; index: number; mangaId: string }) {
  const navigate = useNavigate();
  const hasLink = ch.external_url && ch.external_url !== "#";
  const readableInApp = !!ch.content;
  const clickable = readableInApp || hasLink;

  const handleClick = () => {
    // In-app reader when we've scraped the text; otherwise fall back to
    // sending the reader offsite, same as before.
    if (readableInApp) navigate(`/manga/${mangaId}/chapter/${ch.id}`);
    else if (hasLink) window.open(ch.external_url!, "_blank", "noopener,noreferrer");
  };

  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.01, 0.3) }}
      onClick={handleClick}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm transition-all duration-300 border border-transparent text-left group ${
        clickable
          ? "hover:bg-primary/5 hover:border-primary/20 cursor-pointer"
          : "opacity-60 cursor-default"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-bold text-primary/70 w-14 shrink-0 text-xs">Ch. {ch.chapter_number}</span>
        <span className="text-muted-foreground group-hover:text-foreground transition-colors truncate">
          {ch.chapter_title || `Chapter ${ch.chapter_number}`}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
        <span>{ch.release_date ? new Date(ch.release_date).toLocaleDateString() : ""}</span>
        {readableInApp && (
          <BookOpenCheck className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-green-400" />
        )}
        {!readableInApp && hasLink && (
          <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
        )}
        {!clickable && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">No link</span>
        )}
      </div>
    </motion.button>
  );
}

export default function ChapterList({ chapters, mangaId }: ChapterListProps) {
  if (chapters.length === 0) {
    return (
      <div className="text-center py-16">
        <BookOpen className="h-8 w-8 text-primary/15 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No chapters available yet.</p>
      </div>
    );
  }

  const hasVolumes = chapters.some((ch) => ch.volume_number != null);

  if (!hasVolumes) {
    return (
      <div className="space-y-1 max-h-[600px] overflow-y-auto scrollbar-thin pr-2">
        {chapters.map((ch, i) => (
          <ChapterRow_ key={ch.id} ch={ch} index={i} mangaId={mangaId} />
        ))}
      </div>
    );
  }

  // Grouped by volume
  const groups = groupByVolume(chapters);
  const volumeKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "no-volume") return -1;
    if (b === "no-volume") return 1;
    return parseInt(a.replace("vol-", "")) - parseInt(b.replace("vol-", ""));
  });

  let globalIndex = 0;

  return (
    <div className="max-h-[600px] overflow-y-auto scrollbar-thin pr-2 space-y-3">
      {volumeKeys.map((key) => {
        const volChapters = groups.get(key)!;
        const firstCh = volChapters[0];
        const volNum = firstCh.volume_number;
        const volTitle = firstCh.volume_title;

        return (
          <div key={key} className="space-y-0.5">
            {/* Volume header */}
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20 sticky top-0 z-10 backdrop-blur-sm">
              <Layers className="h-3.5 w-3.5 text-violet-400 shrink-0" />
              <span className="text-sm font-bold text-violet-400">
                {volNum != null ? `Volume ${volNum}` : "Chapters"}
                {volTitle ? ` — ${volTitle}` : ""}
              </span>
              <span className="text-xs text-violet-400/60 ml-auto">{volChapters.length} chapters</span>
            </div>
            {/* Chapters */}
            {volChapters.map((ch) => {
              const idx = globalIndex++;
              return <ChapterRow_ key={ch.id} ch={ch} index={idx} mangaId={mangaId} />;
            })}
          </div>
        );
      })}
    </div>
  );
}