import { History } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useContinueReading } from "@/hooks/use-manga";

export default function ContinueReadingSection() {
  const { user } = useAuth();
  const { data: items = [], isLoading } = useContinueReading();
  const reduceMotion = useReducedMotion();

  if (!user) return null;
  if (!isLoading && items.length === 0) return null;

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      aria-labelledby="section-continue-reading"
    >
      <div className="mb-7 border-t border-border pt-5">
        <p className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-primary">
          <History className="h-3.5 w-3.5" strokeWidth={1.8} /> Pick up where you left off
        </p>
        <h2 id="section-continue-reading" className="mt-2 font-serif text-2xl font-bold tracking-[-0.04em] text-foreground sm:text-3xl">
          Continue Reading
        </h2>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] w-28 flex-shrink-0 animate-pulse border border-border bg-secondary sm:w-32" />
            ))
          : items.map((item) => (
              <Link
                key={item.mangaId}
                to={item.chapterId ? `/manga/${item.mangaId}/chapter/${item.chapterId}` : `/manga/${item.mangaId}`}
                className="group relative w-28 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background sm:w-32"
              >
                <div className="relative aspect-[2/3] overflow-hidden border border-border bg-secondary">
                  <img
                    src={item.manga.cover_url ?? "/placeholder.svg"}
                    alt={`Cover of ${item.manga.title}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background/95 to-transparent" />
                  <span className="absolute bottom-2 left-2 border border-foreground/20 bg-background/90 px-1.5 py-0.5 text-[0.62rem] font-bold tracking-[0.08em] text-foreground">
                    Ch. {item.chapterNumber}
                  </span>
                  <div className="absolute inset-0 flex items-center justify-center bg-background/0 opacity-0 transition-opacity duration-200 group-hover:bg-background/40 group-hover:opacity-100">
                    <History className="h-6 w-6 text-foreground" strokeWidth={1.8} />
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-xs font-semibold leading-tight text-foreground">{item.manga.title}</p>
              </Link>
            ))}
      </div>
    </motion.section>
  );
}
