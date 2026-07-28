import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, CheckCircle, Clock, XCircle, Heart, Sparkles, Library, User } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import BrowseLibrary from "@/components/library/BrowseLibrary";

const listTabs = [
  { id: "Reading", label: "Reading", icon: BookOpen },
  { id: "Completed", label: "Completed", icon: CheckCircle },
  { id: "Plan to Read", label: "Plan to Read", icon: Clock },
  { id: "Dropped", label: "Dropped", icon: XCircle },
  { id: "Favorites", label: "Favorites", icon: Heart },
];

export default function LibraryPage() {
  const { user } = useAuth();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-12"
    >
      <div className="flex items-center gap-3">
        <div className="w-1 h-7 gradient-neon rounded-full" />
        <h1 className="text-2xl font-extrabold">Library</h1>
      </div>

      <Tabs defaultValue="browse">
        <TabsList className="bg-secondary/50 border border-border/30 h-auto gap-1 p-1.5">
          <TabsTrigger
            value="browse"
            className="gap-1.5 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
          >
            <Library className="h-3.5 w-3.5" />
            Browse Library
          </TabsTrigger>
          <TabsTrigger
            value="personal"
            className="gap-1.5 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
          >
            <User className="h-3.5 w-3.5" />
            My Lists
          </TabsTrigger>
        </TabsList>

        {/* Browse Library Tab */}
        <TabsContent value="browse" className="mt-6">
          <BrowseLibrary />
        </TabsContent>

        {/* Personal Library Tab */}
        <TabsContent value="personal" className="mt-6">
          {!user ? (
            <div className="text-center py-20 space-y-4">
              <Sparkles className="h-8 w-8 text-primary/30 mx-auto mb-2" />
              <p className="text-muted-foreground">Sign in to access your personal library.</p>
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold gradient-neon text-white hover:opacity-90 transition-all duration-300 glow-purple"
              >
                Sign In
              </Link>
            </div>
          ) : (
            <PersonalLibrary />
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

function PersonalLibrary() {
  return (
    <Tabs defaultValue="Reading">
      <TabsList className="bg-secondary/50 border border-border/30 flex-wrap h-auto gap-1 p-1.5">
        {listTabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className="gap-1.5 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {listTabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="mt-6">
          <div className="text-center py-16 space-y-3">
            <tab.icon className="h-10 w-10 text-primary/15 mx-auto" />
            <p className="text-muted-foreground text-sm">
              No manga in this list yet.
            </p>
            <Link
              to="/library"
              className="inline-flex items-center gap-2 text-xs text-primary hover:underline font-medium"
            >
              Browse manga →
            </Link>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}