import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Edit } from "lucide-react";
import AdminMangaForm from "./AdminMangaForm";
import AdminChapterManager from "./AdminChapterManager";
import type { AdminManga } from "@/hooks/use-admin-manga";

interface AdminEditDialogProps {
  manga: AdminManga | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AdminEditDialog({ manga, open, onOpenChange }: AdminEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[1400px] h-[92vh] max-h-[92vh] flex flex-col bg-background border-border/30 p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-lg font-extrabold">
            Edit Manga — <span className="gradient-neon-text">{manga?.title}</span>
          </DialogTitle>
        </DialogHeader>
        {manga && (
          <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
            <TabsList className="bg-secondary/50 border border-border/30 shrink-0">
              <TabsTrigger value="details" className="gap-1.5 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                <Edit className="h-3.5 w-3.5" /> Details
              </TabsTrigger>
              <TabsTrigger value="chapters" className="gap-1.5 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                <BookOpen className="h-3.5 w-3.5" /> Chapters ({manga.chapter_count})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="mt-4 flex-1 min-h-0 overflow-y-auto scrollbar-thin pr-1">
              <AdminMangaForm manga={manga} onSuccess={() => onOpenChange(false)} />
            </TabsContent>
            <TabsContent value="chapters" className="mt-4 flex-1 min-h-0 overflow-y-auto scrollbar-thin pr-1">
              <AdminChapterManager mangaId={manga.id} mangaTitle={manga.title} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}