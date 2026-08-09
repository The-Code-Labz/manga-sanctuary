import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Copy, Check, FileText } from "lucide-react";
import MarkdownLite from "./MarkdownLite";
import { buildApiDocsMarkdown } from "@/lib/api-docs-content";

export default function ApiDocsPage() {
  const [copied, setCopied] = useState(false);
  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manga-sanctuary-manga-api`;
  const markdown = buildApiDocsMarkdown(baseUrl);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      toast.success("Copied API docs as Markdown");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't access the clipboard");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Full reference for the public API — hand this to an agent verbatim.
        </p>
        <Button size="sm" variant="outline" onClick={copyMarkdown} className="gap-1.5">
          {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy as Markdown"}
        </Button>
      </div>
      <div className="p-6 rounded-xl bg-card/50 border border-border/30 anime-card">
        <MarkdownLite content={markdown} />
      </div>
    </div>
  );
}
