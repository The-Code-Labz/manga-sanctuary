import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Edit, Check, X, ExternalLink, Download, FileCheck, Loader2 } from "lucide-react";

interface ChapterListItemProps {
  number: number;
  title: string;
  url: string;
  onUpdate: (title: string, url: string) => void;
  onDelete: () => void;
  hasContent?: boolean;
  fetchingContent?: boolean;
  onFetchContent?: () => void;
}

export default function ChapterListItem({
  number, title, url, onUpdate, onDelete, hasContent, fetchingContent, onFetchContent,
}: ChapterListItemProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const [editUrl, setEditUrl] = useState(url);

  const handleSave = () => {
    onUpdate(editTitle, editUrl);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(title);
    setEditUrl(url);
    setEditing(false);
  };

  const hasLink = url && url !== "#";

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-primary/20">
        <span className="text-xs font-bold text-primary/70 w-10 shrink-0">#{number}</span>
        <Input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="bg-background border-border/50 text-xs h-8 flex-1"
          placeholder="Title"
        />
        <Input
          value={editUrl}
          onChange={(e) => setEditUrl(e.target.value)}
          className="bg-background border-border/50 text-xs h-8 flex-1"
          placeholder="URL"
        />
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-400 hover:text-green-300" onClick={handleSave}>
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={handleCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-primary/5 transition-colors group border border-transparent hover:border-border/30">
      <span className="text-xs font-bold text-primary/70 w-10 shrink-0">#{number}</span>
      <span className="text-sm flex-1 truncate">{title}</span>
      <span className={`text-[10px] truncate max-w-[200px] ${hasLink ? "text-cyan-400" : "text-muted-foreground/40"}`}>
        {hasLink ? url : "No link"}
      </span>
      {hasContent && (
        <span title="Chapter text saved — readable in-app" className="shrink-0">
          <FileCheck className="h-3.5 w-3.5 text-green-400" />
        </span>
      )}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {hasLink && onFetchContent && !hasContent && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-green-400"
            onClick={onFetchContent}
            disabled={fetchingContent}
            title="Fetch chapter text for in-app reading"
          >
            {fetchingContent ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          </Button>
        )}
        {hasLink && (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-cyan-400">
              <ExternalLink className="h-3 w-3" />
            </Button>
          </a>
        )}
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary" onClick={() => setEditing(true)}>
          <Edit className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}