import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import MetadataPreviewCard, { type ExtractedMetadata } from "./MetadataPreviewCard";

interface AiMetadataButtonProps {
  title: string;
  onApply: (metadata: ExtractedMetadata) => void;
}

type Step = "idle" | "searching" | "extracting" | "preview";

const stepLabels: Record<Step, string> = {
  idle: "AI Fill Metadata",
  searching: "Searching sources...",
  extracting: "Extracting metadata...",
  preview: "AI Fill Metadata",
};

export default function AiMetadataButton({ title, onApply }: AiMetadataButtonProps) {
  const [step, setStep] = useState<Step>("idle");
  const [preview, setPreview] = useState<ExtractedMetadata | null>(null);

  const handleGenerate = async () => {
    if (!title.trim()) {
      toast.error("Enter a title first");
      return;
    }

    setStep("searching");

    // Small delay so the user sees the "Searching" state
    await new Promise((r) => setTimeout(r, 400));
    setStep("extracting");

    const { data, error } = await supabase.functions.invoke("manga-sanctuary-manga-metadata-v2", {
      body: { title },
    });

    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Failed to generate metadata");
      setStep("idle");
      return;
    }

    setPreview(data as ExtractedMetadata);
    setStep("preview");
    toast.success("Metadata extracted — review before applying");
  };

  const handleApply = (metadata: ExtractedMetadata) => {
    onApply(metadata);
    setPreview(null);
    setStep("idle");
    toast.success("Metadata applied to form!");
  };

  const handleDiscard = () => {
    setPreview(null);
    setStep("idle");
  };

  const isLoading = step === "searching" || step === "extracting";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 border-border/50 hover:border-primary/30 hover:bg-primary/5"
          onClick={handleGenerate}
          disabled={isLoading || step === "preview"}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {stepLabels[step]}
        </Button>

        {isLoading && (
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {["searching", "extracting"].map((s, i) => (
                <div
                  key={s}
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    (step === "searching" && i === 0) || (step === "extracting" && i <= 1)
                      ? "w-8 bg-primary"
                      : "w-4 bg-border"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {step === "searching" ? "Searching MangaUpdates, Goodreads..." : "Extracting with Sonar Pro..."}
            </span>
          </div>
        )}
      </div>

      {preview && step === "preview" && (
        <MetadataPreviewCard
          metadata={preview}
          onApply={handleApply}
          onDiscard={handleDiscard}
        />
      )}
    </div>
  );
}