import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CoverImageLightboxProps {
  imageUrl: string;
  imageTitle: string;
  imageSource: string;
  open: boolean;
  onClose: () => void;
  onSelect: () => void;
  isSelected: boolean;
}

export default function CoverImageLightbox({
  imageUrl,
  imageTitle,
  imageSource,
  open,
  onClose,
  onSelect,
  isSelected,
}: CoverImageLightboxProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto relative max-w-sm w-full rounded-2xl border border-border/50 bg-card shadow-2xl shadow-primary/10 overflow-hidden anime-card"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-background/70 backdrop-blur-sm border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all duration-200"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Image */}
              <div className="relative bg-black/20">
                <img
                  src={imageUrl}
                  alt={imageTitle}
                  className="w-full max-h-[60vh] object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/placeholder.svg";
                  }}
                />
                {/* Gradient overlay at bottom */}
                <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-card to-transparent" />
              </div>

              {/* Info + actions */}
              <div className="p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold line-clamp-2 leading-tight">{imageTitle}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{imageSource}</p>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className={`flex-1 gap-1.5 font-semibold transition-all duration-300 ${
                      isSelected
                        ? "bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30"
                        : "gradient-neon border-0 text-white glow-purple hover:opacity-90"
                    }`}
                    onClick={() => {
                      onSelect();
                      onClose();
                    }}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {isSelected ? "Selected" : "Use This Cover"}
                  </Button>
                  <a
                    href={imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-border/50 hover:border-primary/30"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}