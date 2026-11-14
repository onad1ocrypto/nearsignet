"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/me";
import { NEEDS_ME, ORDERS } from "@/lib/data";
import { LangSwitch, Logo, ProfileMenu, ThemeSwitch } from "./ui";
import { Orin } from "./Orin";
import { Icon } from "./Icon";
import { listIncoming } from "@/lib/requests";
import { NEAR_CONTRACT_ID, nearExplorerAccount } from "@/lib/near";

/**
 * Floating Glass Top-Navbar AppShell (Sleek Dark Web3 glassmorphism, zero left sidebar).
 * Inspired by Linear, Phantom Wallet, and Uniswap dark glass command bars.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { me, sessionReady, signedIn } = useMe();
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!sessionReady || signedIn) return;
    const qs = typeof window !== "undefined" ? window.location.search : "";
    const next = `${path}${qs}`;
    router.replace(`/signin?next=${encodeURIComponent(next)}`);
  }, [sessionReady, signedIn, path, router]);

  const [arrived, setArrived] = useState(0);
  useEffect(() => {
    if (!sessionReady || !signedIn) return;
    let alive = true;
    listIncoming(me.handle).then((rs) => {
      if (alive) setArrived(rs.filter((r) => r.status === "new").length);
    });
    return () => { alive = false; };
  }, [me.handle, sessionReady, signedIn]);

  const todo = ORDERS.filter((o) => NEEDS_ME.includes(o.status)).length + arrived;

  if (!sessionReady || !signedIn) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div className="col" style={{ alignItems: "center", gap: 14 }}>
          <Orin pose="idle" size={104} className="float" />
          <span className="spin" style={{ width: 22, height: 22, border: "2px solid var(--mint)", borderTopColor: "transparent", borderRadius: "50%" }} />
        </div>
      </div>
    );
  }

  const nav = [
    { href: "/dashboard", icon: "home", label: t("nav.dashboard") },
    { href: "/orders?tab=from_client", match: "/orders", icon: "inbox", label: t("nav.orders"), badge: todo },
    { href: "/orders/new", icon: "send", label: t("nav.newOrder") },
    { href: "/insights", icon: "shield", label: t("nav.insights") },
    { href: `/to/${me.handle}`, icon: "link", label: t("nav.myPage") },
    { href: "/profile", icon: "user", label: t("nav.profile") },
  ];

  const isActive = (n: (typeof nav)[number]) =>
    n.href === "/orders/new" ? path === "/orders/new" : n.match ? path.startsWith(n.match) && path !== "/orders/new" : path === n.href;

  return (
    <div className="ns-app">
      {/* Floating Frosted-Glass Top Navigation Capsule */}
      <header className="glass-nav-wrap">
        <div className="glass-nav">
          <Logo href="/" size={44} />

          <nav className="top-pills" aria-label="Main navigation">
            {nav.map((n) => {
              const on = isActive(n);
              return (
                <Link key={n.href} href={n.href} className={`top-pill ${on ? "on" : ""}`}>
                  <Icon name={n.icon} size={15} />
                  <span>{n.label}</span>
                  {!!n.badge && <span className="pill-count">{n.badge}</span>}
                </Link>
              );
            })}
          </nav>

          <div className="row" style={{ gap: 8, marginLeft: "auto" }}>
            <a
              href={nearExplorerAccount(NEAR_CONTRACT_ID)}
              target="_blank"
              rel="noreferrer"
              className="badge mono rpc-chip"
              title="Live NEAR Testnet Escrow Smart Contract"
            >
              <span className="dot" style={{ color: "var(--mint)" }} />
              {NEAR_CONTRACT_ID}
            </a>
            <ThemeSwitch />
            <LangSwitch compact />
            <ProfileMenu />
          </div>
        </div>
      </header>

      {/* Main Centered Command Workspace */}
      <main className="ns-main">{children}</main>

      {/* Mobile Floating Glass Dock */}
      <nav className="mobile-glass-dock">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={isActive(n) ? "on" : ""}>
            <Icon name={n.icon} size={19} />
            <small>{n.label}</small>
          </Link>
        ))}
      </nav>

      <style>{`
        .ns-app{min-height:100vh;display:flex;flex-direction:column}
        .glass-nav-wrap{position:sticky;top:14px;z-index:35;padding:0 20px}
        .glass-nav{
          max-width:1280px;margin:0 auto;padding:10px 16px;
          display:flex;align-items:center;gap:16px;
          background:rgba(11, 16, 26, 0.78);
          backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);
          border:1px solid var(--border-strong);border-radius:18px;
          box-shadow:0 18px 42px -14px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.08);
        }
        [data-theme="daylight"] .glass-nav{background:rgba(255,255,255,0.86)}
        .top-pills{display:flex;align-items:center;gap:4px;padding:4px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid var(--border)}
        .top-pill{
          display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:9px;
          font-size:13px;font-weight:600;color:var(--ink-2);white-space:nowrap;
          transition:color .18s,background .18s;
        }
        .top-pill:hover{color:var(--ink);background:rgba(255,255,255,0.04)}
        .top-pill.on{
          color:var(--mint);
          background:rgba(0, 236, 151, 0.12);
          box-shadow:inset 0 0 0 1px rgba(0, 236, 151, 0.32);
        }
        [data-theme="daylight"] .top-pill.on{color:#047857}
        .pill-count{
          min-width:18px;height:18px;padding:0 5px;border-radius:999px;
          background:rgba(245, 158, 11, 0.2);color:#fbbf24;border:1px solid rgba(245, 158, 11, 0.45);
          font-size:10.5px;font-weight:700;display:grid;place-items:center;
        }
        .rpc-chip{border-color:rgba(0,236,151,0.3);background:rgba(0,236,151,0.07);font-size:11px}
        .ns-main{max-width:1280px;width:100%;margin:0 auto;padding:28px 24px 64px;flex:1}
        .mobile-glass-dock{display:none}
        @media (max-width:1120px){.rpc-chip{display:none}}
        @media (max-width:920px){
          .top-pills{display:none}
          .hide-sm{display:none}
          .ns-main{padding:20px 16px 104px}
          .mobile-glass-dock{
            display:grid;grid-template-columns:repeat(6,1fr);
            position:fixed;left:12px;right:12px;bottom:12px;z-index:35;
            background:rgba(11,16,26,0.9);backdrop-filter:blur(20px);
            border:1px solid var(--border-strong);border-radius:16px;padding:8px 6px;
            box-shadow:0 16px 36px rgba(0,0,0,0.8);
          }
          [data-theme="daylight"] .mobile-glass-dock{background:rgba(255,255,255,0.92)}
          .mobile-glass-dock a{display:flex;flex-direction:column;align-items:center;gap:3px;color:var(--ink-2);font-weight:600}
          .mobile-glass-dock a.on{color:var(--mint)}
          .mobile-glass-dock small{font-size:9.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
        }
      `}</style>
    </div>
  );
}
