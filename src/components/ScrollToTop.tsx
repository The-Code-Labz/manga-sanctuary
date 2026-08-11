import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * React Router (BrowserRouter) is an SPA — navigating never triggers a real
 * page load, so the browser keeps whatever scrollY the previous page left.
 * Without this, clicking any <Link> after scrolling down (most commonly:
 * leaving a manga reader chapter you'd scrolled deep into) lands you at the
 * same scroll offset on the new page instead of the top.
 *
 * Runs on every pathname change. MangaReader's own scroll-restore effect
 * (which resumes at a saved page, not the top) mounts after this — same
 * commit, later in the tree — so it always runs afterward and wins.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  return null;
}
