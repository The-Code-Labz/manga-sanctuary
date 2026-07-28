import { useParams, Link, useNavigate } from "react-router-dom";
import { useManga, useChapters, useReviews } from "@/hooks/use-manga";
import StarRating from "@/components/manga/StarRating";
import MangaTypeBadge from "@/components/manga/MangaTypeBadge";
import ChapterList from "@/components/manga/ChapterList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Users, ArrowLeft, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const langClass: Record<string, string> = {
  JP: "lang-badge-jp",
  CN: "lang-badge-cn",
  KR: "lang-badge-kr",
  EN: "lang-badge-en",
};

export default function MangaDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: manga, isLoading } = useManga(id ?? "");
  const { data: chapters = [] } = useChapters(id ?? "");
  const { data: reviews = [] } = useReviews(id ?? "");

  if (isLoading) {
    return (
      <div className="py-20 text-center">
        <Sparkles className="h-6 w-6 text-primary animate-spin mx-auto mb-3" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!manga) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Manga not found.</p>
        <Link to="/" className="text-primary text-sm mt-2 inline-block hover:underline">Go home</Link>
      </div>
    );
  }

  const firstChapter = chapters[0];

  return (
    <div className="pb-12 space-y-8">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors duration-300">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row gap-8">
        {/* Cover */}
        <div className="shrink-0 w-52 md:w-60 mx-auto md:mx-0">
          <div className="relative group">
            <img
              src={manga.cover_url ?? "/placeholder.svg"}
              alt={manga.title}
              className="w-full rounded-xl border border-border/50 shadow-2xl shadow-primary/5 transition-transform duration-500 group-hover:scale-[1.02]"
            />
            <div className="absolute inset-0 rounded-xl border border-primary/10 group-hover:border-primary/30 transition-colors duration-300" />
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${langClass[manga.language] ?? ""}`}>{manga.language}</span>
              <MangaTypeBadge type={manga.manga_type} size="md" />
              <Badge
                variant={manga.status === "ongoing" ? "default" : "secondary"}
                className={`text-xs capitalize ${manga.status === "ongoing" ? "gradient-neon border-0 text-white" : ""}`}
              >
                {manga.status}
              </Badge>
            </div>
            <h1 className="text-2xl md:text-4xl font-extrabold leading-tight">{manga.title}</h1>
            {manga.alt_titles.length > 0 && (
              <p className="text-sm text-muted-foreground mt-1 font-jp">{manga.alt_titles.join(" / ")}</p>
            )}
            <p className="text-sm text-muted-foreground mt-2">
              by <span className="text-primary font-medium">{manga.author_name}</span>
              {manga.artist_name && manga.artist_name !== manga.author_name && (
                <> &#183; art by <span className="text-primary font-medium">{manga.artist_name}</span></>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-sm">
            <div className="flex items-center gap-2">
              <StarRating rating={manga.rating} size="sm" />
              <span className="text-golden font-bold">{manga.rating || "—"}</span>
              <span className="text-muted-foreground">({manga.rating_count})</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-4 w-4 text-primary/60" />
              <span>{manga.reader_count} readers</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <BookOpen className="h-4 w-4 text-accent/60" />
              <span>{manga.chapter_count} chapters</span>
            </div>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{manga.description}</p>

          <div className="flex flex-wrap gap-1.5">
            {manga.genres.map((g) => (
              <span key={g} className="text-xs px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-medium border border-primary/20">{g}</span>
            ))}
            {manga.tags.map((t) => (
              <span key={t} className="text-xs px-2.5 py-1 rounded-lg bg-secondary text-secondary-foreground border border-border/50">{t}</span>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <Button className="gap-2 gradient-neon border-0 text-white glow-purple hover:opacity-90">
              <Plus className="h-4 w-4" /> Add to Library
            </Button>
            {firstChapter && (
              <Button
                variant="outline"
                className="gap-2 border-border/50 hover:border-primary/30 hover:bg-primary/5"
                onClick={() =>
                  firstChapter.external_url && !firstChapter.pages?.length
                    ? window.open(firstChapter.external_url!, "_blank", "noopener,noreferrer")
                    : navigate(`/manga/${id}/chapter/${firstChapter.id}`)
                }
              >
                <BookOpen className="h-4 w-4" /> Start Reading
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      <Tabs defaultValue="chapters" className="mt-8">
        <TabsList className="bg-secondary/50 border border-border/30">
          <TabsTrigger value="chapters" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            Chapters ({chapters.length})
          </TabsTrigger>
          <TabsTrigger value="reviews" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            Reviews ({reviews.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chapters" className="mt-4">
          <ChapterList chapters={chapters} mangaId={id ?? ""} />
        </TabsContent>

        <TabsContent value="reviews" className="mt-4 space-y-4">
          {reviews.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">No reviews yet. Be the first to share your thoughts!</p>
          )}
          {reviews.map((review: any) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-5 rounded-xl bg-card border border-border/50 space-y-3 anime-card"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full gradient-neon flex items-center justify-center text-xs font-bold text-white">
                    {(review.profiles?.username ?? "U")[0].toUpperCase()}
                  </div>
                  <span className="text-sm font-semibold">{review.profiles?.username ?? "Anonymous"}</span>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(review.created_at).toLocaleDateString()}</span>
              </div>
              <StarRating rating={review.rating} size="sm" />
              <p className="text-sm text-muted-foreground leading-relaxed">{review.review_text}</p>
            </motion.div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}