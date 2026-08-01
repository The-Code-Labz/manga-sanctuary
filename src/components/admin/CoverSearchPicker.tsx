import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Check, X, Image as ImageIcon, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import CoverImageLightbox from "./CoverImageLightbox";
import { supabase } from "@/integrations/supabase/client";

interface CoverOption {
  url: string;
  thumbnail: string;
  title: string;
  source: string;
  broken?: boolean;
}

interface CoverSearchPickerProps {
  mangaTitle: string;
  onSelect: (url: string) => void;
  currentCover?: string;
}

export default function CoverSearchPicker({ mangaTitle, onSelect, currentCover }: CoverSearchPickerProps) {
  const [loading, setLoading] = useState(false);
  const [covers, setCovers] = useState<CoverOption[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [customQuery, setCustomQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const searchCovers = async (query?: string) => {
    const searchQuery = query || mangaTitle;
    if (!searchQuery.trim()) {
      toast.error("Enter a title first");
      return;
    }

    setLoading(true);
    setCovers([]);
    setSelectedIdx(null);
    setShowResults(true);

    const { data, error } = await supabase.functions.invoke("manga-sanctuary-manga-cover-search", {
      body: { query: searchQuery },
    });

    if (error || !data) {
      toast.error("Image search failed");
      setLoading(false);
      return;
    }

    const results = (data.results ?? []) as any[];

    const seen = new Set<string>();
    const filtered: CoverOption[] = [];

    for (const r of results) {
      const imgUrl = r.img_src || r.thumbnail_src;
      if (!imgUrl) continue;

      const normalizedUrl = imgUrl.startsWith("//") ? `https:${imgUrl}` : imgUrl;

      if (seen.has(normalizedUrl)) continue;
      seen.add(normalizedUrl);

      if (normalizedUrl.includes("favicon") || normalizedUrl.includes("logo")) continue;

      const thumbUrl = r.thumbnail_src
        ? (r.thumbnail_src.startsWith("//") ? `https:${r.thumbnail_src}` : r.thumbnail_src)
        : normalizedUrl;

      let sourceHost = r.source || "";
      try {
        sourceHost = new URL(normalizedUrl).hostname;
      } catch {}

      filtered.push({
        url: normalizedUrl,
        thumbnail: thumbUrl,
        title: r.title || "Cover image",
        source: sourceHost,
        broken: false,
      });

      if (filtered.length >= 30) break;
    }

    if (filtered.length === 0) {
      toast.error("No cover images found. Try a different search query.");
    } else {
      toast.success(`Found ${filtered.length} cover options`);
    }

    setCovers(filtered);
    setLoading(false);
  };

  const markBroken = (idx: number) => {
    setCovers((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, broken: true } : c))
    );
  };

  const handleSelect = (idx: number) => {
    setSelectedIdx(idx);
    onSelect(covers[idx].url);
  };

  const handleClose = () => {
    setShowResults(false);
    setCovers([]);
    setSelectedIdx(null);
  };

  // Only show non-broken covers in the lightbox navigation
  const visibleCovers = covers.filter((c) => !c.broken);
  const lightboxCover = lightboxIdx !== null ? covers[lightboxIdx] : null;

  return (
    <div className="space-y-3">
      {/* Search controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 border-border/50 hover:border-primary/30 hover:bg-primary/5 shrink-0"
          onClick={() => searchCovers()}
          disabled={loading || !mangaTitle.trim()}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          {loading ? "Searching..." : "Search Cover Art"}
        </Button>

        <div className="flex gap-2 flex-1">
          <Input
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            placeholder="Custom search query (optional)"
            className="bg-card border-border/50 focus:border-primary/50 text-xs h-9"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                searchCovers(customQuery || undefined);
              }
            }}
          />
          {customQuery && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1 border-border/50 hover:border-accent/30 shrink-0"
              onClick={() => searchCovers(customQuery)}
              disabled={loading}
            >
              <Search className="h-3 w-3" />
              Go
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      <AnimatePresence>
        {showResults && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-xl border border-border/30 bg-card/50 backdrop-blur-sm space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  {loading
                    ? "Searching..."
                    : `${visibleCovers.length} covers found — click to select, 🔍 to preview`}
                </p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                </div>
              ) : visibleCovers.length === 0 && covers.length === 0 ? (
                <div className="text-center py-8">
                  <ImageIcon className="h-8 w-8 text-primary/15 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No images found. Try a different query.</p>
                </div>
              ) : (
                /* Scrollable container */
                <div className="overflow-y-auto max-h-[340px] scrollbar-thin pr-1">
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                    {covers.map((cover, i) => {
                      if (cover.broken) return null;
                      return (
                        <motion.div
                          key={cover.url}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="relative group"
                        >
                          <button
                            type="button"
                            onClick={() => handleSelect(i)}
                            className={`relative w-full aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all duration-300 ${
                              selectedIdx === i
                                ? "border-primary glow-purple scale-105"
                                : "border-border/30 hover:border-primary/50"
                            }`}
                          >
                            <img
                              src={cover.thumbnail}
                              alt={cover.title}
                              loading="lazy"
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                              onError={() => markBroken(i)}
                            />

                            <div className="absolute inset-0 bg-background/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                              <div className="w-8 h-8 rounded-full gradient-neon flex items-center justify-center">
                                <Check className="h-4 w-4 text-white" />
                              </div>
                            </div>

                            {selectedIdx === i && (
                              <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full gradient-neon flex items-center justify-center shadow-lg">
                                <Check className="h-3 w-3 text-white" />
                              </div>
                            )}

                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-background/90 to-transparent p-1.5 pt-4">
                              <p className="text-[8px] text-foreground/60 truncate">{cover.source}</p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setLightboxIdx(i)}
                            className="absolute top-1.5 left-1.5 w-6 h-6 rounded-md bg-background/70 backdrop-blur-sm border border-border/50 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-all duration-200 opacity-0 group-hover:opacity-100"
                            title="Preview full size"
                          >
                            <ZoomIn className="h-3 w-3" />
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {lightboxCover && !lightboxCover.broken && (
        <CoverImageLightbox
          imageUrl={lightboxCover.url}
          imageTitle={lightboxCover.title}
          imageSource={lightboxCover.source}
          open={lightboxIdx !== null}
          onClose={() => setLightboxIdx(null)}
          onSelect={() => {
            if (lightboxIdx !== null) handleSelect(lightboxIdx);
          }}
          isSelected={lightboxIdx === selectedIdx}
        />
      )}
    </div>
  );
}