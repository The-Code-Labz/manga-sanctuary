import { useState, useMemo } from "react";
import { useAdminManga, type AdminManga } from "@/hooks/use-admin-manga";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Trash2, Edit, CheckCircle, XCircle, Eye, BookOpen, Loader2, Globe, SlidersHorizontal, X } from "lucide-react";
import { Link } from "react-router-dom";
import MangaTypeBadge from "@/components/manga/MangaTypeBadge";
import { motion, AnimatePresence } from "framer-motion";

interface AdminMangaGalleryProps {
  onEdit: (manga: AdminManga) => void;
}

const langClass: Record<string, string> = {
  JP: "lang-badge-jp",
  CN: "lang-badge-cn",
  KR: "lang-badge-kr",
  EN: "lang-badge-en",
};

export default function AdminMangaGallery({ onEdit }: AdminMangaGalleryProps) {
  const { data: manga = [], isLoading } = useAdminManga();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "approved" | "pending">("all");
  const [langFilter, setLangFilter] = useState<string>("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const qc = useQueryClient();

  const filtered = useMemo(() => {
    return manga.filter((n) => {
      if (search && !n.title.toLowerCase().includes(search.toLowerCase()) && !n.author_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === "approved" && !n.is_approved) return false;
      if (filter === "pending" && n.is_approved) return false;
      if (langFilter && n.language !== langFilter) return false;
      return true;
    });
  }, [manga, search, filter, langFilter]);

  const handleToggleApproval = async (id: string, currentlyApproved: boolean) => {
    const { error } = await supabase.from("manga").update({ is_approved: !currentlyApproved }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(currentlyApproved ? "Manga hidden" : "Manga published!");
    qc.invalidateQueries({ queryKey: ["admin-manga"] });
    qc.invalidateQueries({ queryKey: ["manga"] });
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    await supabase.from("manga_genres").delete().eq("manga_id", id);
    await supabase.from("manga_tags").delete().eq("manga_id", id);
    await supabase.from("chapters").delete().eq("manga_id", id);
    await supabase.from("reviews").delete().eq("manga_id", id);
    await supabase.from("ratings").delete().eq("manga_id", id);
    await supabase.from("reading_progress").delete().eq("manga_id", id);
    await supabase.from("list_items").delete().eq("manga_id", id);
    const { error } = await supabase.from("manga").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Manga deleted");
    qc.invalidateQueries({ queryKey: ["admin-manga"] });
    qc.invalidateQueries({ queryKey: ["manga"] });
  };

  if (isLoading) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="h-6 w-6 text-primary animate-spin mx-auto mb-3" />
        <p className="text-muted-foreground text-sm">Loading manga...</p>
      </div>
    );
  }

  const hasFilters = filter !== "all" || langFilter;

  return (
    <div className="space-y-5">
      {/* Search + filter bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search manga or authors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card border-border/50 focus:border-primary/50"
          />
        </div>
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-300 ${
            filtersOpen || hasFilters
              ? "border-primary/50 text-primary bg-primary/5"
              : "border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/30"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {hasFilters && (
            <span className="w-4 h-4 rounded-full gradient-neon text-white text-[9px] flex items-center justify-center font-bold">
              {(filter !== "all" ? 1 : 0) + (langFilter ? 1 : 0)}
            </span>
          )}
        </button>
      </div>

      {/* Filter panel */}
      <AnimatePresence>
        {filtersOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-xl border border-border/30 bg-card/50 space-y-4">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Status</p>
                <div className="flex gap-1.5">
                  {(["all", "approved", "pending"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium capitalize transition-all duration-300 ${
                        filter === f
                          ? "border-primary/50 text-primary bg-primary/10"
                          : "border-border/50 text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Language</p>
                <div className="flex gap-1.5">
                  {["JP", "CN", "KR", "EN"].map((l) => (
                    <button
                      key={l}
                      onClick={() => setLangFilter(langFilter === l ? "" : l)}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all duration-300 ${
                        langFilter === l
                          ? "border-primary/50 text-primary bg-primary/10"
                          : "border-border/50 text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {l === "JP" ? "🇯🇵" : l === "KR" ? "🇰🇷" : l === "CN" ? "🇨🇳" : "🇬🇧"} {l}
                    </button>
                  ))}
                </div>
              </div>
              {hasFilters && (
                <button
                  onClick={() => { setFilter("all"); setLangFilter(""); }}
                  className="text-xs text-destructive flex items-center gap-1.5 hover:underline font-medium"
                >
                  <X className="h-3 w-3" /> Clear filters
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-xs text-muted-foreground">
        Showing <span className="text-primary font-semibold">{filtered.length}</span> of <span className="font-semibold">{manga.length}</span> manga
      </p>

      {/* Gallery grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        <AnimatePresence>
          {filtered.map((manga, i) => (
            <motion.div
              key={manga.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ delay: i * 0.03, duration: 0.3 }}
            >
              <AdminMangaCard
                novel={manga}
                onEdit={onEdit}
                onToggleApproval={handleToggleApproval}
                onDelete={handleDelete}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20">
          <BookOpen className="h-10 w-10 text-primary/10 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No manga match your filters.</p>
        </div>
      )}
    </div>
  );
}

function AdminMangaCard({
  manga,
  onEdit,
  onToggleApproval,
  onDelete,
}: {
  manga: AdminManga;
  onEdit: (n: AdminManga) => void;
  onToggleApproval: (id: string, approved: boolean) => void;
  onDelete: (id: string, title: string) => void;
}) {
  return (
    <div className="group relative flex flex-col rounded-xl overflow-hidden bg-card border border-border/50 hover:border-primary/30 transition-all duration-300 anime-card">
      {/* Cover */}
      <div className="relative aspect-[3/4] overflow-hidden">
        {manga.cover_url ? (
          <img
            src={manga.cover_url}
            alt={manga.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
            <BookOpen className="h-8 w-8 text-primary/20" />
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent opacity-70 group-hover:opacity-90 transition-opacity duration-300" />

        {/* Approval badge */}
        <div className="absolute top-2 left-2">
          <button
            onClick={() => onToggleApproval(manga.id, manga.is_approved)}
            className={`flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md backdrop-blur-sm transition-all duration-300 ${
              manga.is_approved
                ? "bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30"
                : "bg-golden/20 text-golden border border-golden/30 hover:bg-golden/30"
            }`}
          >
            {manga.is_approved ? <CheckCircle className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
            {manga.is_approved ? "Live" : "Draft"}
          </button>
        </div>

        {/* Language badge */}
        <div className="absolute top-2 right-2">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md backdrop-blur-sm ${langClass[manga.language] ?? ""}`}>
            {manga.language}
          </span>
        </div>

        {/* Chapter count */}
        <div className="absolute bottom-2 right-2">
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-background/60 backdrop-blur-sm text-foreground/70 flex items-center gap-0.5">
            <BookOpen className="h-2 w-2" />
            {manga.chapter_count}
          </span>
        </div>

        {/* Hover action overlay */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <Link to={`/manga/${manga.id}`}>
            <button className="w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm border border-border/50 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-all duration-200">
              <Eye className="h-3.5 w-3.5" />
            </button>
          </Link>
          <button
            onClick={() => onEdit(manga)}
            className="w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm border border-border/50 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-all duration-200"
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(manga.id, manga.title)}
            className="w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm border border-destructive/30 flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-all duration-200"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-2.5 space-y-1.5">
        <div className="flex items-start justify-between gap-1">
          <h3 className="text-xs font-semibold line-clamp-2 leading-tight flex-1">{manga.title}</h3>
        </div>
        <p className="text-[10px] text-muted-foreground truncate">{manga.author_name}</p>
        <div className="flex items-center gap-1 flex-wrap">
          <MangaTypeBadge type={manga.manga_type} size="sm" />
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md capitalize ${
            manga.status === "ongoing"
              ? "bg-primary/10 text-primary border border-primary/20"
              : "bg-secondary text-secondary-foreground border border-border/30"
          }`}>
            {manga.status}
          </span>
        </div>
      </div>
    </div>
  );
}