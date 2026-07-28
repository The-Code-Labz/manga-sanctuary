import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link2 } from "lucide-react";

interface ChapterBulkLinkEditorProps {
  onApply: (baseUrl: string) => void;
}

export default function ChapterBulkLinkEditor({ onApply }: ChapterBulkLinkEditorProps) {
  const [baseUrl, setBaseUrl] = useState("");

  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1 space-y-1">
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          Bulk set links — use {"{n}"} for chapter number
        </label>
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://example.com/manga/chapter-{n}"
          className="bg-card border-border/50 focus:border-primary/50 text-xs"
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 border-border/50 hover:border-primary/30 shrink-0"
        onClick={() => onApply(baseUrl)}
        disabled={!baseUrl.trim()}
      >
        <Link2 className="h-3.5 w-3.5" /> Apply to All
      </Button>
    </div>
  );
}