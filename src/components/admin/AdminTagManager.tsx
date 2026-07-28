import { useState } from "react";
import { useTags } from "@/hooks/use-manga";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import AdminTagSeeder from "./AdminTagSeeder";

export default function AdminTagManager() {
  const { data: tags = [] } = useTags();
  const [name, setName] = useState("");
  const qc = useQueryClient();

  const add = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from("tags").insert({ name: name.trim() });
    if (error) { toast.error(error.message); return; }
    setName("");
    toast.success("Tag added");
    qc.invalidateQueries({ queryKey: ["tags"] });
  };

  const remove = async (id: string, tName: string) => {
    if (!confirm(`Delete tag "${tName}"?`)) return;
    await supabase.from("manga_tags").delete().eq("tag_id", id);
    const { error } = await supabase.from("tags").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Tag deleted");
    qc.invalidateQueries({ queryKey: ["tags"] });
  };

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Seeder */}
      <AdminTagSeeder />

      {/* Manual add */}
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New tag name"
          className="bg-card border-border/50 focus:border-primary/50"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
        />
        <Button onClick={add} className="gap-1.5 gradient-neon border-0 text-white shrink-0">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {/* Tag count */}
      <p className="text-xs text-muted-foreground">
        <span className="text-primary font-semibold">{tags.length}</span> tags in database
      </p>

      {/* Tag list */}
      <div className="flex flex-wrap gap-1.5 max-h-[400px] overflow-y-auto scrollbar-thin pr-1">
        {tags.map((t: any) => (
          <div key={t.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border/20 hover:border-accent/20 transition-colors group">
            <span className="text-xs font-medium">{t.name}</span>
            <button onClick={() => remove(t.id, t.name)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {tags.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8 w-full">No tags yet. Seed from MangaUpdates above!</p>
        )}
      </div>
    </div>
  );
}