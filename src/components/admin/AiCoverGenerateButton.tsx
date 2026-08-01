import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, Wand2, RefreshCw, Edit3, Zap } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface AiCoverGenerateButtonProps {
  title: string;
  description: string;
  currentCover?: string;
  onCoverGenerated: (url: string) => void;
}

const STYLES = [
  { id: "anime", label: "Anime", emoji: "🎨" },
  { id: "manga", label: "Manga", emoji: "📖" },
  { id: "digital-art", label: "Digital Art", emoji: "🖌️" },
  { id: "artistic", label: "Artistic", emoji: "🎭" },
  { id: "realistic", label: "Realistic", emoji: "📷" },
];

export default function AiCoverGenerateButton({
  title,
  description,
  currentCover,
  onCoverGenerated,
}: AiCoverGenerateButtonProps) {
  const [loading, setLoading] = useState(false);
  const [promptLoading, setPromptLoading] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState("anime");
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);

  const handleAutoGeneratePrompt = async () => {
    if (!title.trim()) {
      toast.error("Enter a manga title first");
      return;
    }

    setPromptLoading(true);

    const { data, error } = await supabase.functions.invoke("manga-sanctuary-generate-cover-prompt", {
      body: { title, description, style: selectedStyle },
    });

    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Failed to generate prompt");
      setPromptLoading(false);
      return;
    }

    if (data?.prompt) {
      setCustomPrompt(data.prompt);
      setUseCustomPrompt(true);
      toast.success("Prompt generated! Review it and click Generate.");
    } else {
      toast.error("No prompt returned");
    }

    setPromptLoading(false);
  };

  const handleGenerate = async () => {
    if (!title.trim()) {
      toast.error("Enter a manga title first");
      return;
    }

    if (useCustomPrompt && !customPrompt.trim()) {
      toast.error("Enter a custom prompt or disable custom prompt mode");
      return;
    }

    setLoading(true);
    setGeneratedUrl(null);

    const requestBody: Record<string, unknown> = {
      title,
      style: selectedStyle,
    };

    if (useCustomPrompt && customPrompt.trim()) {
      requestBody.customPrompt = customPrompt.trim();
    }

    console.log("[cover-gen-ui] sending request:", {
      title: requestBody.title,
      style: requestBody.style,
      hasCustomPrompt: !!requestBody.customPrompt,
      customPromptLength: requestBody.customPrompt ? String(requestBody.customPrompt).length : 0,
    });

    const { data, error } = await supabase.functions.invoke("manga-sanctuary-manga-cover-generate", {
      body: requestBody,
    });

    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Failed to generate cover");
      setLoading(false);
      return;
    }

    if (data?.cover_url) {
      setGeneratedUrl(data.cover_url);
      onCoverGenerated(data.cover_url);
      toast.success("Cover art generated!");
    } else {
      toast.error("No image returned from AI");
    }

    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 border-border/50 hover:border-accent/30 hover:bg-accent/5"
          onClick={() => setShowStylePicker(!showStylePicker)}
          disabled={loading}
        >
          <Wand2 className="h-3.5 w-3.5" />
          AI Generate Cover
        </Button>

        {showStylePicker && !loading && (
          <Button
            type="button"
            size="sm"
            className="gap-1.5 gradient-neon border-0 text-white glow-purple hover:opacity-90"
            onClick={handleGenerate}
            disabled={!title.trim()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Generate
          </Button>
        )}

        {loading && (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
            <span className="text-xs text-muted-foreground">Generating cover art...</span>
          </div>
        )}

        {generatedUrl && !loading && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 border-border/50 hover:border-primary/30"
            onClick={handleGenerate}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate
          </Button>
        )}
      </div>

      {/* Style picker + custom prompt */}
      <AnimatePresence>
        {showStylePicker && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-3 rounded-xl border border-border/30 bg-card/50 space-y-4">
              {/* Art style */}
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Art Style</p>
                <div className="flex flex-wrap gap-1.5">
                  {STYLES.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setSelectedStyle(style.id)}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all duration-300 ${
                        selectedStyle === style.id
                          ? "border-accent/50 text-accent bg-accent/10"
                          : "border-border/50 text-muted-foreground hover:border-accent/30"
                      }`}
                    >
                      {style.emoji} {style.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom prompt section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setUseCustomPrompt(!useCustomPrompt)}
                    className={`flex items-center gap-2 text-xs font-medium transition-colors duration-200 ${
                      useCustomPrompt ? "text-primary" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    {useCustomPrompt ? "Using custom prompt" : "Use custom prompt"}
                    <span className={`w-7 h-4 rounded-full transition-colors duration-200 flex items-center px-0.5 ${
                      useCustomPrompt ? "bg-primary" : "bg-border"
                    }`}>
                      <span className={`w-3 h-3 rounded-full bg-white transition-transform duration-200 ${
                        useCustomPrompt ? "translate-x-3" : "translate-x-0"
                      }`} />
                    </span>
                  </button>

                  {/* Auto-generate prompt button */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-golden/30 text-golden hover:bg-golden/10 hover:border-golden/50 text-xs h-7"
                    onClick={handleAutoGeneratePrompt}
                    disabled={promptLoading || !title.trim()}
                  >
                    {promptLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Zap className="h-3 w-3" />
                    )}
                    {promptLoading ? "Generating..." : "Auto-generate Prompt"}
                  </Button>
                </div>

                <AnimatePresence>
                  {useCustomPrompt && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden space-y-2"
                    >
                      <Textarea
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder={`Paste or write a detailed prompt here.\n\nOr click "Auto-generate Prompt" above to create one from the manga's title and description.`}
                        className="bg-card border-border/50 focus:border-primary/50 text-xs min-h-[140px] resize-y font-mono"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        The prompt will be sent directly to the image generator. Use the auto-generate button to create a safe, structured prompt from the manga's metadata.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {!useCustomPrompt && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Will generate based on the manga title only. Use auto-generate or write a custom prompt for better results.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview of generated image */}
      <AnimatePresence>
        {generatedUrl && !loading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="flex items-start gap-3 p-3 rounded-xl border border-green-500/20 bg-green-500/5"
          >
            <img
              src={generatedUrl}
              alt="AI Generated Cover"
              className="w-20 h-28 rounded-lg object-cover border border-border/30 shadow-lg"
            />
            <div className="flex-1 space-y-1">
              <p className="text-xs font-semibold text-green-400">✨ Cover generated!</p>
              <p className="text-[10px] text-muted-foreground">
                The generated cover has been applied. You can regenerate with a different style or prompt.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}