import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { allGenres, allTags, languages, type Language } from "@/lib/mock-data";
import { toast } from "sonner";

export default function SubmitMangaPage() {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState<Language>("EN");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [chapters, setChapters] = useState([{ title: "", url: "" }]);

  const toggle = <T,>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Manga submitted for review! It will appear after moderation.");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <h1 className="text-2xl font-bold">Submit a Manga</h1>
      <p className="text-sm text-muted-foreground">Help grow the community by adding new manga. Submissions are reviewed before publishing.</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium">Title *</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Manga title" className="bg-card" required />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Author *</label>
          <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author name" className="bg-card" required />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Description</label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Synopsis..." className="bg-card min-h-[100px]" />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Language</label>
          <div className="flex gap-1.5">
            {languages.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLanguage(l)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  language === l ? "border-golden text-golden bg-golden/10" : "border-border text-muted-foreground"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Genres</label>
          <div className="flex flex-wrap gap-1.5">
            {allGenres.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setSelectedGenres(toggle(selectedGenres, g))}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  selectedGenres.includes(g) ? "border-golden text-golden bg-golden/10" : "border-border text-muted-foreground"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tags</label>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedTags(toggle(selectedTags, t))}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  selectedTags.includes(t) ? "border-golden text-golden bg-golden/10" : "border-border text-muted-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Chapters */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chapters (optional)</label>
          {chapters.map((ch, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder={`Ch. ${i + 1} title`}
                value={ch.title}
                onChange={(e) => {
                  const updated = [...chapters];
                  updated[i] = { ...ch, title: e.target.value };
                  setChapters(updated);
                }}
                className="bg-card flex-1"
              />
              <Input
                placeholder="URL"
                value={ch.url}
                onChange={(e) => {
                  const updated = [...chapters];
                  updated[i] = { ...ch, url: e.target.value };
                  setChapters(updated);
                }}
                className="bg-card flex-1"
              />
              {chapters.length > 1 && (
                <button type="button" onClick={() => setChapters(chapters.filter((_, j) => j !== i))} className="text-destructive p-2">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setChapters([...chapters, { title: "", url: "" }])}
            className="text-xs text-golden flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Add chapter
          </button>
        </div>

        <Button type="submit" className="w-full">Submit for Review</Button>
      </form>
    </div>
  );
}
