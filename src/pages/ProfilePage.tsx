import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, BookOpen, Heart, MessageSquare, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

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
          <div className="text-center py-16 space-y-3">
            <BookOpen className="h-10 w-10 text-primary/15 mx-auto" />
            <p className="text-muted-foreground text-sm">No manga being read yet.</p>
            <Link to="/search" className="inline-flex items-center gap-2 text-xs text-primary hover:underline font-medium">
              Start exploring →
            </Link>
          </div>
        </TabsContent>
        <TabsContent value="favorites" className="mt-6">
          <div className="text-center py-16 space-y-3">
            <Heart className="h-10 w-10 text-accent/15 mx-auto" />
            <p className="text-muted-foreground text-sm">No favorites yet.</p>
          </div>
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