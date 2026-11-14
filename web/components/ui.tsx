"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { LANGS, useI18n } from "@/lib/i18n";
import { THEMES, useTheme } from "@/lib/theme";
import { type Person, type ProductKind, type Status } from "@/lib/data";
import { initialsOf, maskAccount, ME_COLOR, useMe } from "@/lib/me";
import { Icon } from "./Icon";

/* ---------------- Brand Lockup (Enlarged & Sharpened 512px 3D Owl Squircle + Clean Geometric Wordmark) ---------------- */
export function Logo({ href = "/", size = 46 }: { href?: string; size?: number }) {
  return (
    <Link href={href} className="logo-lockup" aria-label="NearSignet" style={{ display: "inline-flex", alignItems: "center", gap: 13 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/logo-v5.png"
        alt="NearSignet"
        width={size}
        height={size}
        style={{
          height: size,
          width: size,
          objectFit: "contain",
          display: "block",
          filter: "drop-shadow(0 6px 18px rgba(0, 236, 151, 0.28)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.65))",
        }}
      />
      <span className="col" style={{ gap: 2, lineHeight: 1 }}>
        <span className="display" style={{ fontSize: Math.round(size * 0.48), letterSpacing: "-.03em", color: "var(--ink)" }}>
          Near<span style={{ color: "var(--mint)" }}>Signet</span>
        </span>
        <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-2)", letterSpacing: ".11em" }}>
          PROTOCOL ESCROW
        </span>
      </span>
    </Link>
  );
}

/* ---------------- Theme Switcher ---------------- */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button className="btn sm" aria-label={t("theme.label")} aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ padding: 8 }}>
        <Icon name="palette" size={16} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            className="card popmenu"
            style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 41, padding: 8, width: 210, display: "flex", flexDirection: "column", gap: 4 }}
          >
            <span className="kbd" style={{ padding: "2px 8px 4px" }}>{t("theme.label")}</span>
            {THEMES.map((th) => (
              <button
                key={th.code}
                onClick={() => { setTheme(th.code); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 9, fontWeight: 600, fontSize: 13, textAlign: "left",
                  border: `1px solid ${theme === th.code ? "var(--border-glow)" : "transparent"}`,
                  background: theme === th.code ? "var(--mint-l)" : "transparent",
                }}
              >
                <span style={{ display: "inline-flex", border: "1px solid var(--border-strong)", borderRadius: 999, overflow: "hidden", flex: "none" }}>
                  {th.dots.map((c, i) => <span key={i} style={{ width: 9, height: 15, background: c }} />)}
                </span>
                <span className="grow">{t(`theme.${th.code}`)}</span>
                {theme === th.code && <Icon name="check" size={14} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Profile Menu ---------------- */
export function ProfileMenu() {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { me, signOut, session } = useMe();
  const asNear = session.mode === "near";
  const nearInfo = session.near;

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    router.push("/");
    router.refresh();
  };
  const close = () => setOpen(false);

  return (
    <span className="top-avatar" style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("me.menu.profile")}
        aria-expanded={open}
        className="row"
        style={{
          gap: 8,
          padding: "4px 10px 4px 5px",
          borderRadius: 999,
          border: `1px solid ${open ? "var(--border-glow)" : "var(--border-strong)"}`,
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <Avatar p={{ initials: initialsOf(me.name), color: ME_COLOR }} size={28} photo={me.photo} />
        <span className="mono tiny hide-sm acct-label" style={{ fontWeight: 600, maxWidth: 112, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {me.nearAccount}
        </span>
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            className="card popmenu"
            style={{ position: "absolute", right: 0, top: "calc(100% + 10px)", zIndex: 41, width: 268, padding: 8, display: "flex", flexDirection: "column", gap: 2 }}
          >
            <div className="row" style={{ gap: 10, padding: "8px 10px 12px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
              <Avatar p={{ initials: initialsOf(me.name), color: ME_COLOR }} size={38} photo={me.photo} />
              <div className="col" style={{ gap: 2, minWidth: 0 }}>
                <b style={{ fontFamily: "var(--font-display)", fontSize: 14.5 }}>{me.name}</b>
                <span className="mono tiny muted" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {maskAccount(me.nearAccount)}
                </span>
                {asNear && nearInfo && (
                  <span className="tiny mono" style={{ color: "var(--mint)", fontWeight: 700 }}>
                    {nearInfo.balanceNear} NEAR · {nearInfo.network}
                  </span>
                )}
              </div>
            </div>
            <Link className="mi" href="/profile" onClick={close}><Icon name="user" size={15} /> {t("me.menu.profile")}</Link>
            <Link className="mi" href={`/to/${me.handle}`} onClick={close}><Icon name="link" size={15} /> {t("me.menu.public")}</Link>
            <Link className="mi" href="/insights" onClick={close}><Icon name="chart" size={15} /> {t("nav.insights")}</Link>
            <Link className="mi" href="/signin" onClick={close} style={{ color: "var(--mint)" }}>
              <Icon name={asNear ? "shield" : "wallet"} size={15} /> {asNear ? t("me.menu.connected") : t("me.menu.signin")}
            </Link>
            <button className="mi" style={{ color: "var(--red)" }} onClick={handleSignOut}>
              <Icon name="x" size={15} /> {t("me.menu.signout")}
            </button>
          </div>
        </>
      )}
    </span>
  );
}

/* ---------------- Sleek Glass Globe Language Dropdown ---------------- */
export function LangSwitch({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const active = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn sm"
        aria-label="Language"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: compact ? "7px 11px" : "8px 13px",
          gap: 6,
          background: "rgba(255, 255, 255, 0.04)",
          borderColor: open ? "var(--border-glow)" : "var(--border-strong)",
        }}
      >
        <Icon name="globe" size={14} />
        <span className="mono" style={{ fontSize: 11.5, fontWeight: 700 }}>{active.short}</span>
        <span style={{ fontSize: 9, opacity: 0.65 }}>▾</span>
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            className="card popmenu"
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 8px)",
              zIndex: 41,
              padding: 6,
              width: 176,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            {LANGS.map((l) => {
              const on = l.code === lang;
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => { setLang(l.code); setOpen(false); }}
                  className="mi"
                  style={{
                    justifyContent: "space-between",
                    border: `1px solid ${on ? "var(--border-glow)" : "transparent"}`,
                    background: on ? "var(--mint-l)" : "transparent",
                    color: on ? "var(--mint)" : "var(--ink)",
                  }}
                >
                  <span className="row" style={{ gap: 8 }}>
                    <span className="mono" style={{ fontSize: 11, fontWeight: 700, opacity: 0.8 }}>{l.short}</span>
                    <span>{l.label}</span>
                  </span>
                  {on && <Icon name="check" size={13} />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Avatar + Country ---------------- */
export function Avatar({ p, size = 40, photo }: { p: Pick<Person, "initials" | "color">; size?: number; photo?: string }) {
  if (photo) {
    return (
      <span className="avatar" style={{ width: size, height: size, overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </span>
    );
  }
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, rgba(0, 236, 151, 0.2), rgba(245, 158, 11, 0.16))",
        borderColor: "rgba(0, 236, 151, 0.35)",
        fontSize: size * 0.36,
        color: "var(--ink)",
      }}
    >
      {p.initials}
    </span>
  );
}

export function Country({ code }: { code: string }) {
  if (!code) return null;
  return (
    <span className="mono" style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 5, border: "1px solid var(--border-strong)", background: "var(--cream)", color: "var(--ink-2)" }}>
      {code}
    </span>
  );
}

/* ---------------- Status Badge ---------------- */
export function StatusBadge({ s }: { s: Status }) {
  const { t } = useI18n();
  return (
    <span className={`badge st-${s}`}>
      <span className="dot" /> {t(`status.${s}`)}
    </span>
  );
}

/* ---------------- Real High-Resolution Deliverable Preview Thumbnails ---------------- */
export const SAMPLE_IMAGE_BY_KIND: Record<ProductKind, string> = {
  shoe: "/samples/sneaker-white.jpg",
  reel: "/samples/wallet-reel.jpg",
  watch: "/samples/defi-icons.jpg",
  mug: "/samples/app-cards.jpg",
  plant: "/samples/sdk-docs.jpg",
  bottle: "/samples/storefront-emblem.jpg",
  bag: "/samples/defi-icons.jpg",
  candle: "/samples/app-cards.jpg",
  cap: "/samples/storefront-emblem.jpg",
};

export function Product({ kind, bg = "#0B111B", style }: { kind: ProductKind; bg?: string; style?: CSSProperties }) {
  const src = SAMPLE_IMAGE_BY_KIND[kind] || "/samples/sneaker-white.jpg";
  return (
    <div style={{ width: "100%", height: "100%", background: bg, overflow: "hidden", position: "relative", ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${kind} deliverable sample`}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
    </div>
  );
}

/* ---------------- Confetti ---------------- */
const CONF_COLORS = ["#00EC97", "#F59E0B", "#10B981", "#38BDF8", "#FBBF24"];
export function Confetti({ fire }: { fire: number }) {
  const [pieces, setPieces] = useState<CSSProperties[]>([]);
  useEffect(() => {
    if (!fire) return;
    setPieces(
      Array.from({ length: 60 }, () => ({
        left: `${Math.random() * 100}%`,
        background: CONF_COLORS[Math.floor(Math.random() * CONF_COLORS.length)],
        borderRadius: Math.random() > 0.5 ? "50%" : 2,
        ["--x" as string]: `${(Math.random() - 0.5) * 300}px`,
        ["--r" as string]: `${Math.random() * 900 - 450}deg`,
        ["--d" as string]: `${1.8 + Math.random() * 1.4}s`,
        ["--delay" as string]: `${Math.random() * 0.3}s`,
      }))
    );
    const id = setTimeout(() => setPieces([]), 3800);
    return () => clearTimeout(id);
  }, [fire]);
  if (!pieces.length) return null;
  return <div className="confetti" aria-hidden>{pieces.map((s, i) => <i key={i} style={s} />)}</div>;
}

export function Toast({ show, children }: { show: boolean; children: ReactNode }) {
  return <div className={`toast card ${show ? "show" : ""}`} role="status">{children}</div>;
}

export function Kicker({ children, amber = false }: { children: ReactNode; color?: string; amber?: boolean }) {
  return (
    <span
      className="sticker"
      style={amber ? { borderColor: "rgba(245,158,11,0.38)", background: "rgba(245,158,11,0.12)", color: "#fbbf24" } : undefined}
    >
      {children}
    </span>
  );
}

export function Empty({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="col" style={{ alignItems: "center", textAlign: "center", padding: "44px 20px", gap: 10 }}>
      <Icon name="inbox" size={34} />
      <h3 style={{ fontSize: 19 }}>{title}</h3>
      {sub && <p className="muted">{sub}</p>}
      {action}
    </div>
  );
}
