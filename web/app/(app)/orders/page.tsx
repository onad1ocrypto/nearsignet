"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/me";
import { ORDERS, type Order, type Status } from "@/lib/data";
import { listIncoming, loadMyOrders, requestAsOrder } from "@/lib/requests";
import { Country, Empty, Product, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/Icon";

function OrdersInner() {
  const { t, money, nearOf, date } = useI18n();
  const { me } = useMe();
  const sp = useSearchParams();
  const initialTab = (sp.get("tab") as "from_client" | "by_me" | "paid") || "from_client";

  const [tab, setTab] = useState<"from_client" | "by_me" | "paid">(initialTab);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [live, setLive] = useState<Order[]>([]);

  useEffect(() => {
    let alive = true;
    const custom = loadMyOrders();
    listIncoming(me.handle).then((rs) => {
      if (!alive) return;
      const inc = rs.map(requestAsOrder).filter((r) => !custom.some((c) => c.id === r.id));
      setLive([...custom, ...inc]);
    });
    return () => { alive = false; };
  }, [me.handle]);

  const all = [...live, ...ORDERS.filter((o) => !live.some((l) => l.id === o.id))];
  const byTab = all.filter((o) =>
    tab === "paid"
      ? o.status === "paid"
      : tab === "by_me"
        ? (o.direction === "by_me" || o.direction === "to_client") && o.status !== "paid"
        : o.direction === "from_client" && o.status !== "paid"
  );
  const shown = filter === "all" ? byTab : byTab.filter((o) => o.status === filter);

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="row between wrap" style={{ gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 30 }}>{t("orders.title")}</h1>
          <p className="muted">{t("orders.sub")}</p>
        </div>
        <Link href="/orders/new" className="btn mint">
          <Icon name="plus" size={15} /> {t("orders.newBtn")}
        </Link>
      </div>

      {/* Sleek Smoked-Glass Segmented Tabs */}
      <div className="otabs">
        {([
          ["from_client", t("orders.tab.from"), t("orders.tab.fromSub")],
          ["by_me", t("orders.tab.to"), t("orders.tab.toSub")],
          ["paid", t("orders.tab.paid"), t("orders.tab.paidSub")],
        ] as const).map(([key, title, sub]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              className="card"
              style={{
                textAlign: "left",
                padding: "14px 16px",
                borderColor: active ? "var(--border-glow)" : "var(--border)",
                background: active ? "rgba(0, 236, 151, 0.08)" : "var(--paper)",
              }}
              onClick={() => { setTab(key); setFilter("all"); }}
            >
              <b style={{ fontSize: 15.5, color: active ? "var(--mint)" : "var(--ink)" }}>{title}</b>
              <div className="tiny muted" style={{ marginTop: 3 }}>{sub}</div>
            </button>
          );
        })}
      </div>

      {/* Status Chips */}
      {tab !== "paid" && (
        <div className="row wrap" style={{ gap: 7 }}>
          {(["all", "request", "awaiting_payment", "in_escrow", "revision", "review"] as const).map((st) => (
            <button key={st} className={`chip ${filter === st ? "on" : ""}`} onClick={() => setFilter(st)}>
              {st === "all" ? t("orders.all") : t(`status.${st}`)}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="card pad">
          <Empty title={t("orders.empty")} />
        </div>
      ) : (
        <div className="col stagger" style={{ gap: 11 }}>
          {shown.map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="card pad lift row between wrap" style={{ gap: 14 }}>
              <div className="row" style={{ gap: 14, minWidth: 0 }}>
                <span style={{ width: 84, height: 58, borderRadius: 11, border: "1px solid var(--border-strong)", overflow: "hidden", flex: "none", boxShadow: "0 6px 16px rgba(0,0,0,0.45)" }}>
                  <Product kind={o.product ?? o.kind ?? "bottle"} />
                </span>
                <div className="col" style={{ gap: 4, minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <span className="mono tiny muted" style={{ fontWeight: 600 }}>{o.id}</span>
                    <StatusBadge s={o.status} />
                    {(o.txHash || o.txHashes?.release) && (
                      <span className="badge mono st-paid" style={{ fontSize: 10.5 }}>
                        On-Chain Tx ✓
                      </span>
                    )}
                  </div>
                  <h3 style={{ fontSize: 17.5 }}>{o.title}</h3>
                  <div className="row tiny muted wrap" style={{ gap: 6 }}>
                    <span>{o.client.name}</span>
                    <span>·</span>
                    <span className="mono">{o.client.nearAccount || o.client.city}</span>
                    <Country code={o.client.country} />
                    <span>·</span>
                    <span>{t("order.criteriaCount", { n: o.criteria.length })}</span>
                    <span>·</span>
                    <span>{t("order.due", { date: date(o.due, { day: "numeric", month: "short" }) })}</span>
                  </div>
                </div>
              </div>

              <div className="col" style={{ alignItems: "flex-end", gap: 4 }}>
                <div className="display" style={{ fontSize: 22 }}>{money(o.amount)}</div>
                <div className="mono tiny" style={{ fontWeight: 600, color: "var(--mint)" }}>
                  {o.nearAmount ? `${o.nearAmount} NEAR` : nearOf(o.amount)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <style>{`
        .otabs{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        @media (max-width:760px){.otabs{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersInner />
    </Suspense>
  );
}
