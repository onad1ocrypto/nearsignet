"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { type Criterion, type Order } from "@/lib/data";
import { newOrderId, saveMyOrder } from "@/lib/requests";
import { usdToNear } from "@/lib/near";
import { BriefDrafter, CriteriaList } from "@/components/DraftContract";
import { Confetti, Kicker } from "@/components/ui";
import { Orin } from "@/components/Orin";
import { Icon } from "@/components/Icon";

export default function NewOrderPage() {
  const { t, money } = useI18n();
  const router = useRouter();

  const [clientName, setClientName] = useState("Elena Vance");
  const [clientEmail, setClientEmail] = useState("elena@aurora-labs.dev");
  const [clientNear, setClientNear] = useState("elena-client.testnet");
  const [brief, setBrief] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState<number>(350);
  const [days, setDays] = useState<number>(7);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [fire, setFire] = useState(0);

  const nearEst = usdToNear(amount || 0);
  const canCreate = clientName.trim().length > 1 && criteria.length > 0 && amount > 0;

  const createContract = () => {
    if (!canCreate) return;
    const id = newOrderId();
    const due = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    const initials = clientName
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const order: Order = {
      id,
      direction: "by_me",
      title: title.trim() || "NEAR Freelance Escrow Deliverable",
      client: {
        name: clientName.trim(),
        email: clientEmail.trim(),
        nearAccount: clientNear.trim() || "client.testnet",
        country: "SG",
        city: "Remote",
        initials: initials || "CL",
        color: "var(--mint-l)",
      },
      amount,
      nearAmount: nearEst,
      status: "awaiting_payment",
      createdAt: new Date().toISOString().slice(0, 10),
      due,
      brief,
      criteria,
      kind: "bottle",
    };

    saveMyOrder(order);
    setCreatedOrder(order);
    setFire((f) => f + 1);
  };

  return (
    <div className="col" style={{ gap: 20, maxWidth: 900, margin: "0 auto" }}>
      <div>
        <Link href="/orders" className="btn sm ghost" style={{ marginLeft: -10 }}>
          <Icon name="left" size={14} /> {t("nav.orders")}
        </Link>
        <div style={{ marginTop: 8 }}><Kicker>{t("new.kicker")}</Kicker></div>
        <h1 style={{ fontSize: 32, marginTop: 10 }}>{t("new.title")}</h1>
        <p className="muted" style={{ marginTop: 4 }}>{t("new.sub")}</p>
      </div>

      {!createdOrder ? (
        <div className="col" style={{ gap: 18 }}>
          <div className="card pad col" style={{ gap: 14 }}>
            <h3 style={{ fontSize: 18 }}>{t("new.step1")}</h3>
            <div className="grid3">
              <div className="field">
                <label>{t("new.clientName")}</label>
                <input className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </div>
              <div className="field">
                <label>{t("new.clientEmail")}</label>
                <input className="input" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
              </div>
              <div className="field">
                <label>Client NEAR Account</label>
                <input className="input mono" value={clientNear} onChange={(e) => setClientNear(e.target.value)} placeholder="client.testnet" />
              </div>
            </div>
          </div>

          <div className="card pad col" style={{ gap: 14 }}>
            <h3 style={{ fontSize: 18 }}>{t("new.step2")}</h3>
            <BriefDrafter
              brief={brief}
              setBrief={setBrief}
              example={t("new.exampleBrief")}
              placeholder={t("new.briefPh")}
              onDrafted={(r) => {
                setCriteria(r.criteria);
                setTitle(r.suggestedTitle);
                setAmount(r.suggestedAmount);
              }}
            />
          </div>

          {criteria.length > 0 && (
            <div className="card pad col pop-in" style={{ gap: 14 }}>
              <h3 style={{ fontSize: 18 }}>{t("new.step3")}</h3>
              <div className="grid3">
                <div className="field">
                  <label>{t("new.projTitle")}</label>
                  <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="field">
                  <label>{t("new.price")}</label>
                  <input type="number" className="input" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
                </div>
                <div className="field">
                  <label>{t("new.delivery")}</label>
                  <select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                    {[3, 5, 7, 14, 21].map((d) => (
                      <option key={d} value={d}>{t("new.days", { n: d })}</option>
                    ))}
                  </select>
                </div>
              </div>

              <CriteriaList
                criteria={criteria}
                onRemove={(idx) => setCriteria((cs) => cs.filter((_, i) => i !== idx))}
              />

              <div className="row between wrap" style={{ padding: "14px 18px", borderRadius: 13, border: "1px solid var(--border-glow)", background: "rgba(0,236,151,0.08)" }}>
                <div>
                  <div className="kbd" style={{ color: "var(--mint)" }}>ESCROW DEPOSIT ON NEARSIGNET.TESTNET</div>
                  <b className="display" style={{ fontSize: 23 }}>{money(amount)} · {nearEst} NEAR</b>
                </div>
                <button className="btn lg mint" onClick={createContract}>
                  <Icon name="send" size={16} /> {t("new.sendBtn")}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card pad col pop-in" style={{ alignItems: "center", textAlign: "center", padding: "38px 24px", gap: 14 }}>
          <Orin size={116} pose="sealed" />
          <span className="mono badge st-paid">{createdOrder.id}</span>
          <h2 style={{ fontSize: 28 }}>{t("new.sentTitle")}</h2>
          <p className="muted" style={{ maxWidth: 480 }}>
            {t("new.sentSub", { name: createdOrder.client.name, email: createdOrder.client.email ?? createdOrder.client.nearAccount ?? "client", amount: money(createdOrder.amount) })} ({createdOrder.nearAmount} NEAR)
          </p>
          <div className="row wrap" style={{ gap: 10, marginTop: 8 }}>
            <button className="btn lg mint" onClick={() => router.push(`/orders/${createdOrder.id}`)}>
              <Icon name="shield" size={17} /> {t("new.openOrder")} →
            </button>
            <button className="btn lg" onClick={() => router.push("/orders?tab=by_me")}>
              {t("new.backOrders")}
            </button>
          </div>
        </div>
      )}

      <Confetti fire={fire} />

      <style>{`
        .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        @media (max-width:760px){.grid3{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
