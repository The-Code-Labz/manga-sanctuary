// Self-draining admin action: repeatedly calls the manga-api
// /admin/rehost-mangadex-covers batch endpoint until no rows with a raw
// uploads.mangadex.org cover_url remain (or a safety iteration cap is hit),
// so a single click fully clears the backlog instead of requiring repeated
// manual re-triggers.
import { useState } from "react";
import { mangaApiAdminFetch, MangaApiAdminError } from "@/lib/manga-api-admin";
import { Button } from "@/components/ui/button";
import { ImageDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface RehostBatchResponse {
  scanned: number;
  rehosted: number;
  failed: number;
  remaining: number;
  results: { id: string; ok: boolean }[];
}

const BATCH_LIMIT = 25;
const MAX_ITERATIONS = 200; // safety cap: 200 * 25 = 5000 rows max per click

export default function CoverRehostBackfill() {
  const [running, setRunning] = useState(false);
  const [totals, setTotals] = useState<{ rehosted: number; failed: number; remaining: number | null }>({
    rehosted: 0,
    failed: 0,
    remaining: null,
  });

  const run = async () => {
    setRunning(true);
    setTotals({ rehosted: 0, failed: 0, remaining: null });
    let rehosted = 0;
    let failed = 0;
    let remaining = 0;
    let iterations = 0;

    try {
      // Prime `remaining` before the loop so the UI shows the real backlog
      // size even if the first batch happens to scan 0 (e.g. already clear).
      while (iterations < MAX_ITERATIONS) {
        iterations++;
        const batch = await mangaApiAdminFetch<RehostBatchResponse>("/admin/rehost-mangadex-covers", {
          method: "POST",
          query: { limit: BATCH_LIMIT },
        });
        rehosted += batch.rehosted;
        failed += batch.failed;
        remaining = batch.remaining;
        setTotals({ rehosted, failed, remaining });

        if (batch.scanned === 0 || remaining === 0) break;
      }

      if (remaining > 0) {
        toast.warning(`Stopped after ${iterations} batches — ${remaining} row(s) still remain. Click again to continue.`);
      } else {
        toast.success(`Done — rehosted ${rehosted} cover(s)${failed ? `, ${failed} failed` : ""}. No MangaDex-hosted covers remain.`);
      }
    } catch (err) {
      toast.error(err instanceof MangaApiAdminError ? err.message : "Rehost backfill failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-4 rounded-xl bg-card/50 border border-border/30 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h3 className="text-sm font-bold flex items-center gap-2">
          <ImageDown className="h-4 w-4 text-primary" /> Rehost MangaDex Covers
        </h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-md">
          Finds every manga still pointing <code className="text-[11px]">cover_url</code> at{" "}
          <code className="text-[11px]">uploads.mangadex.org</code> (renders as a placeholder in-browser),
          re-fetches the image server-side, and re-hosts it in Storage. Runs in batches of {BATCH_LIMIT}
          until the backlog is clear.
        </p>
        {totals.remaining !== null && (
          <p className="text-xs mt-2">
            <span className="text-green-400 font-semibold">{totals.rehosted} rehosted</span>
            {totals.failed > 0 && <span className="text-destructive font-semibold ml-2">{totals.failed} failed</span>}
            <span className="text-muted-foreground ml-2">· {totals.remaining} remaining</span>
          </p>
        )}
      </div>
      <Button onClick={run} disabled={running} size="sm" className="shrink-0">
        {running ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ImageDown className="h-4 w-4 mr-1.5" />}
        {running ? "Rehosting…" : "Run Backfill"}
      </Button>
    </div>
  );
}
