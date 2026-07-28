import { useState, useMemo } from "react";
import { useAdminManga, type AdminManga } from "@/hooks/use-admin-manga";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Trash2, Edit, CheckCircle, XCircle, Eye, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import MangaTypeBadge from "@/components/manga/MangaTypeBadge";

interface AdminMangaTableProps {
  onEdit: (manga: AdminManga) => void;
}

const langClass: Record<string, string> = {
  JP: "lang-badge-jp",
  CN: "lang-badge-cn",
  KR: "lang-badge-kr",
  EN: "lang-badge-en",
};

export default function AdminMangaTable({ onEdit }: AdminMangaTableProps) {
  const { data: manga = [], isLoading } = useAdminManga();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "approved" | "pending">("all");
  const qc = useQueryClient();

  const filtered = useMemo(() => {
    return manga.filter((n) => {
      if (search && !n.title.toLowerCase().includes(search.toLowerCase()) && !n.author_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === "approved" && !n.is_approved) return false;
      if (filter === "pending" && n.is_approved) return false;
      return true;
    });
  }, [manga, search, filter]);

  const handleToggleApproval = async (id: string, currentlyApproved: boolean) => {
    const { error } = await supabase.from("manga").update({ is_approved: !currentlyApproved }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(currentlyApproved ? "Manga unapproved" : "Manga approved");
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
    return <div className="py-8 text-center text-muted-foreground text-sm">Loading manga...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex flex-wrap gap-3">
        <div className="px-4 py-2.5 rounded-xl bg-card border border-border/30 flex items-center gap-2">
          <span className="text-2xl font-extrabold text-primary">{manga.length}</span>
          <span className="text-xs text-muted-foreground">Total</span>
        </div>
        <div className="px-4 py-2.5 rounded-xl bg-card border border-border/30 flex items-center gap-2">
          <span className="text-2xl font-extrabold text-green-400">{manga.filter((n) => n.is_approved).length}</span>
          <span className="text-xs text-muted-foreground">Approved</span>
        </div>
        <div className="px-4 py-2.5 rounded-xl bg-card border border-border/30 flex items-center gap-2">
          <span className="text-2xl font-extrabold text-golden">{manga.filter((n) => !n.is_approved).length}</span>
          <span className="text-xs text-muted-foreground">Pending</span>
        </div>
        <div className="px-4 py-2.5 rounded-xl bg-card border border-border/30 flex items-center gap-2">
          <span className="text-2xl font-extrabold text-violet-400">{manga.filter((n) => n.manga_type === "Manga").length}</span>
          <span className="text-xs text-muted-foreground">Mangas</span>
        </div>
        <div className="px-4 py-2.5 rounded-xl bg-card border border-border/30 flex items-center gap-2">
          <span className="text-2xl font-extrabold text-cyan-400">{manga.filter((n) => n.manga_type === "Webtoon").length}</span>
          <span className="text-xs text-muted-foreground">Webtoons</span>
        </div>
      </div>

      {/* Search & filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search manga or authors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card border-border/50 focus:border-primary/50"
          />
        </div>
        <div className="flex gap-1.5">
          {(["all", "approved", "pending"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-2 rounded-lg border font-medium capitalize transition-all duration-300 ${
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

      {/* Table */}
      <div className="rounded-xl border border-border/30 overflow-hidden bg-card/50">
        <Table>
          <TableHeader>
            <TableRow className="border-border/30 hover:bg-transparent">
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Manga</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Type</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Language</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Status</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Chapters</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Visibility</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((manga) => (
              <TableRow key={manga.id} className="border-border/20 hover:bg-primary/5 transition-colors">
                <TableCell>
                  <div className="flex items-center gap-3">
                    {manga.cover_url ? (
                      <img src={manga.cover_url} alt="" className="w-10 h-14 rounded-md object-cover border border-border/30" />
                    ) : (
                      <div className="w-10 h-14 rounded-md bg-secondary flex items-center justify-center text-muted-foreground text-[10px]">N/A</div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate max-w-[200px]">{manga.title}</p>
                      <p className="text-xs text-muted-foreground">{manga.author_name}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <MangaTypeBadge type={manga.manga_type} size="sm" />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${langClass[manga.language] ?? ""}`}>
                    {manga.language}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge
                    variant={manga.status === "ongoing" ? "default" : "secondary"}
                    className={`text-[10px] capitalize ${manga.status === "ongoing" ? "gradient-neon border-0 text-white" : ""}`}
                  >
                    {manga.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="text-sm text-muted-foreground">{manga.chapter_count}</span>
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => handleToggleApproval(manga.id, manga.is_approved)}
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md transition-all duration-300 ${
                      manga.is_approved
                        ? "bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20"
                        : "bg-golden/10 text-golden border border-golden/20 hover:bg-golden/20"
                    }`}
                  >
                    {manga.is_approved ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {manga.is_approved ? "Live" : "Pending"}
                  </button>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link to={`/manga/${manga.id}`}>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-primary">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-primary" onClick={() => onEdit(manga)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(manga.id, manga.title)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                  No manga found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}