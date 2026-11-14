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
      {/* Sleek Obsidian + Emerald + Amber Command Hero */}
      <div
        className="card pad"
        style={{
          borderColor: "var(--border-glow)",
          background: "linear-gradient(135deg, rgba(0,236,151,0.11) 0%, rgba(15,22,34,0.88) 55%, rgba(245,158,11,0.09) 100%)",
        }}
      >
        <div className="row between wrap" style={{ gap: 18 }}>
          <div className="col" style={{ gap: 6 }}>
            <span className="kbd" style={{ color: "var(--mint)" }}>
              {date(new Date().toISOString(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {me.nearAccount}
            </span>
            <h1 style={{ fontSize: "clamp(25px, 2.8vw, 34px)" }}>{t("dash.hello", { name: me.name.split(" ")[0] })}</h1>
            <p className="muted" style={{ maxWidth: 580 }}>{t("dash.sub", { todo: todoOrders.length, esc: 3 })}</p>
          </div>
          <div className="row wrap" style={{ gap: 10 }}>
            <Link href="/orders/new" className="btn mint">
              <Icon name="send" size={15} /> {t("dash.sendContract")}
            </Link>
            <Link href="/insights" className="btn">
              <Icon name="shield" size={15} /> Scoped-Key Audit
            </Link>
            <Orin pose="idle" size={82} />
          </div>
        </div>
      </div>

      {/* Live NEAR Testnet Telemetry Bar */}
      <div className="card" style={{ padding: "11px 18px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div className="row wrap mono tiny" style={{ gap: 16 }}>
          <span className="row" style={{ gap: 7, color: "var(--mint)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--mint)", boxShadow: "0 0 8px var(--mint)" }} />
            <b>NEAR Testnet Active</b>
          </span>
          <span className="muted">Vault: <a href={nearExplorerAccount(NEAR_CONTRACT_ID)} target="_blank" rel="noreferrer" style={{ color: "var(--ink)", textDecoration: "underline" }}>{NEAR_CONTRACT_ID}</a></span>
          <span className="muted">Orin Verifier: <b style={{ color: "var(--ink)" }}>{chain?.verifierAccount ?? NEAR_VERIFIER_ID}</b></span>
          {chain && <span className="muted">On-Chain: <b style={{ color: "#fbbf24" }}>{chain.totalEscrows} escrows ({chain.totalSealed} SEALED)</b></span>}
        </div>
        <Link href="/orders/NSG-2033" className="mono tiny" style={{ fontWeight: 700, color: "var(--mint)" }}>
          Inspect On-Chain SEALED Proof (NSG-2033) →
        </Link>
      </div>

      {/* Smoked-Glass KPI Grid */}
      <div className="kpi-grid stagger">
        <div className="card pad" style={{ borderTop: "2px solid #38bdf8" }}>
          <div className="kbd">{t("stat.escrow")}</div>
          <div className="display" style={{ fontSize: 30, marginTop: 8 }}>{money(STATS.inEscrow)}</div>
          <div className="mono tiny muted" style={{ marginTop: 4 }}>{nearOf(STATS.inEscrow)} · {t("stat.escrowSub")}</div>
        </div>
        <div className="card pad" style={{ borderTop: "2px solid var(--mint)" }}>
          <div className="kbd">{t("stat.month")}</div>
          <div className="display" style={{ fontSize: 30, marginTop: 8, color: "var(--mint)" }}>{money(STATS.monthPaid)}</div>
          <div className="mono tiny muted" style={{ marginTop: 4 }}>{nearOf(STATS.monthPaid)} · {t("stat.monthSub")}</div>
        </div>
        <div className="card pad" style={{ borderTop: "2px solid #f59e0b" }}>
          <div className="kbd">{t("stat.incoming")}</div>
          <div className="display" style={{ fontSize: 30, marginTop: 8, color: "#fbbf24" }}>{incomingCount}</div>
          <div className="mono tiny muted" style={{ marginTop: 4 }}>{t("stat.incomingSub")}</div>
        </div>
        <div className="card pad" style={{ borderTop: "2px solid #a78bfa" }}>
          <div className="kbd">{t("stat.disputes")}</div>
          <div className="display" style={{ fontSize: 30, marginTop: 8 }}>0</div>
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
                  <div className="row" style={{ gap: 12, minWidth: 0 }}>
                    <span style={{ width: 46, height: 46, borderRadius: 11, border: "1px solid var(--border-strong)", overflow: "hidden", flex: "none" }}>
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
        .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
        .dash-cols{display:grid;grid-template-columns:1.48fr .88fr;gap:18px;align-items:start}
        .order-row{padding:13px 15px;border-radius:13px;border:1px solid var(--border);background:rgba(255,255,255,0.025);gap:12px;transition:border-color .18s,transform .18s,background .18s}
        .order-row:hover{transform:translateY(-2px);border-color:var(--border-glow);background:rgba(0,236,151,0.04)}
        @media (max-width:960px){.kpi-grid{grid-template-columns:repeat(2,1fr)}.dash-cols{grid-template-columns:1fr}}
        @media (max-width:520px){.kpi-grid{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
