import { BookOpen, Layers, Type } from "lucide-react";
import type { MangaType } from "@/hooks/use-manga";

interface MangaTypeBadgeProps {
  type: MangaType | null;
  size?: "sm" | "md";
}

const styles: Record<MangaType, string> = {
  Manga: "bg-violet-500/15 text-violet-400 border border-violet-500/25",
  Webtoon: "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25",
  Manhwa: "bg-rose-500/15 text-rose-400 border border-rose-500/25",
  Manhua: "bg-amber-500/15 text-amber-400 border border-amber-500/25",
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
      className={`inline-flex items-center font-bold rounded-md backdrop-blur-sm ${sizeClasses} ${styles[type]}`}
    >
      <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} />
      {labels[type]}
    </span>
  );
}
