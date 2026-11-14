"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { lsGet, lsRemove, lsSet } from "./safeStorage";
import {
  cleanHandle,
  ME_PROFILE_FALLBACK,
  sanitizeProfile,
  type MePortfolioItem,
  type MeProfile,
  type MeSocials,
} from "./profile";
import { NEAR_CONTRACT_ID } from "./near";
import {
  connectNearBrowserWallet,
  disconnectNearBrowserWallet,
  getActiveWalletAccount,
  walletSessionHint,
  type SupportedWalletId,
} from "./wallet";

export { countryName, hostOf, locationOf, maskAccount, maskId, MAX_PORTFOLIO, normalizeUrl, SOCIAL_KEYS } from "./profile";
export type { MePortfolioItem, MeProfile, MeSocials, SocialKey } from "./profile";

export const ME_COLOR = "var(--mint-l)";
export const ME_DEFAULT: MeProfile = ME_PROFILE_FALLBACK;

export interface NearIdentity {
  accountId: string;
  network: string;
  balanceNear: string;
  verifiedOnChain: boolean;
}

export interface Session {
  mode: "guest" | "near";
  near?: NearIdentity;
}

const PROFILES_KEY = "nearsignet.profiles";
const GUEST_ACTIVE_KEY = "nearsignet.guest.active";
const keyOf = (id: string) => `${PROFILES_KEY}.${id}`;
const identityOf = (s: Session) => (s.mode === "near" && s.near ? `near.${s.near.accountId}` : "guest");

export function profileFromNear(n: NearIdentity): MeProfile {
  const base = n.accountId.replace(/\.(testnet|near)$/i, "");
  const pretty = base
    .split(/[-_.]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
  return {
    name: pretty || n.accountId,
    handle: cleanHandle(base) || "builder",
    nearAccount: n.accountId,
    city: "",
    country: "ID",
    bio: `Verified NEAR ${n.network} account (${n.accountId}). Escrows lock in ${NEAR_CONTRACT_ID} and settle directly on-chain.`,
    tags: ["Web3 Design", "Motion", "Smart Contracts"],
  };
}

function readProfile(session: Session): MeProfile {
  const fallback = session.mode === "near" && session.near ? profileFromNear(session.near) : ME_DEFAULT;
  if (typeof window === "undefined") return fallback;
  try {
    const raw = lsGet(keyOf(identityOf(session)));
    if (raw) return sanitizeProfile(JSON.parse(raw), fallback);
  } catch {
    /* private mode -> defaults */
  }
  return fallback;
}

interface Ctx {
  me: MeProfile;
  setMe: (p: MeProfile) => void;
  updateMe: (patch: Partial<MeProfile>) => void;
  resetMe: () => void;
  session: Session;
  sessionReady: boolean;
  signedIn: boolean;
  walletConnected: boolean;
  walletId: string | null;
  connectWallet: (walletId: SupportedWalletId, successUrl?: string) => Promise<{ ok: boolean; redirected?: boolean; error?: string }>;
  connectNearAccount: (accountId: string) => Promise<{ ok: boolean; error?: string }>;
  connectNear: (accountId: string) => Promise<{ ok: boolean; error?: string }>;
  signInAsGuest: () => Promise<void>;
  startGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  justSignedOut: boolean;
  clearJustSignedOut: () => void;
}

const MeCtx = createContext<Ctx | null>(null);

async function endServerSession(): Promise<void> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    await fetch("/api/auth/signout", { method: "POST", cache: "no-store", signal: ctl.signal });
    clearTimeout(t);
  } catch {}
}

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<MeProfile>(ME_DEFAULT);
  const [session, setSession] = useState<Session>({ mode: "guest" });
  const [guestActive, setGuestActive] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [justSignedOut, setJustSignedOut] = useState(false);

  const connectNearAccount = useCallback(async (accountId: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const r = await fetch("/api/auth/near", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: accountId.trim().toLowerCase() }),
      });
      const j = (await r.json()) as { ok?: boolean; session?: Session; error?: string };
      if (!r.ok || !j.ok || !j.session) {
        return { ok: false, error: j.error || "Could not verify NEAR account" };
      }
      setGuestActive(false);
      setSession(j.session);
      setMeState(readProfile(j.session));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Network error" };
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      // 1. Check if a real browser NEAR wallet (Meteor / Nightly) is connected!
      const activeWallet = await getActiveWalletAccount();
      if (alive && activeWallet?.accountId) {
        setWalletConnected(true);
        setWalletId(activeWallet.walletId);
        const synced = await connectNearAccount(activeWallet.accountId);
        if (synced.ok && alive) {
          setSessionReady(true);
          return;
        }
      }

      // 1b. A browser wallet can report its session slightly later than first paint
      // (extension injects after hydration). Re-probe a few times so a refresh never
      // drops a live wallet session and forces a re-connect mid-payment.
      if (!activeWallet?.accountId && walletSessionHint()) {
        for (let i = 0; i < 5 && alive; i++) {
          await new Promise((r) => setTimeout(r, 600));
          const late = await getActiveWalletAccount();
          if (late?.accountId) {
            setWalletConnected(true);
            setWalletId(late.walletId);
            const synced = await connectNearAccount(late.accountId);
            if (synced.ok && alive) {
              setSessionReady(true);
              return;
            }
            break;
          }
        }
      }

      // 2. Otherwise check server session cookie or Sandbox flag
      let s: Session = { mode: "guest" };
      try {
        const r = await fetch("/api/auth/session", { cache: "no-store" });
        if (r.ok) s = (await r.json()) as Session;
      } catch {}
      if (!alive) return;
      const explicitGuest = s.mode === "guest" && lsGet(GUEST_ACTIVE_KEY) === "1";
      setSession(s);
      setGuestActive(explicitGuest);
      setMeState(readProfile(s));
      setSessionReady(true);
    })();
    return () => { alive = false; };
  }, [connectNearAccount]);

  const setMe = useCallback(
    (p: MeProfile) => {
      setMeState(p);
      try {
        lsSet(keyOf(identityOf(session)), JSON.stringify(p));
      } catch {}
    },
    [session]
  );

  const updateMe = useCallback(
    (patch: Partial<MeProfile>) => {
      setMeState((prev) => {
        const next = sanitizeProfile({ ...prev, ...patch }, prev);
        try {
          lsSet(keyOf(identityOf(session)), JSON.stringify(next));
        } catch {}
        void fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        }).catch(() => {});
        return next;
      });
    },
    [session]
  );

  const resetMe = useCallback(() => {
    const def = session.mode === "near" && session.near ? profileFromNear(session.near) : ME_DEFAULT;
    setMe(def);
  }, [session, setMe]);

  const connectWallet = useCallback(
    async (wId: SupportedWalletId, successUrl?: string): Promise<{ ok: boolean; redirected?: boolean; error?: string }> => {
      try {
        const out = await connectNearBrowserWallet(wId, successUrl);
        if (out.accountId) {
          setWalletConnected(true);
          setWalletId(wId);
          const res = await connectNearAccount(out.accountId);
          return res;
        }
        return { ok: true, redirected: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Wallet connection cancelled" };
      }
    },
    [connectNearAccount]
  );

  const signOut = useCallback(async () => {
    await disconnectNearBrowserWallet();
    await endServerSession();
    try {
      lsRemove(GUEST_ACTIVE_KEY);
      lsRemove(keyOf("guest"));
    } catch {}
    setWalletConnected(false);
    setWalletId(null);
    setGuestActive(false);
    setSession({ mode: "guest" });
    setMeState(ME_DEFAULT);
    setJustSignedOut(true);
  }, []);

  const signInAsGuest = useCallback(async () => {
    await disconnectNearBrowserWallet();
    await endServerSession();
    try {
      lsSet(GUEST_ACTIVE_KEY, "1");
    } catch {}
    setWalletConnected(false);
    setWalletId(null);
    setGuestActive(true);
    setSession({ mode: "guest" });
    setMeState(readProfile({ mode: "guest" }));
  }, []);

  const clearJustSignedOut = useCallback(() => setJustSignedOut(false), []);
  const signedIn = session.mode === "near" || guestActive;

  const value = useMemo<Ctx>(
    () => ({
      me,
      setMe,
      updateMe,
      resetMe,
      session,
      sessionReady,
      signedIn,
      walletConnected,
      walletId,
      connectWallet,
      connectNearAccount,
      connectNear: connectNearAccount,
      signInAsGuest,
      startGuest: signInAsGuest,
      signOut,
      justSignedOut,
      clearJustSignedOut,
    }),
    [
      me,
      setMe,
      updateMe,
      resetMe,
      session,
      sessionReady,
      signedIn,
      walletConnected,
      walletId,
      connectWallet,
      connectNearAccount,
      signInAsGuest,
      signOut,
      justSignedOut,
      clearJustSignedOut,
    ]
  );
  return <MeCtx.Provider value={value}>{children}</MeCtx.Provider>;
}

export function useMe() {
  const ctx = useContext(MeCtx);
  if (!ctx) throw new Error("useMe must be used inside <MeProvider>");
  return ctx;
}

export function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "NS";
  const a = w[0][0] ?? "";
  const b = w.length > 1 ? w[w.length - 1][0] ?? "" : "";
  return (a + b).toUpperCase() || "NS";
}
