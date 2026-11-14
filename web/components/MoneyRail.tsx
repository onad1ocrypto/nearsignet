"use client";

import { useI18n } from "@/lib/i18n";
import type { Order, Status } from "@/lib/data";
import { initialsOf, ME_COLOR, useMe } from "@/lib/me";
import { Avatar, Country } from "./ui";
import { Icon } from "./Icon";

/** 0 = client wallet, 1 = nearsignet-protocol.testnet vault, 2 = freelancer wallet */
export function moneyPos(s: Status): 0 | 1 | 2 {
  if (s === "paid") return 2;
  if (s === "in_escrow" || s === "verifying" || s === "revision" || s === "review") return 1;
  return 0;
}

export function MoneyRail({ order, status, role }: { order: Order; status: Status; role: "client" | "freelancer" }) {
  const { t, money, nearOf } = useI18n();
  const { me } = useMe();
  const pos = moneyPos(status);
  const funded = pos > 0;
  const coinLeft = ["16.66%", "50%", "83.33%"][pos];
  const nearText = order.nearAmount ? `${order.nearAmount} NEAR` : nearOf(order.amount);

  const statusText =
    status === "paid"
      ? t("rail.paid", { amount: money(order.amount), near: nearText, acct: me.nearAccount })
      : funded
        ? t("rail.held", { amount: money(order.amount), near: nearText })
        : status === "declined"
          ? t("rail.declined")
          : t("rail.notFunded");

  const Node = ({ i, children, name, sub }: { i: number; children: React.ReactNode; name: string; sub: React.ReactNode }) => {
    const active = pos === i && status !== "declined";
    return (
      <div className="col" style={{ alignItems: "center", gap: 6, position: "relative", zIndex: 2 }}>
        <div
          style={{
            borderRadius: "50%",
            transition: "box-shadow .4s",
            boxShadow: active ? "0 0 0 4px rgba(0,236,151,.22), 0 0 22px rgba(0,236,151,.4)" : "none",
          }}
        >
          {children}
        </div>
        <div style={{ fontWeight: 600, fontSize: 13, textAlign: "center" }}>{name}</div>
        <div className="row tiny muted mono" style={{ gap: 5, marginTop: -3, fontSize: 11 }}>{sub}</div>
      </div>
    );
  };

  return (
    <div className="card pad" style={{ padding: "24px 18px 16px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", position: "relative" }}>
        {/* Laser Fiber Settlement Conduit */}
        <div
          style={{
            position: "absolute", left: "16.66%", right: "16.66%", top: 22, height: 3, borderRadius: 4,
            background: "rgba(255,255,255,0.1)",
          }}
        >
          <div
            style={{
              position: "absolute", inset: 0, width: ["0%", "50%", "100%"][pos],
              background: "linear-gradient(90deg, #00EC97, #F59E0B)",
              boxShadow: "0 0 14px rgba(0, 236, 151, 0.55)",
              borderRadius: 4, transition: "width 1s var(--ease)",
            }}
          />
        </div>

        {/* Floating NEAR Token Orb */}
        <div
          style={{
            position: "absolute", top: 23, left: coinLeft, transform: "translate(-50%,-50%)",
            transition: "left 1s var(--ease), opacity .3s",
            opacity: status === "declined" ? 0 : 1, zIndex: 4, pointerEvents: "none",
          }}
        >
          <div
            className="mono"
            style={{
              position: "absolute", top: -36, left: "50%", transform: "translateX(-50%)",
              whiteSpace: "nowrap", fontSize: 11, fontWeight: 700,
              background: "rgba(0, 236, 151, 0.16)", border: "1px solid rgba(0, 236, 151, 0.5)",
              color: "var(--mint)", padding: "2px 9px", borderRadius: 999, backdropFilter: "blur(8px)",
            }}
          >
            {nearText}
          </div>
        </div>

        <Node i={0} name={order.client.name.split(" ")[0] + " · " + t("rail.client")} sub={<>{order.client.nearAccount || order.client.city} <Country code={order.client.country} /></>}>
          <Avatar p={order.client} size={44} />
        </Node>

        <Node i={1} name={t("rail.escrow")} sub={<>nearsignet-protocol.testnet</>}>
          <span
            className="avatar"
            style={{
              width: 44, height: 44,
              background: pos === 1 ? "rgba(0, 236, 151, 0.18)" : "var(--paper-solid)",
              borderColor: pos === 1 ? "var(--mint)" : "var(--border-strong)",
              color: "var(--mint)",
            }}
          >
            <Icon name="lock" size={19} />
          </span>
        </Node>

        <Node
          i={2}
          name={me.name.split(" ")[0] + " · " + t("rail.you")}
          sub={<>{role === "client" ? t("rail.clientLocks") : me.nearAccount}</>}
        >
          <Avatar p={{ initials: initialsOf(me.name), color: ME_COLOR }} size={44} photo={me.photo} />
        </Node>
      </div>

      <div className="tiny mono" style={{ textAlign: "center", marginTop: 14, fontWeight: 600, color: status === "paid" ? "var(--mint)" : "var(--ink-2)" }}>
        {statusText}
      </div>
    </div>
  );
}
