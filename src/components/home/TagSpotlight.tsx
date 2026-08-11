import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Hash } from "lucide-react";
import type { MangaWithDetails } from "@/hooks/use-manga";

interface TagSpotlightProps {
  manga: MangaWithDetails[];
  limit?: number;
}

// Since reader/rating counts are still thin on a young catalog, tags are a
// more reliable discovery signal than "most read"/"highest rated" — surface
// whichever tags actually show up most across the approved catalog.
export default function TagSpotlight({ manga, limit = 12 }: TagSpotlightProps) {
  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of manga) {
      for (const tag of m.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag]) => tag);
  }, [manga, limit]);

  if (topTags.length === 0) return null;

  return (
    <nav className="border-t border-border pt-5" aria-label="Browse by tag">
      <p className="mb-4 flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-primary">
        <Hash className="h-3.5 w-3.5" strokeWidth={1.8} /> Browse by tag
      </p>
      <div className="flex flex-wrap gap-2">
        {topTags.map((tag) => (
          <Link
            key={tag}
            to={`/search?tag=${encodeURIComponent(tag)}`}
            className="border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            {tag}
          </Link>
        ))}
      </div>
    </nav>
  );
}
