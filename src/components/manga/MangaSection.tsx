import { ArrowRight, BookOpen, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import type { MangaWithDetails } from "@/hooks/use-manga";
import MangaCard from "./MangaCard";

interface MangaSectionProps {
  eyebrow?: string;
  title: string;
  icon?: LucideIcon;
  manga: MangaWithDetails[];
  href?: string;
  ranked?: boolean;
}

export default function MangaSection({ eyebrow, title, icon: Icon = BookOpen, manga, href, ranked = false }: MangaSectionProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4 }}
      aria-labelledby={`section-${title.replace(/\s+/g, "-").toLowerCase()}`}
    >
      <div className="mb-7 flex items-end justify-between gap-4 border-t border-border pt-5">
        <div>
          <p className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-primary">
            <Icon className="h-3.5 w-3.5" strokeWidth={1.8} /> {eyebrow}
          </p>
          <h2 id={`section-${title.replace(/\s+/g, "-").toLowerCase()}`} className="mt-2 font-serif text-2xl font-bold tracking-[-0.04em] text-foreground sm:text-3xl">
            {title}
          </h2>
        </div>
        {href && (
          <Link to={href} className="group hidden items-center gap-2 pb-1 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground sm:inline-flex">
            View all <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.8} />
          </Link>
        )}
      </div>

      {manga.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-6 lg:gap-x-5">
          {manga.map((item, index) => (
            <motion.div
              key={item.id}
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: reduceMotion ? 0 : index * 0.04 }}
            >
              <MangaCard manga={item} rank={ranked ? index + 1 : undefined} />
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="border border-dashed border-border px-6 py-12 text-center">
          <BookOpen className="mx-auto h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 font-serif text-lg font-bold text-foreground">This shelf is still empty.</p>
          <p className="mt-1 text-sm text-muted-foreground">Approved titles will appear here as the catalog grows.</p>
        </div>
      )}
    </motion.section>
  );
}
