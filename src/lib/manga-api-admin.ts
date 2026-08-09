// Thin fetch wrapper for the /admin/* routes on the public `manga-api` edge
// function. Deliberately NOT using supabase.functions.invoke() — those
// routes are path-based (e.g. /admin/keys/:id) and need real HTTP methods
// (GET/DELETE), which invoke() doesn't cleanly support. Auth here is the
// caller's own Supabase session JWT (auto-attached below), verified
// server-side against manga_sanctuary.user_roles — same admin check every
// other admin action in this app relies on, just enforced inside the edge
// function instead of via RLS.

import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCTION_BASE = `${SUPABASE_URL}/functions/v1/manga-sanctuary-manga-api`;

export class MangaApiAdminError extends Error {}

export async function mangaApiAdminFetch<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Record<string, string | number> } = {},
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new MangaApiAdminError("Not signed in");

  const url = new URL(`${FUNCTION_BASE}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new MangaApiAdminError(json?.error || `Request failed (${res.status})`);
  return json as T;
}
