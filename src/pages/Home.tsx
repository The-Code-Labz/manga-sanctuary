import { Clock3, Star, TrendingUp } from "lucide-react";
import { useMangaList } from "@/hooks/use-manga";
import DiscoveryFilters from "@/components/home/DiscoveryFilters";
import FeaturedMangaHero from "@/components/home/FeaturedMangaHero";
import HomeLoadingState from "@/components/home/HomeLoadingState";
import MangaSection from "@/components/manga/MangaSection";

export default function HomePage() {
  const { data: manga = [], isLoading } = useMangaList();

  if (isLoading) return <HomeLoadingState />;

  const trending = [...manga].sort((a, b) => b.reader_count - a.reader_count).slice(0, 6);
  const recentlyUpdated = manga.slice(0, 6);
  const highestRated = [...manga].sort((a, b) => b.rating - a.rating).slice(0, 6);

  return (
    <div className="space-y-16 pb-16 lg:space-y-24 lg:pb-24">
      <div>
        <FeaturedMangaHero featured={trending[0]} catalogSize={manga.length} />
        <DiscoveryFilters />
      </div>

      <MangaSection eyebrow="01 / Most read" title="Readers are returning to these" icon={TrendingUp} manga={trending} href="/search" ranked />
      <MangaSection eyebrow="02 / New chapters" title="Fresh pages on the shelf" icon={Clock3} manga={recentlyUpdated} href="/search" />
      <MangaSection eyebrow="03 / Community picks" title="Rated after the last page" icon={Star} manga={highestRated} href="/search" />
    </div>
  );
}
