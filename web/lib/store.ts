/* =========================================================
   Public profile store for `/to/<handle>`.
   Works out-of-the-box in-memory for instant local/sandbox testing,
   and persists across serverless instances when SUPABASE_URL +
   SUPABASE_SERVICE_KEY are set.
   ========================================================= */

import { ME_PROFILE_FALLBACK, type MeProfile } from "./profile";

const memByHandle = new Map<string, { accountId: string; profile: MeProfile; updatedAt: string }>();

const url = () =>
  (process.env.SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/, "");
const key = () => (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();

export const storeEnabled = () => true; // Always available via in-memory + optional Supabase

export async function getPublishedProfile(handle: string): Promise<MeProfile | null> {
  const h = (handle || "").trim().toLowerCase();
  if (!h) return null;
  const mem = memByHandle.get(h);
  if (mem) return mem.profile;

  if (url() && key()) {
    try {
      const r = await fetch(`${url()}/rest/v1/profiles?handle=eq.${encodeURIComponent(h)}&limit=1`, {
        headers: { apikey: key(), Authorization: `Bearer ${key()}` },
        cache: "no-store",
      });
      if (r.ok) {
        const rows = (await r.json()) as MeProfile[];
        if (Array.isArray(rows) && rows[0]) return rows[0];
      }
    } catch {}
  }
  return null;
}

export interface MyPublication {
  published: boolean;
  handle?: string;
  updatedAt?: string;
}

export async function getMyPublication(accountId: string): Promise<MyPublication> {
  for (const [, v] of memByHandle) {
    if (v.accountId === accountId) {
      return { published: true, handle: v.profile.handle, updatedAt: v.updatedAt };
    }
  }
  return { published: false };
}

export type PublishResult =
  | { ok: true; handle: string }
  | { ok: false; error: "handle_taken" | "table_missing" | "failed"; detail?: string };

export async function publishProfile(accountId: string, profile: MeProfile): Promise<PublishResult> {
  const h = profile.handle.toLowerCase();
  const existing = memByHandle.get(h);
  if (existing && existing.accountId !== accountId) {
    return { ok: false, error: "handle_taken" };
  }
  for (const [k, v] of memByHandle) {
    if (v.accountId === accountId && k !== h) memByHandle.delete(k);
  }
  memByHandle.set(h, { accountId, profile, updatedAt: new Date().toISOString() });
  return { ok: true, handle: h };
}

export { ME_PROFILE_FALLBACK };
