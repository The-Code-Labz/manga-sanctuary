import { Link } from "react-router-dom";
import { BookOpen, Star } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { MangaWithDetails } from "@/hooks/use-manga";
import MangaTypeBadge from "./MangaTypeBadge";

interface MangaCardProps {
  manga: MangaWithDetails;
  rank?: number;
}

export default function MangaCard({ manga, rank }: MangaCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <Link to={`/manga/${manga.id}`} className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
      <motion.article
        whileHover={reduceMotion ? undefined : { y: -3 }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
        className="flex h-full flex-col"
      >
        <div className="relative aspect-[2/3] overflow-hidden border border-border bg-secondary">
          <img
            src={manga.cover_url ?? "/placeholder.svg"}
            alt={`Cover of ${manga.title}`}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035] group-hover:saturate-[1.08]"
          />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background/95 to-transparent" />

          <div className="absolute left-2.5 top-2.5 flex items-start gap-1.5">
            {rank && (
              <span className="grid h-8 min-w-8 place-items-center border border-foreground/20 bg-background/90 px-1 font-serif text-sm font-bold text-foreground">
                {String(rank).padStart(2, "0")}
              </span>
            )}
            <span className="border border-foreground/20 bg-background/90 px-2 py-1 text-[0.62rem] font-bold tracking-[0.12em] text-foreground">
              {manga.language}
            </span>
          </div>

          <div className="absolute right-2.5 top-2.5"><MangaTypeBadge type={manga.manga_type} /></div>
          <div className="absolute inset-x-3 bottom-3 flex items-center justify-between text-[0.68rem] font-semibold text-foreground">
            <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 text-golden" fill="currentColor" /> {manga.rating || "New"}</span>
            <span className="inline-flex items-center gap-1 text-foreground/75"><BookOpen className="h-3.5 w-3.5" strokeWidth={1.8} /> {manga.chapter_count} ch.</span>
          </div>
        </div>

        <div className="flex flex-1 flex-col border-b border-border py-3">
          <h3 className="line-clamp-2 font-serif text-[0.98rem] font-bold leading-[1.15] tracking-[-0.02em] text-foreground transition-colors group-hover:text-primary">
            {manga.title}
          </h3>
          <p className="mt-1.5 truncate text-xs text-muted-foreground">{manga.author_name}</p>
          <div className="mt-auto flex items-center gap-2 pt-3 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <span>{manga.genres[0] ?? "Unclassified"}</span>
            <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground" aria-hidden="true" />
            <span>{manga.status}</span>
          </div>
        </div>
      </motion.article>
    </Link>
  );
}
