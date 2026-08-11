import { Sparkles, BookOpen, Layers, Type } from "lucide-react";
import { useMangaList, type MangaType } from "@/hooks/use-manga";
import DiscoveryFilters from "@/components/home/DiscoveryFilters";
import FeaturedMangaHero from "@/components/home/FeaturedMangaHero";
import HomeLoadingState from "@/components/home/HomeLoadingState";
import ContinueReadingSection from "@/components/home/ContinueReadingSection";
import TagSpotlight from "@/components/home/TagSpotlight";
import MangaSection from "@/components/manga/MangaSection";

// The catalog is still young — reader counts and ratings are too thin to be
// a meaningful "most read"/"highest rated" signal yet. Type is a reliable
// discovery axis regardless of traffic, so it drives the browse sections
// instead. Min 3 titles before a type gets its own shelf.
const TYPE_SECTIONS: { type: MangaType; eyebrow: string; title: string; icon: typeof BookOpen }[] = [
  { type: "Manga", eyebrow: "Manga", title: "Straight from Japan", icon: BookOpen },
  { type: "Manhwa", eyebrow: "Manhwa", title: "Korean webtoons & manhwa", icon: Type },
  { type: "Manhua", eyebrow: "Manhua", title: "Chinese manhua on the shelf", icon: Layers },
  { type: "Webtoon", eyebrow: "Webtoon", title: "Full-colour strips to binge", icon: Layers },
];

export default function HomePage() {
  const { data: manga = [], isLoading } = useMangaList();

  if (isLoading) return <HomeLoadingState />;

  const newlyAdded = [...manga].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const typeShelves = TYPE_SECTIONS.map((section) => ({
    ...section,
    manga: newlyAdded.filter((m) => m.manga_type === section.type),
  })).filter((section) => section.manga.length >= 3);

  return (
    <div className="space-y-16 pb-16 lg:space-y-24 lg:pb-24">
      <div>
        <FeaturedMangaHero featured={newlyAdded[0]} catalogSize={manga.length} />
        <DiscoveryFilters />
      </div>

      <ContinueReadingSection />

      <MangaSection
        eyebrow="01 / New arrivals"
        title="Fresh off the shelf"
        icon={Sparkles}
        manga={newlyAdded.slice(0, 12)}
        href="/search"
      />

      {typeShelves.map((section, index) => (
        <MangaSection
          key={section.type}
          eyebrow={`${String(index + 2).padStart(2, "0")} / ${section.eyebrow}`}
          title={section.title}
          icon={section.icon}
          manga={section.manga.slice(0, 12)}
          href={`/search?type=${section.type}`}
        />
      ))}

      <TagSpotlight manga={manga} />
    </div>
  );
}
