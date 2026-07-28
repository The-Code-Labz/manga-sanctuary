import type { MangaWithDetails } from "@/hooks/use-manga";
import MangaCard from "./MangaCard";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

interface MangaSectionProps {
  title: string;
  manga: MangaWithDetails[];
  href?: string;
}

export default function MangaSection({ title, manga, href }: MangaSectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5 }}
      className="space-y-5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 gradient-neon rounded-full" />
          <h2 className="text-lg font-bold">{title}</h2>
        </div>
        {href && (
          <Link
            to={href}
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5 transition-colors duration-300 group"
          >
            View all
            <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {manga.map((manga, i) => (
          <motion.div
            key={manga.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          >
            <MangaCard manga={manga} />
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}