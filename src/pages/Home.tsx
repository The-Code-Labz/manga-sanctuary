import { useMangaList } from "@/hooks/use-manga";
import MangaSection from "@/components/manga/MangaSection";
import { TrendingUp, Clock, Star, Sparkles, BookOpen, Users } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

export default function HomePage() {
  const { data: manga = [], isLoading } = useMangaList();

  const trending = [...manga].sort((a, b) => b.reader_count - a.reader_count).slice(0, 6);
  const recentlyUpdated = [...manga].slice(0, 6);
  const highestRated = [...manga].sort((a, b) => b.rating - a.rating).slice(0, 6);

  return (
    <div className="space-y-12 pb-12">
      {/* Hero Section */}
      <section className="relative gradient-hero rounded-2xl p-8 md:p-12 border border-border/30 overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-1/4 w-2 h-2 bg-primary/40 rounded-full pulse-glow" />
        <div className="absolute top-1/3 right-1/3 w-1.5 h-1.5 bg-accent/40 rounded-full pulse-glow" style={{ animationDelay: "1s" }} />
        <div className="absolute bottom-1/3 right-1/5 w-1 h-1 bg-golden/40 rounded-full pulse-glow" style={{ animationDelay: "0.5s" }} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative max-w-2xl space-y-5"
        >
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Your Gateway to Mangas & Webtoons
          </motion.div>

          <h1 className="text-3xl md:text-5xl font-extrabold leading-tight">
            Discover Your Next{" "}
            <span className="gradient-neon-text">Obsession</span>
          </h1>

          <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-lg">
            Track, organize, and explore the best Japanese, Korean, and Chinese manga & webtoons.
            From isekai adventures to cultivation epics — your journey starts here.
          </p>

          <div className="flex flex-wrap gap-4 pt-2">
            <Link
              to="/search"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold gradient-neon text-white hover:opacity-90 transition-all duration-300 glow-purple"
            >
              <BookOpen className="h-4 w-4" />
              Start Exploring
            </Link>
            <Link
              to="/search"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-border/50 text-foreground hover:bg-secondary/50 hover:border-primary/30 transition-all duration-300"
            >
              Browse All Manga
            </Link>
          </div>

          <div className="flex flex-wrap gap-6 pt-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <div className="p-1.5 rounded-md bg-primary/10">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
              </div>
              <span><strong className="text-foreground">{manga.length > 0 ? `${manga.length * 1200}+` : "10,000+"}</strong> manga</span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <div className="p-1.5 rounded-md bg-accent/10">
                <Clock className="h-3.5 w-3.5 text-accent" />
              </div>
              <span><strong className="text-foreground">Updated</strong> hourly</span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <div className="p-1.5 rounded-md bg-golden/10">
                <Star className="h-3.5 w-3.5 text-golden" />
              </div>
              <span><strong className="text-foreground">Community</strong> rated</span>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Language quick filters */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex flex-wrap gap-3 justify-center"
      >
        {[
          { code: "JP", label: "Japanese", emoji: "🇯🇵", class: "lang-badge-jp" },
          { code: "KR", label: "Korean", emoji: "🇰🇷", class: "lang-badge-kr" },
          { code: "CN", label: "Chinese", emoji: "🇨🇳", class: "lang-badge-cn" },
          { code: "EN", label: "English", emoji: "🇬🇧", class: "lang-badge-en" },
        ].map((lang) => (
          <Link
            key={lang.code}
            to={`/search?lang=${lang.code}`}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 hover:scale-105 ${lang.class}`}
          >
            <span>{lang.emoji}</span>
            <span>{lang.label} Manga</span>
          </Link>
        ))}
      </motion.section>

      {isLoading ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center gap-3 text-muted-foreground">
            <Sparkles className="h-5 w-5 text-primary animate-spin" />
            <span>Loading manga...</span>
          </div>
        </div>
      ) : (
        <>
          <MangaSection title="🔥 Trending Now" manga={trending} href="/search" />
          <MangaSection title="🕐 Recently Updated" manga={recentlyUpdated} href="/search" />
          <MangaSection title="⭐ Highest Rated" manga={highestRated} href="/search" />
        </>
      )}
    </div>
  );
}