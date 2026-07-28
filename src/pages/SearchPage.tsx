import { useState, useMemo } from "react";
import { useMangaList, useGenres, useTags, type MangaType } from "@/hooks/use-manga";
import MangaCard from "@/components/manga/MangaCard";
import { Input } from "@/components/ui/input";
import { Search, SlidersHorizontal, X, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "react-router-dom";

const languages = ["JP", "CN", "KR", "EN"];
const mangaTypes: MangaType[] = ["Manga", "Webtoon", "Manhwa", "Manhua"];
type MangaStatus = "ongoing" | "completed" | "hiatus";

export default function SearchPage() {
  const { data: manga = [] } = useMangaList();
  const { data: genreList = [] } = useGenres();
  const { data: tagList = [] } = useTags();
  const [searchParams] = useSearchParams();

  const initialLang = searchParams.get("lang");
  const initialType = searchParams.get("type") as MangaType | null;

  const [query, setQuery] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(initialLang ? [initialLang] : []);
  const [selectedType, setSelectedType] = useState<MangaType | "">(initialType ?? "");
  const [selectedStatus, setSelectedStatus] = useState<MangaStatus | "">("");
  const [filtersOpen, setFiltersOpen] = useState(!!initialLang || !!initialType);

  const toggle = <T,>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];

  const results = useMemo(() => {
    return manga.filter((n) => {
      if (query && !n.title.toLowerCase().includes(query.toLowerCase()) && !n.author_name.toLowerCase().includes(query.toLowerCase())) return false;
      if (selectedGenres.length && !selectedGenres.some((g) => n.genres.includes(g))) return false;
      if (selectedTags.length && !selectedTags.some((t) => n.tags.includes(t))) return false;
      if (selectedLangs.length && !selectedLangs.includes(n.language)) return false;
      if (selectedType && n.manga_type !== selectedType) return false;
      if (selectedStatus && n.status !== selectedStatus) return false;
      return true;
    });
  }, [manga, query, selectedGenres, selectedTags, selectedLangs, selectedType, selectedStatus]);

  const hasFilters = selectedGenres.length || selectedTags.length || selectedLangs.length || selectedType || selectedStatus;

  const activeFilterCount =
    (selectedGenres.length || 0) +
    (selectedTags.length || 0) +
    (selectedLangs.length || 0) +
    (selectedType ? 1 : 0) +
    (selectedStatus ? 1 : 0);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <div className="w-1 h-7 gradient-neon rounded-full" />
        <h1 className="text-2xl font-extrabold">Explore Manga</h1>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title or author..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 bg-card border-border/50 focus:border-primary/50 transition-colors"
          />
        </div>
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-300 ${
            filtersOpen || hasFilters
              ? "border-primary/50 text-primary bg-primary/5 glow-purple"
              : "border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/30"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {hasFilters ? (
            <span className="ml-1 w-5 h-5 rounded-full gradient-neon text-white text-[10px] flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
      </div>

      <AnimatePresence>
        {filtersOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden space-y-5 rounded-xl border border-border/30 p-5 bg-card/50 backdrop-blur-sm"
          >
            {/* Type */}
            <div>
              <h3 className="text-xs font-bold text-muted-foreground mb-2.5 uppercase tracking-widest">Type</h3>
              <div className="flex flex-wrap gap-2">
                {mangaTypes.map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedType(selectedType === t ? "" : t)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all duration-300 ${
                      selectedType === t
                        ? t === "Manga"
                          ? "border-violet-500/50 text-violet-400 bg-violet-500/10"
                          : "border-cyan-500/50 text-cyan-400 bg-cyan-500/10"
                        : "border-border/50 text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {t === "Manga" ? "📖" : "🌐"} {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div>
              <h3 className="text-xs font-bold text-muted-foreground mb-2.5 uppercase tracking-widest">Language</h3>
              <div className="flex flex-wrap gap-2">
                {languages.map((l) => (
                  <button
                    key={l}
                    onClick={() => setSelectedLangs(toggle(selectedLangs, l))}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all duration-300 ${
                      selectedLangs.includes(l)
                        ? "border-primary/50 text-primary bg-primary/10"
                        : "border-border/50 text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {l === "JP" ? "🇯🇵" : l === "KR" ? "🇰🇷" : l === "CN" ? "🇨🇳" : "🇬🇧"} {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <h3 className="text-xs font-bold text-muted-foreground mb-2.5 uppercase tracking-widest">Status</h3>
              <div className="flex gap-2">
                {(["ongoing", "completed", "hiatus"] as MangaStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedStatus(selectedStatus === s ? "" : s)}
                    className={`text-xs px-3 py-1.5 rounded-lg border capitalize font-medium transition-all duration-300 ${
                      selectedStatus === s
                        ? "border-primary/50 text-primary bg-primary/10"
                        : "border-border/50 text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Genres */}
            <div>
              <h3 className="text-xs font-bold text-muted-foreground mb-2.5 uppercase tracking-widest">Genres</h3>
              <div className="flex flex-wrap gap-1.5">
                {genreList.map((g: any) => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGenres(toggle(selectedGenres, g.name))}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all duration-300 ${
                      selectedGenres.includes(g.name)
                        ? "border-primary/50 text-primary bg-primary/10"
                        : "border-border/50 text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <h3 className="text-xs font-bold text-muted-foreground mb-2.5 uppercase tracking-widest">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {tagList.map((t: any) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTags(toggle(selectedTags, t.name))}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all duration-300 ${
                      selectedTags.includes(t.name)
                        ? "border-accent/50 text-accent bg-accent/10"
                        : "border-border/50 text-muted-foreground hover:border-accent/30"
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            {hasFilters && (
              <button
                onClick={() => {
                  setSelectedGenres([]);
                  setSelectedTags([]);
                  setSelectedLangs([]);
                  setSelectedType("");
                  setSelectedStatus("");
                }}
                className="text-xs text-destructive flex items-center gap-1.5 hover:underline font-medium"
              >
                <X className="h-3 w-3" /> Clear all filters
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-sm text-muted-foreground">
        <span className="text-primary font-semibold">{results.length}</span> manga found
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {results.map((manga, i) => (
          <motion.div
            key={manga.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.3 }}
          >
            <MangaCard manga={manga} />
          </motion.div>
        ))}
      </div>

      {results.length === 0 && (
        <div className="text-center py-16">
          <Sparkles className="h-8 w-8 text-primary/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No manga match your filters.</p>
        </div>
      )}
    </div>
  );
}