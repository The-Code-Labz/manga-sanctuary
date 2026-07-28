import { useState } from "react";
import { useGenres } from "@/hooks/use-manga";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

export default function AdminGenreManager() {
  const { data: genres = [] } = useGenres();
  const [name, setName] = useState("");
  const qc = useQueryClient();

  const add = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from("genres").insert({ name: name.trim() });
    if (error) { toast.error(error.message); return; }
    setName("");
    toast.success("Genre added");
    qc.invalidateQueries({ queryKey: ["genres"] });
  };

  const remove = async (id: string, gName: string) => {
    if (!confirm(`Delete genre "${gName}"?`)) return;
    await supabase.from("novel_genres").delete().eq("genre_id", id);
    const { error } = await supabase.from("genres").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Genre deleted");
    qc.invalidateQueries({ queryKey: ["genres"] });
  };

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New genre name"
          className="bg-card border-border/50 focus:border-primary/50"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
        />
        <Button onClick={add} className="gap-1.5 gradient-neon border-0 text-white shrink-0">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      <div className="space-y-1">
        {genres.map((g: any) => (
          <div key={g.id} className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-card border border-border/20 hover:border-primary/20 transition-colors">
            <span className="text-sm font-medium">{g.name}</span>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => remove(g.id, g.name)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {genres.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No genres yet.</p>
        )}
      </div>
    </div>
  );
}