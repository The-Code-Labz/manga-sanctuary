import { useState, useEffect, useRef } from "react";
import { useChapters } from "@/hooks/use-manga";
import { useSaveChaptersBulk, useDeleteAllChapters, useUpdateChapter, useDeleteChapter, useFetchChapterContent } from "@/hooks/use-chapters-admin";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Save, Trash2, Loader2, BookOpen, AlertTriangle, Layers, Download, AlertCircle, X, RotateCw, RotateCcw, RefreshCw, ListPlus } from "lucide-react";
import ChapterAiSearch from "./ChapterAiSearch";
import ChapterManualAdd from "./ChapterManualAdd";
import ChapterBulkLinkEditor from "./ChapterBulkLinkEditor";
import ChapterListItem from "./ChapterListItem";

interface StagedChapter {
  id?: string;
  number: number;
  title: string;
  url: string;
  isNew?: boolean;
  dirty?: boolean;
  volume_number?: number | null;
  volume_title?: string | null;
  hasContent?: boolean;
}

interface AdminChapterManagerProps {
  mangaId: string;
  mangaTitle: string;
}

function groupByVolume(chapters: StagedChapter[]): Map<string, StagedChapter[]> {
  const groups = new Map<string, StagedChapter[]>();
  for (const ch of chapters) {
    const key = ch.volume_number != null
      ? `vol-${ch.volume_number}`
      : "no-volume";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ch);
  }
  return groups;
}

// "Re-fetch All" (force=true) deliberately ignores `hasContent` — it exists
// to overwrite already-saved chapters (e.g. after a scraper/stitch fix, to
// clean out chapters saved with a bad page array before the fix). Ported
// from novel-sanctuary's identical campaign-resume design: every chapter
// that succeeds during a force run is recorded here immediately, persisted
// to localStorage (survives the dialog closing/reopening), and skipped on
// the next force run — so an interrupted campaign (a blocked host, closing
// the dialog, a bad chapter) resumes on just what's still outstanding
// instead of restarting from chapter 1 and redoing everything that already
// succeeded. Cleared automatically once a force run completes with zero
// failures/skips, or manually via the reset button.
function forceRefetchProgressKey(mangaId: string) {
  return `manga-sanctuary:refetch-progress:${mangaId}`;
}
function loadForceRefetchProgress(mangaId: string): Set<string> {
  try {
    const raw = localStorage.getItem(forceRefetchProgressKey(mangaId));
    if (!raw) return new Set();
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? new Set(ids) : new Set();
  } catch {
    return new Set();
  }
}
function saveForceRefetchProgress(mangaId: string, ids: Set<string>) {
  try {
    if (ids.size === 0) {
      localStorage.removeItem(forceRefetchProgressKey(mangaId));
    } else {
      localStorage.setItem(forceRefetchProgressKey(mangaId), JSON.stringify([...ids]));
    }
  } catch { /* storage unavailable/full — worst case just falls back to no resume */ }
}

// A page-fetch failure whose reason string looks like the SOURCE HOST itself
// actively blocking/throttling us (HTTP 429/403, or a Cloudflare-style
// interstitial the plain-fetch path bailed on — see manga-chapter-content's
// `plain_fetch_challenge_page`/`plain_fetch_http_*`/`mangadex_http_*`
// reason codes) — as opposed to "this chapter just isn't scrapable"
// (`generic_no_reader_match`, `mangadex_http_404`, etc.), which retrying
// harder can never fix. Distinguishing the two matters: hammering a host
// that's already rate-limiting us at the same 1s pace just extends the
// block across every remaining chapter on it, exactly the failure mode a
// prior bulk run against a 600+ chapter manga hit with zero adaptation.
const isBlockingHostError = (msg: string) => /_http_429|_http_403|challenge_page/i.test(msg || "");

export default function AdminChapterManager({ mangaId, mangaTitle }: AdminChapterManagerProps) {
  const { data: existingChapters = [], isLoading } = useChapters(mangaId);
  const saveBulk = useSaveChaptersBulk(mangaId);
  const deleteAll = useDeleteAllChapters(mangaId);
  const updateChapter = useUpdateChapter(mangaId);
  const deleteChapter = useDeleteChapter(mangaId);
  const fetchContent = useFetchChapterContent(mangaId);

  const [staged, setStaged] = useState<StagedChapter[]>([]);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [hasVolumes, setHasVolumes] = useState(false);
  const [contentProgress, setContentProgress] = useState<{ done: number; total: number } | null>(null);
  // Persists on-screen (not just console/toast) until dismissed or a new
  // fetch run replaces it — the console.table + one-shot toast were easy to
  // miss/dismiss, which is exactly why "it just skips chapters, no errors"
  // kept coming up even though real per-chapter reasons were already being
  // captured.
  const [skipReport, setSkipReport] = useState<{ id?: string; number: number; title: string; reason: string }[] | null>(null);
  // Whether the run that produced the current skipReport was a "Re-fetch
  // All" (force) campaign — the Retry button on the panel needs to know
  // this to decide whether a successful retry should count toward the
  // persisted forceRefetchDone campaign progress.
  const [lastRunForce, setLastRunForce] = useState(false);
  // Chapter ids already successfully overwritten by a "Re-fetch All" run for
  // THIS manga — persisted to localStorage so an interrupted campaign
  // resumes instead of restarting from chapter 1 on the next click.
  const [forceRefetchDone, setForceRefetchDone] = useState<Set<string>>(() => loadForceRefetchProgress(mangaId));
  useEffect(() => {
    setForceRefetchDone(loadForceRefetchProgress(mangaId));
  }, [mangaId]);

  // Bug ported from novel-sanctuary: closing this dialog or navigating away
  // used to leave a bulk fetch run's plain async for-loop alive, still
  // firing the next sequential edge-function invocation on its own pace
  // timer, completely detached from the now-unmounted UI — only a full page
  // reload actually killed it. Each call can hit Byparr/a source CDN for
  // 10-50s+, so an unattended run left going on a large manga was a real
  // contributor to Byparr's zombie-browser overload (same disease class as
  // the isolate CPU/memory-limit incidents this app already hit). Fix: an
  // AbortController aborted on unmount, checked before every loop iteration
  // and passed through to the edge-function call.
  const fetchAbortRef = useRef(new AbortController());
  useEffect(() => {
    return () => {
      fetchAbortRef.current.abort();
    };
  }, []);

  useEffect(() => {
    if (existingChapters.length > 0 && staged.length === 0) {
      const mapped = existingChapters.map((ch) => ({
        id: ch.id,
        number: ch.chapter_number,
        title: ch.chapter_title || `Chapter ${ch.chapter_number}`,
        url: ch.external_url || "#",
        isNew: false,
        volume_number: ch.volume_number ?? null,
        volume_title: ch.volume_title ?? null,
        hasContent: Array.isArray(ch.pages) && ch.pages.length > 0,
      }));
      setStaged(mapped);
      setHasVolumes(mapped.some((c) => c.volume_number != null));
    }
  }, [existingChapters]);

  // The effect above only ever populates `staged` once (guarded so it
  // doesn't clobber in-progress local edits). That meant `hasContent`
  // badges never refreshed after Fetch Content invalidated the underlying
  // query — the DB write landed fine, but the admin UI kept showing the
  // pre-fetch state until a full page reload. Patch just the `hasContent`
  // flag in from the fresh query result whenever it changes, without
  // touching anything else the user may have staged.
  useEffect(() => {
    if (existingChapters.length === 0) return;
    const contentById = new Map(existingChapters.map((ch) => [ch.id, Array.isArray(ch.pages) && ch.pages.length > 0]));
    setStaged((prev) => {
      let changed = false;
      const next = prev.map((ch) => {
        if (!ch.id) return ch;
        const fresh = contentById.get(ch.id);
        if (fresh !== undefined && fresh !== ch.hasContent) {
          changed = true;
          return { ...ch, hasContent: fresh };
        }
        return ch;
      });
      return changed ? next : prev;
    });
  }, [existingChapters]);

  const handleAiChaptersFound = (
    chapters: { number: number; title: string; url: string; volume_number?: number | null; volume_title?: string | null }[],
    _source: string,
    aiHasVolumes?: boolean
  ) => {
    const newStaged: StagedChapter[] = chapters.map((ch) => ({
      number: ch.number,
      title: ch.title,
      url: ch.url,
      isNew: true,
      volume_number: ch.volume_number ?? null,
      volume_title: ch.volume_title ?? null,
    }));
    setStaged(newStaged);
    setHasVolumes(aiHasVolumes ?? newStaged.some((c) => c.volume_number != null));
    setHasUnsaved(true);
  };

  // Unlike handleAiChaptersFound (full replace — wipes and re-stages every
  // chapter, which handleSaveAll then deletes-all-and-reinserts, dropping
  // already-fetched pages/strip on chapters that didn't change), this only
  // appends chapters the search found that aren't already staged. Existing
  // entries (their id, hasContent, fetched pages) are left completely
  // untouched — safe to run repeatedly on an ongoing series to pick up
  // whatever the source published since the last run.
  const handleFetchNewChapters = (
    chapters: { number: number; title: string; url: string; volume_number?: number | null; volume_title?: string | null }[],
    _source: string,
  ) => {
    const existingKeys = new Set(staged.map((c) => `${c.volume_number ?? "x"}:${c.number}`));
    const fresh = chapters.filter((ch) => !existingKeys.has(`${ch.volume_number ?? "x"}:${ch.number}`));
    if (fresh.length === 0) {
      toast.info("No new chapters found — already up to date");
      return;
    }
    setStaged((prev) =>
      [
        ...prev,
        ...fresh.map((ch) => ({
          number: ch.number,
          title: ch.title,
          url: ch.url,
          isNew: true as const,
          volume_number: ch.volume_number ?? null,
          volume_title: ch.volume_title ?? null,
        })),
      ].sort((a, b) => a.number - b.number)
    );
    if (fresh.some((c) => c.volume_number != null)) setHasVolumes(true);
    setHasUnsaved(true);
    toast.success(`Found ${fresh.length} new chapter${fresh.length === 1 ? "" : "s"}`);
  };

  const handleManualAdd = (chapter: { number: number; title: string; url: string }) => {
    setStaged((prev) => {
      const exists = prev.find((c) => c.number === chapter.number && c.volume_number == null);
      if (exists) {
        toast.error(`Chapter ${chapter.number} already exists`);
        return prev;
      }
      return [...prev, { ...chapter, isNew: true, volume_number: null, volume_title: null }].sort((a, b) => a.number - b.number);
    });
    setHasUnsaved(true);
  };

  const handleBulkLinks = (baseUrl: string) => {
    // Was only updating local component state — chapters that already exist
    // in the DB (id present, not `isNew`) never got persisted by this alone,
    // since handleSaveAll only ever wrote rows flagged `isNew`. Marking them
    // `dirty` here makes Save Chapters pick them up too.
    setStaged((prev) =>
      prev.map((ch) => ({
        ...ch,
        url: baseUrl.replace("{n}", String(ch.number)).replace("{v}", String(ch.volume_number ?? "")),
        dirty: ch.id ? true : ch.dirty,
      }))
    );
    setHasUnsaved(true);
    toast.success("Links applied — click Save Chapters to persist");
  };

  const handleUpdateStaged = (index: number, title: string, url: string) => {
    setStaged((prev) => {
      const updated = [...prev];
      const ch = updated[index];
      if (ch.id) {
        updateChapter.mutate({ id: ch.id, chapter_title: title, external_url: url || null });
      }
      updated[index] = { ...ch, title, url };
      return updated;
    });
  };

  const handleFetchContent = async (index: number) => {
    const ch = staged[index];
    if (!ch.id || !ch.url || ch.url === "#") return;
    try {
      const res = await fetchContent.mutateAsync({ id: ch.id, url: ch.url });
      setStaged((prev) => prev.map((c, i) => (i === index ? { ...c, hasContent: true } : c)));
      toast.success(`Fetched ${res.page_count.toLocaleString()} pages from ${res.source}`);
    } catch (err: any) {
      toast.error(err.message || "Could not fetch chapter content");
    }
  };

  // Sequential, not parallel — Byparr/target sites will choke on a burst of
  // concurrent requests for a 600+ chapter manga, and this only needs to run
  // once per chapter (guarded by hasContent, unless force=true).
  //
  // The failure path used to be a bare `catch {}` — every skip reason (a
  // transient Byparr timeout, a genuine unsupported layout, a MangaDex 404
  // with no fallback) collapsed into the same silent count with zero trail,
  // which is exactly why "why do chapters keep getting skipped" was
  // unanswerable without clicking each one individually. Now: reasons are
  // captured per chapter, logged as a table, and failures get one automatic
  // retry pass (cheap — most of a run already succeeds on pass 1, and a
  // transient hit — a momentary Byparr blip, a slow origin CDN — is exactly
  // what a single retry recovers without re-running the whole batch).
  //
  // Ported from novel-sanctuary: a bulk run used to fire the next request
  // the instant the previous one resolved, giving Byparr's browser pool zero
  // time to release/GC a session between hits — on a large novel that
  // sustained gap-free stream wedged Byparr into a resource-exhaustion
  // spiral, and manga's own extraction pipeline has already hit CPU/memory
  // isolate kills from unbounded concurrent work. Fix: a pacing delay
  // between every request, a longer cooldown every batch, and per-host
  // block detection so a host that's actively rate-limiting/blocking us
  // (see isBlockingHostError) gets backed off instead of hammered for the
  // rest of the run.
  type FetchTarget = { ch: StagedChapter; i: number };
  type SkipEntry = { id?: string; number: number; title: string; reason: string };

  const PACE_DELAY_MS = 1000;
  const COOLDOWN_EVERY = 25;
  const COOLDOWN_MS = 6000;
  const RATE_LIMIT_HOST_THRESHOLD = 3;
  const RATE_LIMIT_BACKOFF_MS = 30_000;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const runFetchBatch = async (targets: FetchTarget[], force = false) => {
    if (targets.length === 0) {
      toast.info("Nothing to fetch");
      return;
    }
    const signal = fetchAbortRef.current.signal;
    // Shared across both passes (mutated in place, not re-read from React
    // state each pass) so a chapter recorded done in pass 1 isn't lost to
    // pass 2's stale closure — persisted+published to state after every
    // success so an interruption mid-run still leaves correct progress on
    // disk even if the run never reaches its own completion block.
    const progressSet = new Set(forceRefetchDone);

    const runPass = async (pass: FetchTarget[]): Promise<{ ok: number; failures: SkipEntry[] }> => {
      let ok = 0;
      const failures: SkipEntry[] = [];
      const blockedHosts = new Set<string>();
      const consecutiveBlockByHost = new Map<string, number>();
      for (let n = 0; n < pass.length; n++) {
        if (signal.aborted) break;
        const { ch, i } = pass[n];
        let host = "";
        try { host = new URL(ch.url).hostname; } catch { /* leave blank, treated as its own bucket */ }

        if (host && blockedHosts.has(host)) {
          failures.push({ id: ch.id, number: ch.number, title: ch.title, reason: `${host} blocked for this run — skipped, not attempted` });
          setContentProgress({ done: n + 1, total: targets.length });
          continue;
        }

        try {
          await fetchContent.mutateAsync({ id: ch.id!, url: ch.url, signal });
          if (signal.aborted) break;
          setStaged((prev) => prev.map((c, idx) => (idx === i ? { ...c, hasContent: true } : c)));
          ok++;
          if (host) consecutiveBlockByHost.set(host, 0);
          if (force && ch.id) {
            progressSet.add(ch.id);
            setForceRefetchDone(new Set(progressSet));
            saveForceRefetchProgress(mangaId, progressSet);
          }
        } catch (err: any) {
          const reason = err?.message || "Unknown error";
          failures.push({ id: ch.id, number: ch.number, title: ch.title, reason });
          if (host && isBlockingHostError(reason)) {
            const count = (consecutiveBlockByHost.get(host) ?? 0) + 1;
            consecutiveBlockByHost.set(host, count);
            if (count === 1) {
              toast.warning(`${host} looks like it's rate-limiting/blocking us — backing off before continuing.`);
            }
            if (count >= RATE_LIMIT_HOST_THRESHOLD) {
              blockedHosts.add(host);
              const remaining = pass.slice(n + 1).filter(({ ch: c }) => {
                try { return new URL(c.url).hostname === host; } catch { return false; }
              }).length;
              toast.error(`${host} is still blocking us after ${count} tries in a row — stopping requests to this host for the rest of this run (${remaining} more chapter${remaining === 1 ? "" : "s"} skipped, not lost — safe to re-run later).`);
            } else if (!signal.aborted) {
              await sleep(RATE_LIMIT_BACKOFF_MS);
            }
          }
        }
        if (signal.aborted) break;
        setContentProgress({ done: n + 1, total: targets.length });
        if (n < pass.length - 1) {
          const isCooldown = (n + 1) % COOLDOWN_EVERY === 0;
          await sleep(isCooldown ? COOLDOWN_MS : PACE_DELAY_MS);
        }
      }
      return { ok, failures };
    };

    setContentProgress({ done: 0, total: targets.length });
    const first = await runPass(targets);
    let ok = first.ok;
    let failures = first.failures;

    if (!signal.aborted && failures.length > 0) {
      const retryTargets = targets.filter(({ ch }) => failures.some((f) => f.id === ch.id || f.number === ch.number));
      const retry = await runPass(retryTargets);
      ok += retry.ok;
      failures = retry.failures; // only chapters that failed BOTH passes remain "skipped"
    }

    setContentProgress(null);
    if (signal.aborted) return;

    setLastRunForce(force);
    if (force && failures.length === 0) {
      // Campaign genuinely finished clean — nothing left to resume, so
      // there's no reason to keep the (now dead) progress record around.
      setForceRefetchDone(new Set());
      saveForceRefetchProgress(mangaId, new Set());
    }

    if (failures.length > 0) {
      console.table(failures.map((f) => ({ chapter: f.number, title: f.title, reason: f.reason })));
      setSkipReport(failures);
      const resumeHint = force ? ` Progress saved — click "Re-fetch All" again to resume just what's still outstanding.` : "";
      toast.warning(
        `Fetched content for ${ok}/${targets.length} chapters (${failures.length} skipped after retry — see panel below).${resumeHint}`,
      );
    } else {
      setSkipReport(null);
      toast.success(`Fetched content for ${ok}/${targets.length} chapters`);
    }
  };

  const handleFetchAllContent = async () => {
    const targets = staged
      .map((ch, i) => ({ ch, i }))
      .filter(({ ch }) => ch.id && ch.url && ch.url !== "#" && !ch.hasContent);
    if (targets.length === 0) {
      toast.info("Every chapter with a link already has content fetched");
      return;
    }
    setSkipReport(null); // a fresh run replaces whatever the last one reported
    await runFetchBatch(targets, false);
  };

  // Overwrites content for EVERY linked chapter regardless of hasContent —
  // for picking up a scraper/stitch pipeline fix on chapters that already
  // have (now-outdated) pages saved. Resumable via forceRefetchDone: an
  // interrupted run only re-attempts what this campaign hasn't already
  // redone, instead of restarting from chapter 1 every click.
  const handleForceRefetchAll = async () => {
    const targets = staged
      .map((ch, i) => ({ ch, i }))
      .filter(({ ch }) => ch.id && ch.url && ch.url !== "#" && !forceRefetchDone.has(ch.id!));
    if (targets.length === 0) {
      if (forceRefetchDone.size > 0) {
        toast.info(`Every chapter was already re-fetched in this run — click the reset button next to "Re-fetch All" if you want to force a truly from-scratch overwrite.`);
      } else {
        toast.info("No linked chapters to re-fetch");
      }
      return;
    }
    if (!confirm(
      `Re-fetch and overwrite content for ${targets.length} chapter${targets.length === 1 ? "" : "s"}` +
      `${forceRefetchDone.size > 0 ? ` (resuming — ${forceRefetchDone.size} already done in this run are skipped)` : ""}? This replaces any already-saved pages/strip.`
    )) {
      return;
    }
    setSkipReport(null);
    await runFetchBatch(targets, true);
  };

  const handleResetForceRefetchProgress = () => {
    if (forceRefetchDone.size === 0) return;
    if (!confirm(`Discard resume progress for ${forceRefetchDone.size} chapter${forceRefetchDone.size === 1 ? "" : "s"} already re-fetched in this campaign? The next "Re-fetch All" will overwrite every chapter again, including those.`)) {
      return;
    }
    setForceRefetchDone(new Set());
    saveForceRefetchProgress(mangaId, new Set());
  };

  const handleRetrySkipped = async () => {
    if (!skipReport || skipReport.length === 0) return;
    const targets = skipReport
      .map((f) => {
        const idx = staged.findIndex((c) => (f.id ? c.id === f.id : c.number === f.number));
        return idx >= 0 ? { ch: staged[idx], i: idx } : null;
      })
      .filter((t): t is FetchTarget => t !== null);
    if (targets.length === 0) {
      toast.info("Nothing to retry");
      return;
    }
    await runFetchBatch(targets, lastRunForce);
  };

  const handleDeleteStaged = (index: number) => {
    const ch = staged[index];
    if (ch.id) deleteChapter.mutate(ch.id);
    setStaged((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveAll = async () => {
    // "New" = not yet in the DB (from AI search / manual add). "Dirty" =
    // already in the DB but edited locally since (e.g. bulk link pattern
    // applied) without going through the per-row auto-save path. Both need
    // to be written on Save Chapters — previously only `isNew` did anything,
    // which is why bulk-applied links on already-saved chapters silently
    // never persisted unless you re-ran AI search or manually re-added them.
    const newChapters = staged.filter((ch) => ch.isNew);
    const dirtyExisting = staged.filter((ch) => ch.dirty && !ch.isNew && ch.id);
    if (newChapters.length === 0 && dirtyExisting.length === 0) {
      toast.info("No changes to save");
      return;
    }

    const allNew = staged.length > 0 && staged.every((ch) => ch.isNew);
    if (allNew && existingChapters.length > 0) {
      await deleteAll.mutateAsync();
    }

    const toSave = allNew ? newChapters : [...newChapters, ...dirtyExisting];

    saveBulk.mutate(
      toSave.map((ch) => ({
        id: ch.isNew ? undefined : ch.id,
        chapter_number: ch.number,
        chapter_title: ch.title,
        external_url: ch.url === "#" ? null : ch.url,
        ...(ch.isNew ? { release_date: new Date().toISOString() } : {}),
        volume_number: ch.volume_number ?? null,
        volume_title: ch.volume_title ?? null,
      })),
      {
        onSuccess: () => {
          toast.success(`${toSave.length} chapter${toSave.length === 1 ? "" : "s"} saved!`);
          setHasUnsaved(false);
          setStaged((prev) => prev.map((ch) => ({ ...ch, isNew: false, dirty: false })));
        },
        onError: (err: any) => toast.error(err.message),
      }
    );
  };

  const handleClearAll = () => {
    if (!confirm("Remove all chapters? This will delete them from the database too.")) return;
    deleteAll.mutate(undefined, {
      onSuccess: () => {
        setStaged([]);
        setHasUnsaved(false);
        setHasVolumes(false);
        // Stale otherwise — those chapter ids no longer exist, so a future
        // "Re-fetch All" resume check against them would just be dead
        // weight (harmless, but no reason to leave it around).
        setForceRefetchDone(new Set());
        saveForceRefetchProgress(mangaId, new Set());
        toast.success("All chapters removed");
      },
      onError: (err: any) => toast.error(err.message),
    });
  };

  if (isLoading) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
        Loading chapters...
      </div>
    );
  }

  const groups = groupByVolume(staged);
  const volumeKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "no-volume") return -1;
    if (b === "no-volume") return 1;
    return parseInt(a.replace("vol-", "")) - parseInt(b.replace("vol-", ""));
  });

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border/30">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">{staged.length} chapters</span>
        </div>
        {hasVolumes && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
            <Layers className="h-4 w-4 text-violet-400" />
            <span className="text-sm font-semibold text-violet-400">{volumeKeys.filter(k => k !== "no-volume").length} volumes</span>
          </div>
        )}
        {hasUnsaved && (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-golden/10 border border-golden/20">
            <AlertTriangle className="h-3.5 w-3.5 text-golden" />
            <span className="text-xs font-semibold text-golden">Unsaved changes</span>
          </div>
        )}
      </div>

      {/* Actions row */}
      <div className="flex flex-wrap gap-2">
        <ChapterAiSearch mangaTitle={mangaTitle} onChaptersFound={handleAiChaptersFound} />
        {staged.length > 0 && (
          <ChapterAiSearch
            mangaTitle={mangaTitle}
            onChaptersFound={handleFetchNewChapters}
            label="Fetch New Chapters"
            icon={ListPlus}
          />
        )}
        {staged.length > 0 && (
          <>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 gradient-neon border-0 text-white"
              onClick={handleSaveAll}
              disabled={saveBulk.isPending || !hasUnsaved}
            >
              {saveBulk.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Chapters
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
              onClick={handleFetchAllContent}
              disabled={!!contentProgress}
              title="Scrape chapter text so readers stay in-app instead of leaving to the source site"
            >
              {contentProgress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {contentProgress ? `Fetching ${contentProgress.done}/${contentProgress.total}...` : "Fetch Missing Content"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
              onClick={handleForceRefetchAll}
              disabled={!!contentProgress}
              title={
                forceRefetchDone.size > 0
                  ? `Resume — ${forceRefetchDone.size} chapter${forceRefetchDone.size === 1 ? "" : "s"} already re-fetched in this campaign will be skipped, only what's still outstanding gets attempted`
                  : "Re-scrape and overwrite content for every linked chapter, including ones already fetched"
              }
            >
              {contentProgress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {contentProgress
                ? `Fetching ${contentProgress.done}/${contentProgress.total}...`
                : forceRefetchDone.size > 0
                ? `Resume Re-fetch (${forceRefetchDone.size} done)`
                : "Re-fetch All"}
            </Button>
            {forceRefetchDone.size > 0 && !contentProgress && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                title="Discard resume progress — the next Re-fetch All will overwrite every chapter from scratch again"
                onClick={handleResetForceRefetchProgress}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={handleClearAll}
              disabled={deleteAll.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear All
            </Button>
          </>
        )}
      </div>

      {/* Skip report — persists until dismissed or replaced by the next run,
          unlike the console.table/toast which are easy to miss. */}
      {skipReport && skipReport.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              <span className="text-sm font-semibold text-destructive">
                {skipReport.length} chapter{skipReport.length === 1 ? "" : "s"} skipped — no content fetched
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={handleRetrySkipped}
                disabled={!!contentProgress}
              >
                {contentProgress ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                Retry
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground"
                onClick={() => setSkipReport(null)}
                title="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <ScrollArea className="max-h-40">
            <div className="space-y-1 pr-2">
              {skipReport.map((f) => (
                <div
                  key={f.id || f.number}
                  className="flex items-start gap-2 py-1 text-xs border-b border-destructive/10 last:border-0"
                >
                  <span className="font-mono text-destructive/80 shrink-0">Ch. {f.number}</span>
                  <span className="text-muted-foreground truncate flex-1 min-w-0">{f.title}</span>
                  <span className="text-destructive/70 text-right shrink-0 max-w-[50%]">{f.reason}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Bulk link editor */}
      {staged.length > 0 && (
        <ChapterBulkLinkEditor onApply={handleBulkLinks} />
      )}

      {/* Manual add */}
      <ChapterManualAdd
        nextNumber={staged.filter(c => c.volume_number == null).length > 0
          ? Math.max(...staged.filter(c => c.volume_number == null).map((c) => c.number)) + 1
          : 1}
        onAdd={handleManualAdd}
      />

      {/* Chapter list — grouped by volume if applicable */}
      {staged.length > 0 ? (
        <ScrollArea className="h-[450px] rounded-xl border border-border/30 bg-card/30 p-2">
          <div className="space-y-1">
            {hasVolumes ? (
              volumeKeys.map((key) => {
                const volChapters = groups.get(key)!;
                const firstCh = volChapters[0];
                const volNum = firstCh.volume_number;
                const volTitle = firstCh.volume_title;
                const globalIndices = volChapters.map((ch) => staged.indexOf(ch));

                return (
                  <div key={key} className="space-y-0.5">
                    {/* Volume header */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 sticky top-0 z-10">
                      <Layers className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                      <span className="text-xs font-bold text-violet-400">
                        {volNum != null ? `Volume ${volNum}` : "Chapters"}
                        {volTitle ? ` — ${volTitle}` : ""}
                      </span>
                      <span className="text-[10px] text-violet-400/60 ml-auto">{volChapters.length} ch.</span>
                    </div>
                    {/* Chapters in this volume */}
                    {volChapters.map((ch, localIdx) => {
                      const globalIdx = globalIndices[localIdx];
                      return (
                        <ChapterListItem
                          key={`${ch.volume_number}-${ch.number}-${localIdx}`}
                          number={ch.number}
                          title={ch.title}
                          url={ch.url}
                          hasContent={ch.hasContent}
                          fetchingContent={fetchContent.isPending}
                          onUpdate={(title, url) => handleUpdateStaged(globalIdx, title, url)}
                          onDelete={() => handleDeleteStaged(globalIdx)}
                          onFetchContent={ch.id ? () => handleFetchContent(globalIdx) : undefined}
                        />
                      );
                    })}
                  </div>
                );
              })
            ) : (
              staged.map((ch, i) => (
                <ChapterListItem
                  key={`${ch.number}-${i}`}
                  number={ch.number}
                  title={ch.title}
                  url={ch.url}
                  hasContent={ch.hasContent}
                  fetchingContent={fetchContent.isPending}
                  onUpdate={(title, url) => handleUpdateStaged(i, title, url)}
                  onDelete={() => handleDeleteStaged(i)}
                  onFetchContent={ch.id ? () => handleFetchContent(i) : undefined}
                />
              ))
            )}
          </div>
        </ScrollArea>
      ) : (
        <div className="text-center py-12 rounded-xl border border-border/30 bg-card/30">
          <BookOpen className="h-8 w-8 text-primary/15 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No chapters yet. Use AI search or add manually.</p>
        </div>
      )}
    </div>
  );
}