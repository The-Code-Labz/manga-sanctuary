import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePwaInstall } from "@/hooks/use-pwa-install";

const DISMISS_KEY = "manga-sanctuary:pwa-install-dismissed-at";
const DISMISS_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // re-offer after 14 days

function wasRecentlyDismissed() {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_SNOOZE_MS;
}

/**
 * Bottom install banner. Uses the native `beforeinstallprompt` flow on
 * Android/Chrome/Edge/desktop; falls back to manual "Add to Home Screen"
 * instructions on iOS Safari, which never fires that event.
 */
export default function InstallPrompt() {
  const { canInstall, promptInstall, isIOS, isStandalone } = usePwaInstall();
  const [dismissed, setDismissed] = useState(wasRecentlyDismissed);

  useEffect(() => {
    // Re-check on mount in case localStorage was cleared/updated in another tab.
    setDismissed(wasRecentlyDismissed());
  }, []);

  if (isStandalone || dismissed) return null;
  if (!canInstall && !isIOS) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted" || outcome === "dismissed") {
      // Either way the native prompt was resolved — don't nag again immediately.
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      setDismissed(true);
    }
  };

  return (
    <Card className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 border-primary/30 bg-card/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:inset-x-auto sm:right-4 sm:w-96">
      <img src="/pwa-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">Install Manga Sanctuary</p>
        {canInstall ? (
          <p className="text-xs text-muted-foreground">Add to your home screen for offline reading.</p>
        ) : (
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            Tap <Share className="inline h-3.5 w-3.5" /> Share, then{" "}
            <SquarePlus className="inline h-3.5 w-3.5" /> "Add to Home Screen".
          </p>
        )}
      </div>
      {canInstall && (
        <Button size="sm" onClick={handleInstall} className="shrink-0 gap-1.5">
          <Download className="h-4 w-4" />
          Install
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
      >
        <X className="h-4 w-4" />
      </Button>
    </Card>
  );
}
