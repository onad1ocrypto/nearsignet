/* =========================================================
   Public profile store for `/to/<handle>`.

   Two backends, same API:
   - in-memory  (default, zero setup): survives one serverless instance only,
                so a published handle can disappear on a cold start.
   - Supabase   (when SUPABASE_URL + SUPABASE_SERVICE_KEY are set): durable,
                shared by every instance. Table: public.profiles (see docs/SUPABASE.md).
   The escrow/money path never touches this file — it lives on the NEAR contract.
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
/** True when the durable backend is configured (used by the UI to name the real backend). */
export const durableStore = () => Boolean(url() && key());

const TABLE = "profiles";

function supaHeaders(extra?: Record<string, string>): Record<string, string> {
  const k = key();
  return {
    apikey: k,
    Authorization: `Bearer ${k}`,
    "Content-Type": "application/json",
    ...(extra || {}),
  };
}

/** Rows are stored as (handle, account_id, profile jsonb); accept a flat row too. */
function rowToProfile(row: unknown): MeProfile | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const p = (r.profile ?? r) as MeProfile;
  return p && typeof p === "object" ? p : null;
}

export async function getPublishedProfile(handle: string): Promise<MeProfile | null> {
  const h = (handle || "").trim().toLowerCase();
  if (!h) return null;

  if (durableStore()) {
    try {
      const r = await fetch(
        `${url()}/rest/v1/${TABLE}?handle=eq.${encodeURIComponent(h)}&select=profile&limit=1`,
        { headers: supaHeaders(), cache: "no-store" }
      );
      if (r.ok) {
        const rows = (await r.json()) as unknown[];
        const p = Array.isArray(rows) ? rowToProfile(rows[0]) : null;
        if (p) return p;
      }
    } catch {}
  }

  const mem = memByHandle.get(h);
  return mem ? mem.profile : null;
}

export interface MyPublication {
  published: boolean;
  handle?: string;
  updatedAt?: string;
}

export async function getMyPublication(accountId: string): Promise<MyPublication> {
  if (durableStore()) {
    try {
      const r = await fetch(
        `${url()}/rest/v1/${TABLE}?account_id=eq.${encodeURIComponent(accountId)}&select=handle,updated_at&limit=1`,
        { headers: supaHeaders(), cache: "no-store" }
      );
      if (r.ok) {
        const rows = (await r.json()) as { handle?: string; updated_at?: string }[];
        if (Array.isArray(rows) && rows[0]?.handle) {
          return { published: true, handle: rows[0].handle, updatedAt: rows[0].updated_at };
        }
      }
    } catch {}
  }
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

  if (durableStore()) {
    try {
      // A handle belongs to one account; check before overwriting someone else's page.
      const check = await fetch(
        `${url()}/rest/v1/${TABLE}?handle=eq.${encodeURIComponent(h)}&select=account_id&limit=1`,
        { headers: supaHeaders(), cache: "no-store" }
      );
      if (check.ok) {
        const rows = (await check.json()) as { account_id?: string }[];
        const owner = rows?.[0]?.account_id;
        if (owner && owner !== accountId) return { ok: false, error: "handle_taken" };
      }

      const write = await fetch(`${url()}/rest/v1/${TABLE}?on_conflict=handle`, {
        method: "POST",
        headers: supaHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify([{ handle: h, account_id: accountId, profile, updated_at: new Date().toISOString() }]),
      });
      if (write.ok) {
        memByHandle.set(h, { accountId, profile, updatedAt: new Date().toISOString() });
        return { ok: true, handle: h };
      }
      // 404 / 42P01 = the table has not been created yet; say so instead of "failed".
      if (write.status === 404 || /42P01|does not exist/i.test(await write.text().catch(() => ""))) {
        return { ok: false, error: "table_missing", detail: "Run the SQL in docs/SUPABASE.md" };
      }
      return { ok: false, error: "failed", detail: `supabase ${write.status}` };
    } catch (e) {
      return { ok: false, error: "failed", detail: e instanceof Error ? e.message : "network" };
    }
  }

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
