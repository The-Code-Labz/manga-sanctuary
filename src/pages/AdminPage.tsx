import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/use-admin";
import { useAdminManga } from "@/hooks/use-admin-manga";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Plus, Tag, Layers, Shield, Sparkles, Users } from "lucide-react";
import { motion } from "framer-motion";
import AdminMangaGallery from "@/components/admin/AdminMangaGallery";
import AdminMangaForm from "@/components/admin/AdminMangaForm";
import AdminEditDialog from "@/components/admin/AdminEditDialog";
import AdminGenreManager from "@/components/admin/AdminGenreManager";
import AdminTagManager from "@/components/admin/AdminTagManager";
import AdminUserRoleManager from "@/components/admin/AdminUserRoleManager";
import AdminStatsBar from "@/components/admin/AdminStatsBar";
import type { AdminManga } from "@/hooks/use-admin-manga";

type AdminTab = "manga" | "add" | "genres" | "tags" | "users";

const tabs: { id: AdminTab; label: string; icon: React.ElementType }[] = [
  { id: "manga", label: "Library", icon: BookOpen },
  { id: "add", label: "Add Manga", icon: Plus },
  { id: "genres", label: "Genres", icon: Layers },
  { id: "tags", label: "Tags", icon: Tag },
  { id: "users", label: "Users", icon: Users },
];

export default function AdminPage() {
  const { user } = useAuth();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { data: manga = [] } = useAdminManga();
  const [editingManga, setEditingManga] = useState<AdminManga | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [searchParams] = useSearchParams();

  const activeTab = (searchParams.get("tab") as AdminTab) ?? "manga";

  const handleEdit = (manga: AdminManga) => {
    setEditingManga(manga);
    setEditDialogOpen(true);
  };

  if (adminLoading) {
    return (
      <div className="py-20 text-center">
        <Sparkles className="h-6 w-6 text-primary animate-spin mx-auto mb-3" />
        <p className="text-muted-foreground">Checking permissions...</p>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="py-20 text-center space-y-3">
        <Shield className="h-10 w-10 text-destructive/30 mx-auto" />
        <p className="text-muted-foreground">Access denied. Admin privileges required.</p>
        <Link to="/" className="text-primary text-sm hover:underline">Go home</Link>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-12"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 gradient-neon rounded-full" />
            <div>
              <h1 className="text-2xl font-extrabold leading-none">Admin Dashboard</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Manage your manga library</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-golden/10 border border-golden/20 glow-golden">
          <Shield className="h-3.5 w-3.5 text-golden" />
          <span className="text-xs font-bold text-golden">Admin</span>
        </div>
      </div>

      {/* Stats bar */}
      <AdminStatsBar manga={manga} />

      {/* Tab nav — real links so they can be right-clicked */}
      <div className="flex flex-wrap gap-1 p-1.5 rounded-xl bg-secondary/50 border border-border/30 w-fit">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              to={`/admin?tab=${tab.id}`}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                isActive
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "manga" && (
          <AdminMangaGallery onEdit={handleEdit} />
        )}

        {activeTab === "add" && (
          <div className="max-w-2xl">
            <div className="mb-5">
              <h2 className="text-lg font-bold">Add New Manga</h2>
              <p className="text-xs text-muted-foreground mt-1">Fill in the details or use AI to auto-generate metadata and covers.</p>
            </div>
            <div className="p-6 rounded-xl bg-card/50 border border-border/30 anime-card">
              <AdminMangaForm />
            </div>
          </div>
        )}

        {activeTab === "genres" && (
          <div>
            <div className="mb-5">
              <h2 className="text-lg font-bold">Manage Genres</h2>
              <p className="text-xs text-muted-foreground mt-1">Add or remove genre categories for manga.</p>
            </div>
            <AdminGenreManager />
          </div>
        )}

        {activeTab === "tags" && (
          <div>
            <div className="mb-5">
              <h2 className="text-lg font-bold">Manage Tags</h2>
              <p className="text-xs text-muted-foreground mt-1">Add or remove tags that describe manga characteristics.</p>
            </div>
            <AdminTagManager />
          </div>
        )}

        {activeTab === "users" && (
          <div>
            <div className="mb-5">
              <h2 className="text-lg font-bold">Manage User Roles</h2>
              <p className="text-xs text-muted-foreground mt-1">Grant or revoke admin privileges for users.</p>
            </div>
            <AdminUserRoleManager />
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <AdminEditDialog
        manga={editingManga}
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditingManga(null);
        }}
      />
    </motion.div>
  );
}