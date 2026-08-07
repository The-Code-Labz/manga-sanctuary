import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";

/**
 * Registers the service worker and surfaces update/offline-ready state via
 * toast — keeps the SW lifecycle out of App.tsx and easy to reason about.
 */
export default function PwaUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Poll for a new service worker periodically so long-lived tabs still get updates.
      if (!registration) return;
      setInterval(() => {
        registration.update().catch(() => {});
      }, 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    toast("Update available", {
      description: "A new version of Manga Sanctuary is ready.",
      duration: Infinity,
      action: {
        label: "Reload",
        onClick: () => updateServiceWorker(true),
      },
      onDismiss: () => setNeedRefresh(false),
    });
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  useEffect(() => {
    if (!offlineReady) return;
    toast.success("Ready to work offline", {
      description: "Previously viewed manga will load without a connection.",
    });
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady]);

  return null;
}
