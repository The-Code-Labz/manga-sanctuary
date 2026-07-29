import { ArrowRight, BookOpen, Star, Users } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import type { MangaWithDetails } from "@/hooks/use-manga";
import MangaTypeBadge from "@/components/manga/MangaTypeBadge";

interface FeaturedMangaHeroProps {
  featured?: MangaWithDetails;
  catalogSize: number;
}

export default function FeaturedMangaHero({ featured, catalogSize }: FeaturedMangaHeroProps) {
  const reduceMotion = useReducedMotion();

  return (
    <section className="manga-panel-grid relative overflow-hidden border-y border-border" aria-labelledby="hero-title">
      <div className="grid min-h-[34rem] lg:grid-cols-[1.08fr_0.92fr]">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="relative flex flex-col justify-between border-b border-border p-6 sm:p-9 lg:border-b-0 lg:border-r lg:p-12"
        >
          <div className="flex items-center justify-between text-[0.65rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            <span>Curated reading index</span>
            <span>Issue 01</span>
          </div>

          <div className="max-w-2xl py-14 lg:py-8">
            <p className="mb-5 font-serif text-sm font-bold text-primary">Manga / Manhwa / Manhua / Webtoon</p>
            <h1 id="hero-title" className="max-w-[15ch] font-serif text-[clamp(2.7rem,6vw,5.8rem)] font-bold leading-[0.92] tracking-[-0.065em] text-foreground">
              Find the story you will carry past the final panel.
            </h1>
            <p className="mt-7 max-w-[58ch] text-sm leading-7 text-muted-foreground sm:text-base">
              Browse across formats and regions, keep your place, and build a shelf around what you actually want to read next.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/search" className="inline-flex min-h-12 items-center gap-2 bg-primary px-5 text-sm font-bold text-primary-foreground transition-transform active:translate-y-px">
                Browse the stacks <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
              </Link>
              <Link to="/library" className="inline-flex min-h-12 items-center gap-2 border border-border bg-background/70 px-5 text-sm font-bold text-foreground transition-colors hover:border-foreground/40">
                <BookOpen className="h-4 w-4" strokeWidth={1.8} /> My shelf
              </Link>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-5 border-t border-border pt-5 sm:grid-cols-3">
            <div><dt className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">Catalog</dt><dd className="mt-1 font-serif text-xl font-bold text-foreground">{catalogSize} titles</dd></div>
            <div><dt className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">Formats</dt><dd className="mt-1 font-serif text-xl font-bold text-foreground">Four regions</dd></div>
            <div className="hidden sm:block"><dt className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">Updates</dt><dd className="mt-1 font-serif text-xl font-bold text-foreground">Chapter by chapter</dd></div>
          </dl>
        </motion.div>

        <div className="relative flex min-h-[31rem] items-end bg-secondary p-5 sm:p-8 lg:p-10">
          {featured ? (
            <>
              <img src={featured.cover_url ?? "/placeholder.svg"} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 grayscale-[35%]" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/15" />
              <motion.article
                initial={reduceMotion ? false : { opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.16, duration: 0.45 }}
                className="relative w-full border border-foreground/20 bg-background/90 p-5 shadow-[8px_8px_0_hsl(var(--primary))] sm:p-7"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[0.62rem] font-bold uppercase tracking-[0.2em] text-primary">Reader favorite</span>
                  <MangaTypeBadge type={featured.manga_type} />
                </div>
                <h2 className="mt-5 max-w-[18ch] font-serif text-3xl font-bold leading-none tracking-[-0.045em] text-foreground sm:text-4xl">{featured.title}</h2>
                <p className="mt-3 text-sm text-muted-foreground">Story by {featured.author_name}</p>
                <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-y border-border py-4 text-xs font-semibold text-foreground">
                  <span className="inline-flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-golden" fill="currentColor" /> {featured.rating || "Unrated"}</span>
                  <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-primary" /> {featured.reader_count.toLocaleString()} readers</span>
                  <span>{featured.chapter_count} chapters</span>
                </div>
                <Link to={`/manga/${featured.id}`} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-foreground transition-colors hover:text-primary">
                  Open title <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
                </Link>
              </motion.article>
            </>
          ) : (
            <div className="relative border border-dashed border-border p-8 text-sm text-muted-foreground">The featured shelf is waiting for its first title.</div>
          )}
        </div>
      </div>
    </section>
  );
}
