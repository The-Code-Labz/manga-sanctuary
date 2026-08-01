import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGenres, useTags, type MangaType } from "@/hooks/use-manga";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Plus } from "lucide-react";
import CoverSearchPicker from "./CoverSearchPicker";
import AiCoverGenerateButton from "./AiCoverGenerateButton";
import AiMetadataButton from "./AiMetadataButton";
import type { ExtractedMetadata } from "./MetadataPreviewCard";
import type { AdminManga } from "@/hooks/use-admin-manga";

interface AdminMangaFormProps {
  manga?: AdminManga | null;
  onSuccess?: () => void;
}

const mangaTypeOptions: MangaType[] = ["Manga", "Webtoon"];

export default function AdminMangaForm({ manga, onSuccess }: AdminMangaFormProps) {
  const isEditing = !!manga;
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("EN");
  const [status, setStatus] = useState("ongoing");
  const [mangaType, setMangaType] = useState<MangaType | "">("");
  const [coverUrl, setCoverUrl] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const { data: genres = [] } = useGenres();
  const { data: tags = [] } = useTags();
  const { user } = useAuth();
  const qc = useQueryClient();

  const loadedMangaId = useRef<string | null>(null);

  useEffect(() => {
    const newId = manga?.id ?? null;
    if (newId === loadedMangaId.current) return;
    loadedMangaId.current = newId;

    if (manga) {
      setTitle(manga.title);
      setAuthor(manga.author_name);
      setDescription(manga.description ?? "");
      setLanguage(manga.language);
      setStatus(manga.status);
      setMangaType(manga.manga_type ?? "");
      setCoverUrl(manga.cover_url ?? "");
      setSelectedGenres(manga.genres.map((g) => g.id));
      setSelectedTags(manga.tags.map((t) => t.id));
    } else {
      setTitle(""); setAuthor(""); setDescription(""); setLanguage("EN");
      setStatus("ongoing"); setMangaType(""); setCoverUrl("");
      setSelectedGenres([]); setSelectedTags([]);
    }
  }, [manga]);

  const handleAiApply = (metadata: ExtractedMetadata) => {
    if (metadata.title) setTitle(metadata.title);
    if (metadata.author) setAuthor(metadata.author);
    if (metadata.description) setDescription(metadata.description);
    if (metadata.language && ["JP", "CN", "KR", "EN"].includes(metadata.language)) {
      setLanguage(metadata.language);
    }
    if (metadata.status && ["ongoing", "completed", "hiatus"].includes(metadata.status)) {
      setStatus(metadata.status);
    }
    if (metadata.manga_type === "Manga" || metadata.manga_type === "Webtoon") {
      setMangaType(metadata.manga_type);
    }

    // Match genres by name
    if (metadata.genres?.length) {
      const gNames = metadata.genres.map((g) => g.toLowerCase());
      setSelectedGenres(
        genres.filter((g: any) => gNames.includes(g.name.toLowerCase())).map((g: any) => g.id)
      );
    }

    // Match tags by name
    if (metadata.tags?.length) {
      const tNames = metadata.tags.map((t) => t.toLowerCase());
      setSelectedTags(
        tags.filter((t: any) => tNames.includes(t.name.toLowerCase())).map((t: any) => t.id)
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !author) { toast.error("Title and author required"); return; }
    if (!mangaType) { toast.error("Type is required"); return; }
    setSubmitting(true);

    // Upsert author
    let authorId: string;
    const { data: existingAuthor } = await supabase.from("authors").select("id").eq("name", author).maybeSingle();
    if (existingAuthor) {
      authorId = existingAuthor.id;
    } else {
      const { data: newAuthor, error } = await supabase.from("authors").insert({ name: author }).select("id").single();
      if (error) { toast.error(error.message); setSubmitting(false); return; }
      authorId = newAuthor.id;
    }

    if (isEditing && manga) {
      const { error: mangaErr } = await supabase
        .from("manga")
        .update({
          title,
          description,
          author_id: authorId,
          language,
          status,
          manga_type: mangaType,
          cover_url: coverUrl || null,
        } as any)
        .eq("id", manga.id);
      if (mangaErr) { toast.error(mangaErr.message); setSubmitting(false); return; }

      await supabase.from("manga_genres").delete().eq("manga_id", manga.id);
      if (selectedGenres.length) {
        await supabase.from("manga_genres").insert(selectedGenres.map((gid) => ({ manga_id: manga.id, genre_id: gid })));
      }
      await supabase.from("manga_tags").delete().eq("manga_id", manga.id);
      if (selectedTags.length) {
        await supabase.from("manga_tags").insert(selectedTags.map((tid) => ({ manga_id: manga.id, tag_id: tid })));
      }

      toast.success("Manga updated!");
    } else {
      const { data: newManga, error: mangaErr } = await supabase
        .from("manga")
        .insert({
          title,
          description,
          author_id: authorId,
          language,
          status,
          manga_type: mangaType,
          cover_url: coverUrl || null,
          is_approved: true,
          submitted_by: user!.id,
        } as any)
        .select("id")
        .single();
      if (mangaErr) { toast.error(mangaErr.message); setSubmitting(false); return; }

      if (selectedGenres.length) {
        await supabase.from("manga_genres").insert(selectedGenres.map((gid) => ({ manga_id: newManga.id, genre_id: gid })));
      }
      if (selectedTags.length) {
        await supabase.from("manga_tags").insert(selectedTags.map((tid) => ({ manga_id: newManga.id, tag_id: tid })));
      }

      toast.success("Manga added!");
      loadedMangaId.current = null;
      setTitle(""); setAuthor(""); setDescription(""); setCoverUrl("");
      setMangaType(""); setSelectedGenres([]); setSelectedTags([]);
    }

    qc.invalidateQueries({ queryKey: ["admin-manga"] });
    qc.invalidateQueries({ queryKey: ["manga"] });
    qc.invalidateQueries({ queryKey: ["manga", manga?.id] });
    setSubmitting(false);
    onSuccess?.();
  };

  const toggle = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Title */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Title *</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Manga title"
          className="bg-card border-border/50 focus:border-primary/50"
          required
        />
        <AiMetadataButton title={title} onApply={handleAiApply} />
      </div>

      {/* Author */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Author *</label>
        <Input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Author name"
          className="bg-card border-border/50 focus:border-primary/50"
          required
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="bg-card border-border/50 focus:border-primary/50 min-h-[100px]"
        />
      </div>

      {/* Cover */}
      <div className="space-y-3">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Cover Art</label>
        {coverUrl && (
          <div className="flex gap-4 items-start">
            <div className="relative group shrink-0">
              <img
                src={coverUrl}
                alt="Cover"
                className="w-24 h-32 rounded-lg border border-border/30 object-cover shadow-lg shadow-primary/5"
              />
              <div className="absolute inset-0 rounded-lg border border-primary/20 group-hover:border-primary/40 transition-colors" />
            </div>
            <div className="flex-1 space-y-2">
              <Input
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="Cover URL"
                className="bg-card border-border/50 focus:border-primary/50 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">Paste a URL directly, search below, or generate with AI.</p>
            </div>
          </div>
        )}
        {!coverUrl && (
          <Input
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
            placeholder="Paste a cover URL, search, or generate with AI"
            className="bg-card border-border/50 focus:border-primary/50"
          />
        )}

        {/* AI Cover Generation */}
        <AiCoverGenerateButton
          title={title}
          description={description}
          currentCover={coverUrl}
          onCoverGenerated={(url) => setCoverUrl(url)}
        />

        {/* Cover Search */}
        <CoverSearchPicker
          mangaTitle={title}
          currentCover={coverUrl}
          onSelect={(url) => setCoverUrl(url)}
        />
      </div>

      {/* Manga Type */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Type *</label>
        <div className="flex gap-1.5">
          {mangaTypeOptions.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMangaType(mangaType === t ? "" : t)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all duration-300 ${
                mangaType === t
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

      {/* Language + Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Language</label>
          <div className="flex gap-1.5">
            {["EN", "JP", "CN", "KR"].map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLanguage(l)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all duration-300 ${
                  language === l
                    ? "border-primary/50 text-primary bg-primary/10"
                    : "border-border/50 text-muted-foreground hover:border-primary/30"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</label>
          <div className="flex gap-1.5">
            {["ongoing", "completed", "hiatus"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium capitalize transition-all duration-300 ${
                  status === s
                    ? "border-accent/50 text-accent bg-accent/10"
                    : "border-border/50 text-muted-foreground hover:border-accent/30"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Genres */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Genres</label>
        <div className="flex flex-wrap gap-1.5">
          {genres.map((g: any) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelectedGenres(toggle(selectedGenres, g.id))}
              className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all duration-300 ${
                selectedGenres.includes(g.id)
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
      <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tags</label>
        <div className="flex flex-wrap gap-1.5 max-h-[200px] overflow-y-auto scrollbar-thin pr-1">
          {tags.map((t: any) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTags(toggle(selectedTags, t.id))}
              className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all duration-300 ${
                selectedTags.includes(t.id)
                  ? "border-accent/50 text-accent bg-accent/10"
                  : "border-border/50 text-muted-foreground hover:border-accent/30"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <Button
        type="submit"
        className="w-full gap-2 gradient-neon border-0 text-white font-semibold glow-purple hover:opacity-90"
        disabled={submitting}
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isEditing ? (
          <Save className="h-4 w-4" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        {submitting ? "Saving..." : isEditing ? "Save Changes" : "Add Manga"}
      </Button>
    </form>
  );
}