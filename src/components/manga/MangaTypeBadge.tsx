import { BookOpen, Layers, Type } from "lucide-react";
import type { MangaType } from "@/hooks/use-manga";

interface MangaTypeBadgeProps {
  type: MangaType | null;
  size?: "sm" | "md";
}

const styles: Record<MangaType, string> = {
  Manga: "bg-background/90 text-foreground border border-foreground/20",
  Webtoon: "bg-background/90 text-cyan-200 border border-cyan-200/25",
  Manhwa: "bg-background/90 text-rose-200 border border-rose-200/25",
  Manhua: "bg-background/90 text-amber-200 border border-amber-200/25",
};

const labels: Record<MangaType, string> = {
  Manga: "Manga",
  Webtoon: "Webtoon",
  Manhwa: "Manhwa",
  Manhua: "Manhua",
};

export default function MangaTypeBadge({ type, size = "sm" }: MangaTypeBadgeProps) {
  if (!type) return null;

  const sizeClasses = size === "sm"
    ? "text-[10px] px-1.5 py-0.5 gap-0.5"
    : "text-xs px-2.5 py-1 gap-1";

  const Icon = type === "Webtoon" ? Layers : type === "Manga" ? BookOpen : Type;

  return (
    <span
      className={`inline-flex items-center font-bold uppercase tracking-[0.08em] ${sizeClasses} ${styles[type]}`}
    >
      <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} />
      {labels[type]}
    </span>
  );
}
