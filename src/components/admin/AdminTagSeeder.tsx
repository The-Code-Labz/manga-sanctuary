import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Download, Loader2, CheckCircle } from "lucide-react";

const NOVELUPDATES_TAGS = [
  // Protagonist traits
  "Abandoned", "Abusive Characters", "Adapted to Anime", "Adapted to Drama",
  "Adapted to Manga", "Adapted to Manhua", "Adapted to Manhwa",
  "Age Progression", "Age Regression", "Aggressive Characters",
  "Alchemy", "Amnesia", "Ancient China", "Ancient Times",
  "Androgynous Characters", "Angels", "Anti-Hero Protagonist",
  "Antihero Protagonist", "Apathetic Protagonist", "Aristocracy",
  "Arranged Marriage", "Artifact Crafting", "Assassins",
  "Autism", "Awkward Protagonist",

  // World & Setting
  "Beast Companions", "Beastkin", "Beautiful Female Lead",
  "Body Tempering", "Books", "Broken Engagement",
  "Brotherhood", "Buddhism", "Business Management",
  "Calm Protagonist", "Carefree Protagonist", "Caring Protagonist",
  "Character Growth", "Charismatic Protagonist", "Cheats",
  "Child Protagonist", "Childcare", "Clan Building",
  "Clever Protagonist", "Cold Protagonist", "College/University",
  "Comedic Undertone", "Coming of Age", "Complex Family Relationships",
  "Confident Protagonist", "Cooking", "Corruption",
  "Cowardly Protagonist", "Crafting", "Cruel Characters",
  "Cultivation", "Cunning Protagonist",

  // Themes
  "Dao Comprehension", "Dark", "Death", "Death of Loved Ones",
  "Dedicated Love Interest", "Demons", "Dense Protagonist",
  "Determined Protagonist", "Devoted Love Interests", "Disabilities",
  "Discrimination", "Divination", "Divine Protection",
  "Doting Love Interests", "Doting Older Siblings", "Doting Parents",
  "Dragons", "Dungeons", "Dystopia",

  // Mechanics
  "Early Romance", "Easy Harem", "Elemental Magic",
  "Elves", "Empires", "Enemies Become Allies",
  "Enemies Become Lovers", "Evil Gods", "Evil Organizations",
  "Evil Protagonist", "Evil Religion", "Evolution",
  "Exhibitionism", "Exorcism",

  // Fantasy elements
  "Fairies", "Fallen Angels", "Fallen Nobility",
  "Famous Protagonist", "Fantasy Creatures", "Fantasy World",
  "Fast Cultivation", "Fast Learner", "Female Protagonist",
  "Firearms", "Flashbacks", "Folklore",
  "Forced Living Together", "Forced Marriage", "Friendship",
  "Futuristic Setting",

  // Game elements
  "Game Elements", "Game Ranking System", "Gangs",
  "Gate to Another World", "Genius Protagonist", "Ghosts",
  "Gladiators", "Goddesses", "Gods",
  "Golems", "Gore", "Guilds",

  // Harem & Romance
  "Handsome Male Lead", "Hard-Working Protagonist", "Harem",
  "Harsh Training", "Healers", "Heaven", "Hell",
  "Helpful Protagonist", "Heroes", "Hidden Abilities",
  "Hiding True Abilities", "Hiding True Identity", "Human Experimentation",

  // Isekai & Reincarnation
  "Immortals", "Inheritance", "Inscriptions",
  "Interdimensional Travel", "Isekai", "Island",

  // Kingdom & Politics
  "Kingdom Building", "Knights", "Late Romance",
  "Leadership", "Legends", "Level System",
  "Long Separations", "Love Interest Falls in Love First",
  "Love Rivals", "Loyal Subordinates",

  // Magic & Powers
  "Magic", "Magic Beasts", "Magic Formations",
  "Magical Space", "Magical Technology", "Male Protagonist",
  "Manipulative Characters", "Marriage", "Martial Arts",
  "Martial Spirits", "Master-Disciple Relationship",
  "Master-Servant Relationship", "Mature Protagonist",
  "Mercenaries", "Military", "Mind Break",
  "Mind Control", "Misunderstandings", "Modern Day",
  "Monsters", "Multiple Identities", "Multiple Leads",
  "Multiple Protagonists", "Multiple Realms", "Multiple Reincarnated Individuals",
  "Multiple Timelines", "Mysterious Family Background",
  "Mysterious Past", "Mystery Solving",

  // Narrative
  "Naive Protagonist", "Near-Death Experience", "Necromancer",
  "Nobles", "Non-Human Protagonist", "Nudity",

  // OP & Power
  "Older Love Interests", "Omegaverse", "One-sided Love",
  "Orphans", "Overpowered Protagonist",

  // Cultivation stages
  "Pill Concocting", "Pill Based Cultivation", "Pirates",
  "Playful Protagonist", "Poisons", "Politics",
  "Polygamy", "Poor Protagonist", "Poor to Rich",
  "Possession", "Power Couple", "Pregnancy",
  "Previous Life Talent", "Proactive Protagonist",
  "Prophecies", "Protagonist Falls in Love First",
  "Protagonist Strong from the Start", "Psychic Powers",
  "Puppeteers",

  // Regression & Time
  "Racism", "Rape", "Reincarnated as a Monster",
  "Reincarnated in a Game World", "Reincarnated into Another World",
  "Reincarnation", "Religions", "Revenge",
  "Reverse Harem", "Royalty", "RPG",

  // School & Academy
  "Schemes and Conspiracies", "Sect Development",
  "Sects", "Seduction", "Shameless Protagonist",
  "Sharp-tongued Characters", "Siblings", "Skill Assimilation",
  "Slave Harem", "Slaves", "Slow Growth at Start",
  "Slow Romance", "Smart Couple", "Soul Power",
  "Souls", "Special Abilities", "Spirits",
  "Stoic Characters", "Strategic Battles", "Strong Love Interests",
  "Strong to Stronger", "Student-Teacher Relationship",
  "Sudden Strength Gain", "Summoned Hero", "Summoning Magic",
  "Survival", "System",

  // Tropes
  "Teamwork", "Technological Gap", "Thieves",
  "Time Loop", "Time Manipulation", "Time Skip",
  "Time Travel", "Tomboyish Female Lead", "Torture",
  "Tower Climbing", "Tragic Past", "Transmigration",
  "Transported to Another World", "Tsundere",

  // Unique
  "Underestimated Protagonist", "Unique Cultivation Technique",
  "Unique Weapon User", "Unreliable Narrator",
  "Vampires", "Villainess Noble Girls", "Virtual Reality",
  "Wars", "Weak Protagonist", "Weak to Strong",
  "Wealthy Characters", "Werebeasts", "Witches",
  "Wizards", "World Hopping", "World Travel",
  "Xianxia", "Xuanhuan", "Yandere",
  "Younger Love Interests", "Zombies",
];

export default function AdminTagSeeder() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const qc = useQueryClient();

  const handleSeed = async () => {
    if (!confirm(`This will add up to ${NOVELUPDATES_TAGS.length} tags from MangaUpdates to the database (skipping duplicates). Continue?`)) return;

    setLoading(true);

    // Fetch existing tags to avoid duplicates
    const { data: existing } = await supabase.from("tags").select("name");
    const existingNames = new Set((existing ?? []).map((t: any) => t.name.toLowerCase()));

    const toInsert = NOVELUPDATES_TAGS
      .filter((tag) => !existingNames.has(tag.toLowerCase()))
      .map((name) => ({ name }));

    if (toInsert.length === 0) {
      toast.info("All tags already exist in the database.");
      setLoading(false);
      setDone(true);
      return;
    }

    // Insert in batches of 50
    const BATCH = 50;
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const { error } = await supabase.from("tags").insert(batch);
      if (error) {
        toast.error(`Error inserting batch: ${error.message}`);
        setLoading(false);
        return;
      }
      inserted += batch.length;
    }

    toast.success(`Added ${inserted} new tags from MangaUpdates!`);
    qc.invalidateQueries({ queryKey: ["tags"] });
    setLoading(false);
    setDone(true);
  };

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-border/30 bg-card/50">
      <div className="flex-1">
        <p className="text-sm font-semibold">MangaUpdates Tag Library</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Seed the database with {NOVELUPDATES_TAGS.length}+ tags sourced from MangaUpdates. Skips any that already exist.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={`gap-1.5 shrink-0 transition-all duration-300 ${
          done
            ? "border-green-500/30 text-green-400 bg-green-500/10"
            : "border-border/50 hover:border-primary/30 hover:bg-primary/5"
        }`}
        onClick={handleSeed}
        disabled={loading || done}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : done ? (
          <CheckCircle className="h-3.5 w-3.5" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {loading ? "Seeding..." : done ? "Done!" : "Seed Tags"}
      </Button>
    </div>
  );
}