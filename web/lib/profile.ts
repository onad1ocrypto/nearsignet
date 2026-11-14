/* =========================================================
   Pure profile helpers — shared by browser (lib/me.tsx) and server (API routes).
   ========================================================= */

export interface MeSocials {
  x?: string;
  linkedin?: string;
  instagram?: string;
  website?: string;
}

export interface MePortfolioItem {
  label?: string;
  url?: string;
  title?: string;
  link?: string;
  note?: string;
}

export interface MeProfile {
  name: string;
  handle: string;
  nearAccount: string;
  city: string;
  country: string;
  bio: string;
  tags: string[];
  photo?: string;
  socials?: MeSocials;
  portfolio?: MePortfolioItem[];
}

export const MAX_PORTFOLIO = 6;
export const SOCIAL_KEYS = ["x", "linkedin", "instagram", "website"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];

export function maskAccount(acct: string): string {
  const s = (acct || "").trim();
  if (s.length <= 22) return s;
  return `${s.slice(0, 10)}…${s.slice(-8)}`;
}

export function maskId(id: string): string {
  const alnum = (id || "").replace(/[^A-Za-z0-9]/g, "");
  return alnum.length > 4 ? `…${alnum.slice(-8)}` : "•••";
}

export function normalizeUrl(raw: string): string {
  const v = (raw || "").trim();
  if (!v) return "";
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    if (!u.hostname.includes(".")) return "";
    return u.toString();
  } catch {
    return "";
  }
}

export function countryName(code: string, locale = "en"): string {
  const c = (code || "").trim().toUpperCase();
  if (!c) return "";
  try {
    const dn = new Intl.DisplayNames([locale], { type: "region" });
    return dn.of(c) || c;
  } catch {
    return c;
  }
}

export function locationOf(p: { city?: string; country?: string }, locale = "en"): string {
  const city = (p.city || "").trim();
  if (city) return city;
  return countryName(p.country || "", locale);
}

export function hostOf(url?: string): string {
  if (!url) {
    return typeof window !== "undefined" && window.location?.host ? window.location.host : "nearsignet.app";
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function cleanHandle(raw: string): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/\.(testnet|near)$/i, "")
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function cleanNearAccount(raw: string, fallback: string): string {
  const v = (raw || "").trim().toLowerCase();
  if (/^[a-z0-9._-]{2,64}$/.test(v)) return v;
  return fallback;
}

export function sanitizeProfile(input: unknown, fallback: MeProfile): MeProfile {
  const p = (input ?? {}) as Partial<MeProfile>;
  if (typeof p !== "object") return fallback;

  const photo =
    typeof p.photo === "string" && p.photo.startsWith("data:image/") && p.photo.length < 2_000_000
      ? p.photo
      : undefined;

  const socials: MeSocials = {};
  for (const k of SOCIAL_KEYS) {
    const raw = p.socials && typeof p.socials[k] === "string" ? (p.socials[k] as string) : "";
    const v = normalizeUrl(raw);
    if (v) socials[k] = v;
  }

  const portfolio = Array.isArray(p.portfolio)
    ? p.portfolio
        .filter((it): it is MePortfolioItem => !!it && typeof it === "object")
        .map((it) => {
          const title = String(it.title ?? it.label ?? "").trim().slice(0, 60);
          const link = normalizeUrl(String(it.link ?? it.url ?? ""));
          const note = String(it.note ?? "").trim().slice(0, 90);
          return { label: title, url: link, title, link, note };
        })
        .filter((it) => it.title || it.url)
        .slice(0, MAX_PORTFOLIO)
    : [];

  return {
    name: typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 80) : fallback.name,
    handle: cleanHandle(typeof p.handle === "string" ? p.handle : "") || fallback.handle,
    nearAccount: cleanNearAccount(typeof p.nearAccount === "string" ? p.nearAccount : "", fallback.nearAccount),
    city: typeof p.city === "string" ? p.city.trim().slice(0, 60) : fallback.city,
    country: (typeof p.country === "string" && p.country ? p.country : fallback.country).toUpperCase().slice(0, 2),
    bio: typeof p.bio === "string" ? p.bio.slice(0, 600) : fallback.bio,
    tags: Array.isArray(p.tags)
      ? p.tags.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 28)).slice(0, 6)
      : fallback.tags,
    photo,
    socials: Object.keys(socials).length ? socials : undefined,
    portfolio: portfolio.length ? portfolio : undefined,
  };
}

/** Shared sandbox freelancer persona — backed by real `raka.nearsignet-protocol.testnet` account on NEAR Testnet. */
export const ME_PROFILE_FALLBACK: MeProfile = {
  name: "Sasam",
  handle: "sasam-studio",
  nearAccount: "raka.nearsignet-protocol.testnet",
  city: "Yogyakarta",
  country: "ID",
  bio: "3D motion artist, product visualizer & Web3 UI designer in Yogyakarta. Escrows lock in nearsignet-protocol.testnet, deliverables are inspected in-browser + verified by a scoped AI agent, and payouts settle directly to my NEAR wallet.",
  tags: ["3D Product Renders", "Motion Reels", "DeFi Brand Kits", "Technical Docs"],
};
