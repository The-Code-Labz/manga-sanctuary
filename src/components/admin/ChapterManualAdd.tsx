import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface ChapterManualAddProps {
  nextNumber: number;
  onAdd: (chapter: { number: number; title: string; url: string }) => void;
}

export default function ChapterManualAdd({ nextNumber, onAdd }: ChapterManualAddProps) {
  const [number, setNumber] = useState(nextNumber);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  const handleAdd = () => {
    onAdd({
      number,
      title: title.trim() || `Chapter ${number}`,
      url: url.trim() || "#",
    });
    setNumber(number + 1);
    setTitle("");
    setUrl("");
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <Input
        type="number"
        value={number}
        onChange={(e) => setNumber(parseInt(e.target.value) || 1)}
        placeholder="Ch #"
        className="bg-card border-border/50 focus:border-primary/50 w-20 shrink-0"
      />
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Chapter title (optional)"
        className="bg-card border-border/50 focus:border-primary/50 flex-1"
      />
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Reading URL (optional)"
        className="bg-card border-border/50 focus:border-primary/50 flex-1"
      />
      <Button
        type="button"
        size="sm"
        className="gap-1.5 gradient-neon border-0 text-white shrink-0"
        onClick={handleAdd}
      >
        <Plus className="h-3.5 w-3.5" /> Add
      </Button>
    </div>
  );
}