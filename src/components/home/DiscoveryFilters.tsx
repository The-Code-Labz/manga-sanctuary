import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

const regions = [
  { code: "JP", nativeLabel: "日本", label: "Japanese manga" },
  { code: "KR", nativeLabel: "한국", label: "Korean manhwa" },
  { code: "CN", nativeLabel: "中文", label: "Chinese manhua" },
  { code: "EN", nativeLabel: "EN", label: "English webtoons" },
];

const borderClasses = [
  "border-b sm:border-r lg:border-b-0",
  "border-b lg:border-b-0 lg:border-r",
  "border-b sm:border-b-0 sm:border-r",
  "",
];

export default function DiscoveryFilters() {
  return (
    <nav className="border-b border-border" aria-label="Browse by origin">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4">
        {regions.map((region, index) => (
          <Link
            key={region.code}
            to={`/search?lang=${region.code}`}
            className={`group flex min-h-[5.5rem] items-center justify-between border-border px-5 transition-colors hover:bg-secondary/70 ${borderClasses[index]}`}
          >
            <span className="flex items-baseline gap-3">
              <span className="font-serif text-xl font-bold text-foreground">{region.nativeLabel}</span>
              <span className="text-xs font-semibold text-muted-foreground">{region.label}</span>
            </span>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" strokeWidth={1.8} />
          </Link>
        ))}
      </div>
    </nav>
  );
}
