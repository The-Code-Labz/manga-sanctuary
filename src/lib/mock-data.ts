export type Language = "JP" | "CN" | "KR" | "EN";
export type MangaStatus = "ongoing" | "completed" | "hiatus";
export type MangaType = "Manga" | "Webtoon" | "Manhwa" | "Manhua";

export interface Page {
  page_number: number;
  image_url: string;
}

export interface Chapter {
  id: string;
  manga_id: string;
  volume_number: number | null;
  volume_title: string | null;
  chapter_number: number;
  chapter_title: string | null;
  pages: Page[];
  external_url: string | null;
  release_date: string | null;
  is_read?: boolean;
}

export interface Review {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string;
  manga_id: string;
  rating: number;
  review_text: string;
  created_at: string;
}

export interface Manga {
  id: string;
  title: string;
  alt_titles: string[];
  description: string | null;
  author_name: string;
  artist_name: string | null;
  language: Language;
  status: MangaStatus;
  manga_type: MangaType;
  cover_url: string;
  genres: string[];
  tags: string[];
  rating: number;
  rating_count: number;
  reader_count: number;
  chapter_count: number;
  last_updated: string;
}

const covers = [
  "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&h=560&fit=crop",
  "https://images.unsplash.com/photo-1618336753974-aae8e04506aa?w=400&h=560&fit=crop",
  "https://images.unsplash.com/photo-1560167016-022b78a0258e?w=400&h=560&fit=crop",
  "https://images.unsplash.com/photo-1607604276583-eef5f0b7e950?w=400&h=560&fit=crop",
  "https://images.unsplash.com/photo-1620336655052-b967f9f52734?w=400&h=560&fit=crop",
  "https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=400&h=560&fit=crop",
  "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&h=560&fit=crop",
  "https://images.unsplash.com/photo-1541562232579-512a21360020?w=400&h=560&fit=crop",
];

function pageUrl(mangaId: string, chapterNum: number, pageNum: number) {
  const hue = ((parseInt(mangaId, 10) * 47 + chapterNum * 13 + pageNum * 7) % 360).toString();
  return `https://placehold.co/800x1200/hsl(${hue},60%,15%)/ffffff/png?text=Page+${pageNum}`;
}

export function generatePages(mangaId: string, chapterNumber: number, count: number): Page[] {
  return Array.from({ length: count }, (_, i) => ({
    page_number: i + 1,
    image_url: pageUrl(mangaId, chapterNumber, i + 1),
  }));
}

const genres = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Isekai",
  "Mahou Shoujo", "Mecha", "Mystery", "Psychological", "Romance", "School Life",
  "Sci-Fi", "Seinen", "Shoujo", "Shounen", "Slice of Life", "Sports", "Supernatural",
  "Thriller", "Tragedy",
];

const tags = [
  "OP MC", "Reincarnation", "System", "Harem", "Dungeon", "Regression",
  "Academy", "Tower Climbing", "Villainess", "Second Chance", "Slow Burn",
  "Hidden Identity", "Monster Taming", "Guild Master", "Apocalypse", "Survival",
];

function pick<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export const mockManga: Manga[] = [
  {
    id: "1",
    title: "Tower Climber",
    alt_titles: ["나 혼자 탑을 오르다", "Solo Tower"],
    description: "Kim Suho awakens as the only person who can see the hidden paths between floors of a mysterious tower. With monsters, treasures, and rival climbers around every corner, he must climb alone while the world's strongest guilds race to reach the top.",
    author_name: "Park Jinwoo",
    artist_name: "Kim Seon",
    language: "KR",
    status: "ongoing",
    manga_type: "Manhwa",
    cover_url: covers[0],
    genres: ["Action", "Fantasy", "Shounen"],
    tags: ["OP MC", "Tower Climbing", "System"],
    rating: 4.7,
    rating_count: 2341,
    reader_count: 15420,
    chapter_count: 12,
    last_updated: "2 hours ago",
  },
  {
    id: "2",
    title: "Heavenly Demon Cultivation",
    alt_titles: ["天魔修仙录"],
    description: "A fallen sect disciple discovers an ancient demonic cultivation technique. As he grows stronger, he must navigate political intrigue, deadly tournaments, and the fine line between righteous and demonic paths.",
    author_name: "Luo Tianyi",
    artist_name: "Wang Li",
    language: "CN",
    status: "ongoing",
    manga_type: "Manhua",
    cover_url: covers[1],
    genres: ["Fantasy", "Martial Arts", "Action"],
    tags: ["Cultivation", "OP MC", "Reincarnation"],
    rating: 4.5,
    rating_count: 1876,
    reader_count: 12300,
    chapter_count: 8,
    last_updated: "5 hours ago",
  },
  {
    id: "3",
    title: "The Witch's Grimoire",
    alt_titles: [],
    description: "A university student discovers she can read an ancient grimoire that transports her consciousness into a parallel world of magic. There, she must master forbidden spells while uncovering the truth behind her family's connection to both worlds.",
    author_name: "Elena Voss",
    artist_name: "Elena Voss",
    language: "EN",
    status: "ongoing",
    manga_type: "Webtoon",
    cover_url: covers[2],
    genres: ["Fantasy", "Mystery", "Romance"],
    tags: ["Magic", "Academy", "Reincarnation"],
    rating: 4.8,
    rating_count: 3102,
    reader_count: 22100,
    chapter_count: 15,
    last_updated: "1 day ago",
  },
  {
    id: "4",
    title: "Sword Saint's Second Life",
    alt_titles: ["剣聖の二度目の人生"],
    description: "The world's greatest swordsman dies at the peak of his power, only to reawaken as a teenager in a magical academy. With centuries of combat experience but none of his former strength, he must rebuild from scratch.",
    author_name: "Tanaka Yūji",
    artist_name: "Sato Mei",
    language: "JP",
    status: "completed",
    manga_type: "Manga",
    cover_url: covers[3],
    genres: ["Fantasy", "Action", "Slice of Life"],
    tags: ["Reincarnation", "Academy", "OP MC"],
    rating: 4.6,
    rating_count: 4521,
    reader_count: 31200,
    chapter_count: 6,
    last_updated: "Completed",
  },
  {
    id: "5",
    title: "Dungeon Architect Online",
    alt_titles: [],
    description: "When a new VRMMO launches with a unique class system, one player discovers the hidden 'Architect' class that lets him design and build dungeons. What starts as a creative hobby becomes a world-shaking power.",
    author_name: "CodeWraith",
    artist_name: "PixelMage",
    language: "EN",
    status: "ongoing",
    manga_type: "Webtoon",
    cover_url: covers[4],
    genres: ["Sci-Fi", "Fantasy", "Adventure"],
    tags: ["System", "Dungeon", "Kingdom Building"],
    rating: 4.3,
    rating_count: 987,
    reader_count: 7800,
    chapter_count: 10,
    last_updated: "3 hours ago",
  },
  {
    id: "6",
    title: "Regression to the Abyss",
    alt_titles: ["심연으로의 회귀"],
    description: "After humanity loses the war against the Abyss, the last survivor is sent back 10 years. Armed with knowledge of every catastrophe to come, he must prevent the apocalypse while hiding his impossible power.",
    author_name: "Choi Minhyuk",
    artist_name: "Lee Joon",
    language: "KR",
    status: "ongoing",
    manga_type: "Manhwa",
    cover_url: covers[5],
    genres: ["Fantasy", "Action", "Drama"],
    tags: ["Regression", "OP MC", "System"],
    rating: 4.9,
    rating_count: 5678,
    reader_count: 45200,
    chapter_count: 9,
    last_updated: "1 hour ago",
  },
  {
    id: "7",
    title: "Celestial Alchemy Master",
    alt_titles: ["仙丹宗师"],
    description: "In a cultivation world where alchemists are revered above warriors, a young orphan with a mysterious cauldron begins her journey to become the greatest pill refiner the heavens have ever seen.",
    author_name: "Xiao Lingyu",
    artist_name: "Zhang Wei",
    language: "CN",
    status: "ongoing",
    manga_type: "Manhua",
    cover_url: covers[6],
    genres: ["Fantasy", "Adventure", "Romance"],
    tags: ["Cultivation", "Magic", "System"],
    rating: 4.4,
    rating_count: 1543,
    reader_count: 9800,
    chapter_count: 11,
    last_updated: "12 hours ago",
  },
  {
    id: "8",
    title: "The Last Summoner",
    alt_titles: ["最後の召喚師"],
    description: "In a world where summoning magic has been lost for centuries, a high school student accidentally summons a being from another dimension. Now hunted by governments and secret societies, she must master her forbidden power.",
    author_name: "Suzuki Aoi",
    artist_name: "Yamamoto Ken",
    language: "JP",
    status: "completed",
    manga_type: "Manga",
    cover_url: covers[7],
    genres: ["Fantasy", "Action", "Mystery"],
    tags: ["Magic", "Academy", "OP MC"],
    rating: 4.2,
    rating_count: 876,
    reader_count: 5600,
    chapter_count: 7,
    last_updated: "Completed",
  },
];

export function generateChapters(mangaId: string, count: number): Chapter[] {
  return Array.from({ length: Math.min(count, 50) }, (_, i) => ({
    id: `ch-${mangaId}-${i + 1}`,
    manga_id: mangaId,
    volume_number: Math.floor(i / 5) + 1,
    volume_title: `Volume ${Math.floor(i / 5) + 1}`,
    chapter_number: i + 1,
    chapter_title: `Chapter ${i + 1}`,
    pages: generatePages(mangaId, i + 1, 6 + ((i % 4) * 2)),
    external_url: null,
    release_date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
    is_read: i < 3,
  }));
}

export const chaptersByManga: Record<string, Chapter[]> = Object.fromEntries(
  mockManga.map((m) => [m.id, generateChapters(m.id, m.chapter_count)])
);

export const mockReviews: Review[] = [
  { id: "r1", user_id: "u1", username: "MangaFanatic", avatar_url: "", manga_id: "1", rating: 5, review_text: "The art is incredible and the MC's growth feels earned. Every chapter leaves me wanting more.", created_at: "2 days ago" },
  { id: "r2", user_id: "u2", username: "PanelReader99", avatar_url: "", manga_id: "1", rating: 4, review_text: "Great action sequences and panel composition. The pacing slows around chapter 50 but picks back up.", created_at: "1 week ago" },
  { id: "r3", user_id: "u3", username: "ShounenLover", avatar_url: "", manga_id: "1", rating: 5, review_text: "One of the best tower climbing manga I've ever read. The hidden path mechanic is genius.", created_at: "2 weeks ago" },
];

export const allGenres = genres;
export const allTags = tags;
export const languages: Language[] = ["JP", "CN", "KR", "EN"];
