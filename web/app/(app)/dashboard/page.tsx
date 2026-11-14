"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { hostOf, useMe } from "@/lib/me";
import { NEEDS_ME, ORDERS, STATS, type Order } from "@/lib/data";
import { listIncoming, loadMyOrders, requestAsOrder } from "@/lib/requests";
import { NEAR_CONTRACT_ID, NEAR_VERIFIER_ID, nearExplorerAccount } from "@/lib/near";
import { Avatar, Country, Kicker, Product, StatusBadge, Toast } from "@/components/ui";
import { Orin } from "@/components/Orin";
import { Icon } from "@/components/Icon";

export default function DashboardPage() {
  const { t, money, nearOf, date } = useI18n();
  const { me } = useMe();
  const [liveOrders, setLiveOrders] = useState<Order[]>([]);
  const [copied, setCopied] = useState(false);
  const [chain, setChain] = useState<{ totalEscrows: number; totalSealed: number; verifierAccount: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const custom = loadMyOrders();
    listIncoming(me.handle).then((rs) => {
      if (!alive) return;
      const incoming = rs.map(requestAsOrder).filter((r) => !custom.some((c) => c.id === r.id));
      setLiveOrders([...custom, ...incoming]);
    });
    fetch("/api/near/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.stats) setChain(d.stats); })
      .catch(() => {});
    return () => { alive = false; };
  }, [me.handle]);

  const allOrders = [...liveOrders, ...ORDERS.filter((o) => !liveOrders.some((l) => l.id === o.id))];
  const todoOrders = allOrders.filter((o) => NEEDS_ME.includes(o.status));
  const incomingCount = allOrders.filter((o) => o.direction === "from_client" && o.status === "request").length;
  const pubUrl = `${hostOf()}/to/${me.handle}`;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`https://${pubUrl}`); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="col" style={{ gap: 22 }}>
      {/* Sleek Obsidian + Emerald + Amber Command Hero with Large Seamless Orin Bust */}
      <div
        className="card"
        style={{
          padding: "22px 26px",
          borderColor: "var(--border-glow)",
          background: "linear-gradient(135deg, rgba(0,236,151,0.11) 0%, rgba(13,18,29,0.94) 52%, rgba(185,28,28,0.16) 100%)",
          overflow: "hidden",
        }}
      >
        <div className="hero-banner-grid">
          <div className="col" style={{ gap: 10, minWidth: 0 }}>
            <span className="kbd" style={{ color: "var(--mint)" }}>
              {t("dash.dateLine", { date: date(new Date().toISOString(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }), acct: me.nearAccount })}
            </span>
            <h1 style={{ fontSize: "clamp(24px, 2.6vw, 33px)" }}>{t("dash.hello", { name: me.name.split(" ")[0] })}</h1>
            <p className="muted" style={{ maxWidth: 600, fontSize: 14.5 }}>{t("dash.sub", { todo: todoOrders.length, esc: 3 })}</p>
            <div className="row wrap" style={{ gap: 10, marginTop: 4 }}>
              <Link href="/orders/new" className="btn mint">
                <Icon name="send" size={15} /> {t("dash.sendContract")}
              </Link>
              <Link href="/insights" className="btn">
                <Icon name="shield" size={15} /> {t("od.scopedAudit")}
              </Link>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
            <Orin pose="idle" size={116} />
          </div>
        </div>
      </div>

      {/* Live NEAR Testnet Telemetry Bar */}
      <div className="card" style={{ padding: "11px 18px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div className="row wrap mono tiny" style={{ gap: 14, minWidth: 0 }}>
          <span className="row" style={{ gap: 7, color: "var(--mint)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--mint)", boxShadow: "0 0 8px var(--mint)" }} />
            <b>{t("od.testnetActive")}</b>
          </span>
          <span className="muted">{t("dash.vaultLabel")} <a href={nearExplorerAccount(NEAR_CONTRACT_ID)} target="_blank" rel="noreferrer" style={{ color: "var(--ink)", textDecoration: "underline" }}>{NEAR_CONTRACT_ID}</a></span>
          <span className="muted">{t("od.orinVerifier")} <b style={{ color: "var(--ink)" }}>{chain?.verifierAccount ?? NEAR_VERIFIER_ID}</b></span>
          {chain && <span className="muted"><b style={{ color: "#fbbf24" }}>{t("dash.onchainStat", { n: chain.totalEscrows, sealed: chain.totalSealed })}</b></span>}
        </div>
        <Link href="/orders/NSG-2033" className="mono tiny" style={{ fontWeight: 700, color: "var(--mint)" }}>
          {t("od.inspectSeal", { id: "NSG-2033" })} →
        </Link>
      </div>

      {/* Smoked-Glass KPI Grid */}
      <div className="kpi-grid stagger">
        <div className="card pad" style={{ borderTop: "2px solid #38bdf8" }}>
          <div className="kbd">{t("stat.escrow")}</div>
          <div className="display" style={{ fontSize: 28, marginTop: 8 }}>{money(STATS.inEscrow)}</div>
          <div className="mono tiny muted" style={{ marginTop: 4 }}>{nearOf(STATS.inEscrow)} · {t("stat.escrowSub", { n: chain?.totalEscrows ?? 3 })}</div>
        </div>
        <div className="card pad" style={{ borderTop: "2px solid var(--mint)" }}>
          <div className="kbd">{t("stat.month")}</div>
          <div className="display" style={{ fontSize: 28, marginTop: 8, color: "var(--mint)" }}>{money(STATS.monthPaid)}</div>
          <div className="mono tiny muted" style={{ marginTop: 4 }}>{nearOf(STATS.monthPaid)} · {t("stat.monthSub", { n: chain?.totalSealed ?? 12 })}</div>
        </div>
        <div className="card pad" style={{ borderTop: "2px solid #f59e0b" }}>
          <div className="kbd">{t("stat.incoming")}</div>
          <div className="display" style={{ fontSize: 28, marginTop: 8, color: "#fbbf24" }}>{incomingCount}</div>
          <div className="mono tiny muted" style={{ marginTop: 4 }}>{t("stat.incomingSub")}</div>
        </div>
        <div className="card pad" style={{ borderTop: "2px solid #a78bfa" }}>
          <div className="kbd">{t("stat.disputes")}</div>
          <div className="display" style={{ fontSize: 28, marginTop: 8 }}>0</div>
          <div className="mono tiny muted" style={{ marginTop: 4 }}>{t("stat.disputesSub")}</div>
        </div>
      </div>

      <div className="dash-cols">
        {/* Action Queue */}
        <section className="card pad col" style={{ gap: 14 }}>
          <div className="row between">
            <div>
              <h2 style={{ fontSize: 20 }}>{t("dash.todoTitle")}</h2>
              <p className="tiny muted">{t("dash.todoSub")}</p>
            </div>
            <Link href="/orders?tab=from_client" className="btn sm">{t("dash.seeAll")}</Link>
          </div>

          <div className="col" style={{ gap: 10 }}>
            {todoOrders.map((o) => {
              const cta =
                o.status === "request" ? t("act.reviewReq") :
                o.status === "revision" ? t("act.reupload") :
                o.status === "in_escrow" ? t("act.upload") : t("act.open");
              return (
                <Link key={o.id} href={`/orders/${o.id}`} className="row between order-row">
                  <div className="row" style={{ gap: 14, minWidth: 0 }}>
                    <span style={{ width: 62, height: 62, borderRadius: 12, border: "1px solid var(--border-strong)", overflow: "hidden", flex: "none", boxShadow: "0 6px 16px rgba(0,0,0,0.45)" }}>
                      <Product kind={o.product ?? o.kind ?? "bottle"} />
                    </span>
                    <div className="col" style={{ gap: 3, minWidth: 0 }}>
                      <div className="row wrap" style={{ gap: 6 }}>
                        <span className="mono tiny muted">{o.id}</span>
                        <StatusBadge s={o.status} />
                      </div>
                      <b style={{ fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.title}</b>
                      <span className="tiny muted">{o.client.name} · {o.client.nearAccount || o.client.city} <Country code={o.client.country} /></span>
                    </div>
                  </div>
                  <div className="col" style={{ alignItems: "flex-end", gap: 4, flex: "none" }}>
                    <b className="display" style={{ fontSize: 17 }}>{money(o.amount)}</b>
                    <span className="mono tiny" style={{ color: "var(--mint)" }}>{o.nearAmount ? `${o.nearAmount} NEAR` : nearOf(o.amount)}</span>
                    <span className="btn sm mint">{cta}</span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Interactive Real Sample Deliverable Gallery */}
          <div style={{ marginTop: 6, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            <div className="row between" style={{ marginBottom: 10 }}>
              <span className="mono tiny" style={{ color: "#fbbf24", fontWeight: 700, letterSpacing: "0.06em" }}>
                ★ LIVE DELIVERABLE SAMPLES · CLICK TO INSPECT & TEST WITH ORIN AI
              </span>
            </div>
            <div className="sample-strip">
              {[
                { id: "NSG-2041", img: "/samples/sneaker-white.jpg", tag: "20× 2400px #FFF JPG", title: "3D Sneaker Studio Pack" },
                { id: "NSG-2052", img: "/samples/wallet-reel.jpg", tag: "9:16 Reel · Audio dBFS", title: "Wallet Launch Motion Cut" },
                { id: "NSG-2033", img: "/samples/storefront-emblem.jpg", tag: "SEALED ON-CHAIN ✓", title: "3D Brand Header Kit" },
              ].map((s) => (
                <Link key={s.id} href={`/orders/${s.id}`} className="sample-card">
                  <div className="sample-img-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.img} alt={s.title} />
                    <span className="sample-id mono">{s.id}</span>
                  </div>
                  <div style={{ padding: "9px 11px" }}>
                    <div style={{ fontWeight: 700, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                    <div className="mono tiny" style={{ color: "var(--mint)", marginTop: 2 }}>{s.tag}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Right Column: Intake Link + Orin Tip */}
        <aside className="col" style={{ gap: 16 }}>
          <div className="card pad col" style={{ gap: 12 }}>
            <Kicker amber>{t("dash.linkTitle")}</Kicker>
            <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.55 }}>{t("dash.linkSub")}</p>
            <div className="mono" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-strong)", background: "rgba(255,255,255,0.03)", fontSize: 12.5, color: "var(--mint)" }}>
              {pubUrl}
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn sm mint" onClick={copyLink}>
                <Icon name="copy" size={14} /> {copied ? t("dash.copied") : t("dash.copy")}
              </button>
              <Link href={`/to/${me.handle}`} className="btn sm">
                <Icon name="link" size={14} /> {t("dash.preview")}
              </Link>
            </div>
          </div>

          <div className="card pad col" style={{ gap: 10 }}>
            <h3 style={{ fontSize: 17 }}>{t("dash.recent")}</h3>
            {allOrders.slice(0, 4).map((o) => (
              <Link key={o.id} href={`/orders/${o.id}`} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div className="row" style={{ gap: 9, minWidth: 0 }}>
                  <Avatar p={o.client} size={30} />
                  <div className="col" style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.title}</b>
                    <span className="mono tiny muted">{o.id}</span>
                  </div>
                </div>
                <StatusBadge s={o.status} />
              </Link>
            ))}
          </div>
        </aside>
      </div>

      <Toast show={copied}><Icon name="check" size={15} /> {t("dash.copied")}</Toast>

      <style>{`
        .hero-banner-grid{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center}
        .kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
        .kpi-grid > *{min-width:0}
        .dash-cols{display:grid;grid-template-columns:minmax(0,1.46fr) minmax(0,.88fr);gap:18px;align-items:start}
        .dash-cols > *{min-width:0}
        .order-row{padding:13px 15px;border-radius:13px;border:1px solid var(--border);background:rgba(255,255,255,0.025);gap:12px;min-width:0;transition:border-color .18s,transform .18s,background .18s}
        .order-row:hover{transform:translateY(-2px);border-color:var(--border-glow);background:rgba(0,236,151,0.04)}
        .sample-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
        .sample-card{border-radius:12px;border:1px solid var(--border-strong);background:rgba(255,255,255,0.03);overflow:hidden;min-width:0;transition:transform .18s,border-color .18s}
        .sample-card:hover{transform:translateY(-2px);border-color:var(--border-glow)}
        .sample-img-wrap{position:relative;aspect-ratio:16/9;overflow:hidden;background:#070B12}
        .sample-img-wrap img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .25s}
        .sample-card:hover .sample-img-wrap img{transform:scale(1.05)}
        .sample-id{position:absolute;top:7px;left:7px;padding:2px 7px;border-radius:6px;background:rgba(6,9,15,0.82);border:1px solid rgba(255,255,255,0.16);font-size:10px;color:#fff}
        @media (max-width:960px){.kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dash-cols{grid-template-columns:1fr}.hero-banner-grid{grid-template-columns:1fr}}
        @media (max-width:640px){.sample-strip{grid-template-columns:1fr}}
        @media (max-width:520px){.kpi-grid{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
