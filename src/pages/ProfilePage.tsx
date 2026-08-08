import { useAuth } from "@/contexts/AuthContext";
import { useLibraryList } from "@/hooks/use-manga";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, BookOpen, Heart, MessageSquare, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import MangaCard from "@/components/manga/MangaCard";

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="text-center py-20 space-y-4">
        <Sparkles className="h-8 w-8 text-primary/30 mx-auto mb-2" />
        <p className="text-muted-foreground">Sign in to view your profile.</p>
        <Link
          to="/auth"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold gradient-neon text-white hover:opacity-90 transition-all duration-300 glow-purple"
        >
          Sign In
        </Link>
      </div>
    );
  }

  const username = user.user_metadata?.username ?? user.email?.split("@")[0] ?? "User";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-12"
    >
      <div className="flex items-center gap-5 p-6 rounded-2xl bg-card border border-border/30 anime-card">
        <div className="w-16 h-16 rounded-full gradient-neon flex items-center justify-center glow-purple">
          <User className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold">{username}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <Tabs defaultValue="reading">
        <TabsList className="bg-secondary/50 border border-border/30">
          <TabsTrigger value="reading" className="gap-1.5 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <BookOpen className="h-3.5 w-3.5" /> Reading
          </TabsTrigger>
          <TabsTrigger value="favorites" className="gap-1.5 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <Heart className="h-3.5 w-3.5" /> Favorites
          </TabsTrigger>
          <TabsTrigger value="reviews" className="gap-1.5 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <MessageSquare className="h-3.5 w-3.5" /> Reviews
          </TabsTrigger>
        </TabsList>
        <TabsContent value="reading" className="mt-6">
          <ProfileMangaGrid listName="Reading" icon={BookOpen} emptyText="No manga being read yet." />
        </TabsContent>
        <TabsContent value="favorites" className="mt-6">
          <ProfileMangaGrid listName="Favorites" icon={Heart} emptyText="No favorites yet." />
        </TabsContent>
        <TabsContent value="reviews" className="mt-6">
          <div className="text-center py-16 space-y-3">
            <MessageSquare className="h-10 w-10 text-golden/15 mx-auto" />
            <p className="text-muted-foreground text-sm">No reviews written yet.</p>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

function ProfileMangaGrid({
  listName,
  icon: Icon,
  emptyText,
}: {
  listName: "Reading" | "Favorites";
  icon: typeof BookOpen;
  emptyText: string;
}) {
  const { data: manga = [], isLoading } = useLibraryList(listName);

  if (isLoading) {
    return (
      <div className="text-center py-16">
        <Sparkles className="h-5 w-5 text-primary animate-spin mx-auto mb-3" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (manga.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <Icon className="h-10 w-10 text-primary/15 mx-auto" />
        <p className="text-muted-foreground text-sm">{emptyText}</p>
        <Link to="/search" className="inline-flex items-center gap-2 text-xs text-primary hover:underline font-medium">
          Start exploring →
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {manga.map((m) => (
        <MangaCard key={m.id} manga={m} />
      ))}
    </div>
  );
}
