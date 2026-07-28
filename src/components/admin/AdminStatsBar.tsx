import { motion } from "framer-motion";
import { BookOpen, Globe, CheckCircle, Clock, BookMarked, Star } from "lucide-react";
import type { AdminManga } from "@/hooks/use-admin-manga";

interface AdminStatsBarProps {
  manga: AdminManga[];
}

export default function AdminStatsBar({ manga }: AdminStatsBarProps) {
  const stats = [
    {
      label: "Total Manga",
      value: manga.length,
      icon: BookOpen,
      color: "text-primary",
      bg: "bg-primary/10",
      border: "border-primary/20",
      glow: "shadow-primary/10",
    },
    {
      label: "Published",
      value: manga.filter((n) => n.is_approved).length,
      icon: CheckCircle,
      color: "text-green-400",
      bg: "bg-green-500/10",
      border: "border-green-500/20",
      glow: "shadow-green-500/10",
    },
    {
      label: "Pending",
      value: manga.filter((n) => !n.is_approved).length,
      icon: Clock,
      color: "text-golden",
      bg: "bg-golden/10",
      border: "border-golden/20",
      glow: "shadow-golden/10",
    },
    {
      label: "Mangas",
      value: manga.filter((n) => n.novel_type === "Manga").length,
      icon: BookMarked,
      color: "text-violet-400",
      bg: "bg-violet-500/10",
      border: "border-violet-500/20",
      glow: "shadow-violet-500/10",
    },
    {
      label: "Webtoons",
      value: manga.filter((n) => n.novel_type === "Webtoon").length,
      icon: Globe,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
      glow: "shadow-cyan-500/10",
    },
    {
      label: "Total Chapters",
      value: manga.reduce((sum, n) => sum + n.chapter_count, 0).toLocaleString(),
      icon: Star,
      color: "text-accent",
      bg: "bg-accent/10",
      border: "border-accent/20",
      glow: "shadow-accent/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.07, duration: 0.4 }}
          className={`relative overflow-hidden rounded-xl border ${stat.border} ${stat.bg} p-4 flex flex-col gap-2 shadow-lg ${stat.glow} anime-card`}
        >
          {/* Background glow blob */}
          <div className={`absolute -top-4 -right-4 w-16 h-16 rounded-full ${stat.bg} blur-xl opacity-60`} />

          <div className={`w-8 h-8 rounded-lg ${stat.bg} border ${stat.border} flex items-center justify-center`}>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </div>
          <div>
            <p className={`text-2xl font-extrabold ${stat.color}`}>{stat.value}</p>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{stat.label}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}