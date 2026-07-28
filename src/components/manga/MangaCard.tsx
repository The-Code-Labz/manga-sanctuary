import { Link } from "react-router-dom";
import { Star, BookOpen } from "lucide-react";
import type { MangaWithDetails } from "@/hooks/use-manga";
import { motion } from "framer-motion";
import MangaTypeBadge from "./MangaTypeBadge";

const langClass: Record<string, string> = {
  JP: "lang-badge-jp",
  CN: "lang-badge-cn",
  KR: "lang-badge-kr",
  EN: "lang-badge-en",
};

export default function MangaCard({ manga }: { manga: MangaWithDetails }) {
  return (
    <Link to={`/manga/${manga.id}`}>
      <motion.div
        whileHover={{ y: -4, scale: 1.02 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="group flex flex-col rounded-xl overflow-hidden bg-card anime-card border border-border/50 border-glow-hover transition-all duration-300"
      >
        <div className="relative aspect-[3/4] overflow-hidden">
          <img
            src={manga.cover_url ?? "/placeholder.svg"}
            alt={manga.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-300" />

          {/* Top left badges */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-sm ${langClass[manga.language] ?? ""}`}>
              {manga.language}
            </span>
            <MangaTypeBadge type={manga.novel_type} size="sm" />
          </div>

          {/* Chapter count */}
          <div className="absolute top-2 right-2">
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-background/60 backdrop-blur-sm text-foreground/80 flex items-center gap-1">
              <BookOpen className="h-2.5 w-2.5" />
              {manga.chapter_count}
            </span>
          </div>

          {/* Bottom info overlay */}
          <div className="absolute bottom-0 inset-x-0 p-2.5 pt-8">
            <div className="flex items-center gap-1.5 text-xs">
              <Star className="h-3.5 w-3.5 fill-golden text-golden" />
              <span className="text-golden font-semibold">{manga.rating || "—"}</span>
              <span className="text-foreground/50">({manga.rating_count})</span>
            </div>
          </div>
        </div>

        <div className="p-3 flex flex-col gap-1.5 flex-1">
          <h3 className="text-sm font-semibold line-clamp-2 leading-tight group-hover:gradient-neon-text transition-all duration-300">
            {manga.title}
          </h3>
          <p className="text-xs text-muted-foreground font-medium">{manga.author_name}</p>
          <div className="flex flex-wrap gap-1 mt-auto pt-2">
            {manga.genres.slice(0, 2).map((g) => (
              <span key={g} className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary/80 font-medium">
                {g}
              </span>
            ))}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}