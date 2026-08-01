import { useState } from "react";
import { motion } from "framer-motion";
import { Check, X, ChevronDown, ChevronUp, ExternalLink, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export interface ExtractedMetadata {
  title?: string;
  alt_titles?: string[];
  author?: string;
  description?: string;
  language?: string;
  status?: string;
  manga_type?: string | null;
  genres?: string[];
  tags?: string[];
  mangaupdates_url?: string | null;
  confidence?: Record<string, number>;
  sources?: string[];
  _search_results_count?: number;
  _mangaupdates_found?: boolean;
}

interface MetadataPreviewCardProps {
  metadata: ExtractedMetadata;
  onApply: (metadata: ExtractedMetadata) => void;
  onDiscard: () => void;
}

function ConfidencePill({ score }: { score?: number }) {
  if (score === undefined) return null;
  const pct = Math.round((score ?? 0) * 100);
  const color =
    pct >= 80 ? "text-green-400 bg-green-500/10 border-green-500/20" :
    pct >= 50 ? "text-golden bg-golden/10 border-golden/20" :
    "text-destructive bg-destructive/10 border-destructive/20";
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${color}`}>
      {pct}%
    </span>
  );
}

export default function MetadataPreviewCard({ metadata, onApply, onDiscard }: MetadataPreviewCardProps) {
  const [edited, setEdited] = useState<ExtractedMetadata>({ ...metadata });
  const [showSources, setShowSources] = useState(false);
  const [showTags, setShowTags] = useState(false);

  const conf = metadata.confidence ?? {};

  const overallConfidence = Object.values(conf).length
    ? Object.values(conf).reduce((a, b) => a + b, 0) / Object.values(conf).length
    : 0;

  const overallPct = Math.round(overallConfidence * 100);
  const overallColor =
    overallPct >= 75 ? "text-green-400" :
    overallPct >= 50 ? "text-golden" :
    "text-destructive";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-primary/20 bg-card/80 backdrop-blur-sm overflow-hidden anime-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-primary/5">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full gradient-neon" />
          <span className="text-sm font-bold">Metadata Preview</span>
          <span className={`text-xs font-bold ${overallColor}`}>{overallPct}% confidence</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {metadata._mangaupdates_found && (
            <span className="flex items-center gap-1 text-green-400">
              <CheckCircle className="h-3 w-3" /> MangaUpdates found
            </span>
          )}
          <span>{metadata._search_results_count ?? 0} sources searched</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Title + Alt titles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Title</label>
              <ConfidencePill score={conf.title} />
            </div>
            <Input
              value={edited.title ?? ""}
              onChange={(e) => setEdited({ ...edited, title: e.target.value })}
              className="bg-background border-border/50 focus:border-primary/50 text-sm h-8"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Author</label>
              <ConfidencePill score={conf.author} />
            </div>
            <Input
              value={edited.author ?? ""}
              onChange={(e) => setEdited({ ...edited, author: e.target.value })}
              className="bg-background border-border/50 focus:border-primary/50 text-sm h-8"
            />
          </div>
        </div>

        {/* Alt titles */}
        {(edited.alt_titles ?? []).length > 0 && (
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Alt Titles</label>
            <div className="flex flex-wrap gap-1.5">
              {(edited.alt_titles ?? []).map((t, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-secondary border border-border/30 text-muted-foreground font-jp">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Description</label>
            <ConfidencePill score={conf.description} />
          </div>
          <Textarea
            value={edited.description ?? ""}
            onChange={(e) => setEdited({ ...edited, description: e.target.value })}
            className="bg-background border-border/50 focus:border-primary/50 text-sm min-h-[120px] resize-y"
          />
        </div>

        {/* Language / Status / Type row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Language</label>
              <ConfidencePill score={conf.language} />
            </div>
            <div className="flex gap-1 flex-wrap">
              {["JP", "CN", "KR", "EN"].map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setEdited({ ...edited, language: l })}
                  className={`text-[10px] px-2 py-1 rounded-md border font-bold transition-all ${
                    edited.language === l
                      ? "border-primary/50 text-primary bg-primary/10"
                      : "border-border/50 text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status</label>
              <ConfidencePill score={conf.status} />
            </div>
            <div className="flex gap-1 flex-wrap">
              {["ongoing", "completed", "hiatus"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setEdited({ ...edited, status: s })}
                  className={`text-[10px] px-2 py-1 rounded-md border font-medium capitalize transition-all ${
                    edited.status === s
                      ? "border-accent/50 text-accent bg-accent/10"
                      : "border-border/50 text-muted-foreground hover:border-accent/30"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Type</label>
              <ConfidencePill score={conf.manga_type} />
            </div>
            <div className="flex gap-1 flex-wrap">
              {["Manga", "Webtoon"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEdited({ ...edited, manga_type: edited.manga_type === t ? null : t })}
                  className={`text-[10px] px-2 py-1 rounded-md border font-medium transition-all ${
                    edited.manga_type === t
                      ? t === "Manga"
                        ? "border-violet-500/50 text-violet-400 bg-violet-500/10"
                        : "border-cyan-500/50 text-cyan-400 bg-cyan-500/10"
                      : "border-border/50 text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {t === "Manga" ? "📖 LN" : "🌐 WN"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Genres */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Genres ({(edited.genres ?? []).length})
            </label>
            <ConfidencePill score={conf.genres} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(edited.genres ?? []).map((g, i) => (
              <span
                key={i}
                className="text-xs px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 font-medium flex items-center gap-1.5 group"
              >
                {g}
                <button
                  type="button"
                  onClick={() => setEdited({ ...edited, genres: (edited.genres ?? []).filter((_, j) => j !== i) })}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-primary/50 hover:text-destructive"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Tags — collapsible */}
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowTags(!showTags)}
            className="flex items-center gap-2 w-full text-left"
          >
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider cursor-pointer">
              Tags ({(edited.tags ?? []).length})
            </label>
            <ConfidencePill score={conf.tags} />
            {showTags ? <ChevronUp className="h-3 w-3 text-muted-foreground ml-auto" /> : <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />}
          </button>
          {showTags && (
            <div className="flex flex-wrap gap-1.5">
              {(edited.tags ?? []).map((t, i) => (
                <span
                  key={i}
                  className="text-xs px-2.5 py-1 rounded-lg bg-secondary text-secondary-foreground border border-border/50 font-medium flex items-center gap-1.5 group"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => setEdited({ ...edited, tags: (edited.tags ?? []).filter((_, j) => j !== i) })}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* MangaUpdates link */}
        {edited.mangaupdates_url && (
          <a
            href={edited.mangaupdates_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            View on MangaUpdates
          </a>
        )}

        {/* Sources toggle */}
        {(metadata.sources ?? []).length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowSources(!showSources)}
              className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Info className="h-3 w-3" />
              {showSources ? "Hide" : "Show"} sources ({metadata.sources!.length})
              {showSources ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showSources && (
              <div className="mt-2 space-y-1">
                {metadata.sources!.map((s, i) => (
                  <a
                    key={i}
                    href={s}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[10px] text-muted-foreground hover:text-primary truncate transition-colors"
                  >
                    {s}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Low confidence warning */}
        {overallPct < 50 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-golden/10 border border-golden/20">
            <AlertTriangle className="h-4 w-4 text-golden shrink-0 mt-0.5" />
            <p className="text-xs text-golden">
              Low confidence ({overallPct}%). The AI couldn't find strong sources for this manga. Please review and correct the fields before applying.
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            className="flex-1 gap-1.5 gradient-neon border-0 text-white font-semibold glow-purple hover:opacity-90"
            onClick={() => onApply(edited)}
          >
            <Check className="h-3.5 w-3.5" />
            Apply to Form
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 border-border/50 hover:border-destructive/30 hover:text-destructive"
            onClick={onDiscard}
          >
            <X className="h-3.5 w-3.5" />
            Discard
          </Button>
        </div>
      </div>
    </motion.div>
  );
}