"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/me";
import { getOrder, ORDERS, type Order, type Status } from "@/lib/data";
import { loadIncomingById, myOrder, requestAsOrder, saveMyOrder, setRequestStatus } from "@/lib/requests";
import { NEAR_CONTRACT_ID, NEAR_VERIFIER_ID, nearExplorerAccount, nearExplorerTx, usdToNear } from "@/lib/near";
import { MoneyRail } from "@/components/MoneyRail";
import { Orin } from "@/components/Orin";
import { SignetSeal } from "@/components/SignetSeal";
import { Icon } from "@/components/Icon";
import { CriteriaList } from "@/components/DraftContract";
import { DeliveryPanel, type Log } from "@/components/DeliveryPanel";
import { Avatar, Confetti, Country, StatusBadge, Toast } from "@/components/ui";

const TIMELINE: Status[][] = [["request"], ["awaiting_payment"], ["in_escrow"], ["verifying", "revision", "review"], ["paid"]];

function seedLogs(o: Order): Log[] {
  const base: Log[] = [
    { who: "orin_contract_agent", msg: `compile_predicates("${o.id}")`, res: `${o.criteria.length} checkable rules`, kind: "ai" },
  ];
  if (o.status !== "request" && o.status !== "awaiting_payment") {
    base.push({
      who: NEAR_CONTRACT_ID,
      msg: `create_and_fund_escrow("${o.id}")`,
      res: `${o.nearAmount ?? usdToNear(o.amount)} NEAR locked`,
      kind: "near",
    });
  }
  if (o.status === "review" || o.status === "paid") {
    base.push({
      who: NEAR_VERIFIER_ID,
      msg: `submit_verification("${o.id}", pass=true)`,
      res: "Scoped FunctionCall ✓",
      kind: "ai",
    });
  }
  if (o.status === "paid") {
    base.push({
      who: NEAR_CONTRACT_ID,
      msg: `approve_and_release("${o.id}")`,
      res: `${o.sealId ?? "SEALED"}${o.txHash ? ` · tx ${o.txHash.slice(0, 8)}…` : ""}`,
      kind: "near",
    });
  }
  return base;
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const known = getOrder(id);
  const isCustom = !known && /^REQ-/i.test(String(id));
  const [order, setOrder] = useState<Order>(known ?? ORDERS[0]);

  useEffect(() => {
    if (known) { setOrder(known); return; }
    if (!isCustom) return;
    let alive = true;
    (async () => {
      const mine = myOrder(id);
      if (mine) { if (alive) setOrder(mine); return; }
      const r = await loadIncomingById(String(id).toUpperCase());
      if (alive && r) setOrder(requestAsOrder(r));
    })();
    return () => { alive = false; };
  }, [id, known, isCustom]);

  const { t, money, nearOf, date } = useI18n();
  const [status, setStatus] = useState<Status>(order.status);
  useEffect(() => { setStatus(order.status); }, [order]);

  const [logs, setLogs] = useState<Log[]>(() => seedLogs(order));
  useEffect(() => { setLogs(seedLogs(order)); }, [order]);

  const [fire, setFire] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [justSealed, setJustSealed] = useState(false);
  const [txHash, setTxHash] = useState<string>(order.txHash || order.txHashes?.release || "");
  const [sealCode, setSealCode] = useState<string>(order.sealId || `SEAL-${order.id}-NEAR`);
  const [verdict, setVerdict] = useState<{ measured: number; manual: number; failed: number; evidenceHash?: string } | null>(null);
  const [mediationSplit, setMediationSplit] = useState<{ percent: number; txHash: string; live: boolean } | null>(null);

  const log = (l: Log) => setLogs((x) => [...x, l]);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2400); };

  const stageIdx = TIMELINE.findIndex((g) => g.includes(status));
  const tl = [t("tl.agree"), t("tl.fund"), t("tl.work"), t("tl.verify"), t("tl.sealed")];
  const nearDisplay = order.nearAmount ? `${order.nearAmount} NEAR` : nearOf(order.amount);

  return (
    <div className="col" style={{ gap: 20 }}>
      {/* Header */}
      <div>
        <Link href={`/orders?tab=${order.direction}`} className="btn sm ghost" style={{ marginLeft: -10 }}>
          <Icon name="left" size={14} /> {t("nav.orders")}
        </Link>
        <div className="row between wrap" style={{ gap: 14, marginTop: 6 }}>
          <div>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="mono tiny muted" style={{ fontWeight: 700 }}>{order.id}</span>
              <span className="badge">
                <Icon name={order.direction === "from_client" ? "inbox" : "send"} size={12} />
                {order.direction === "from_client" ? t("orders.tab.from") : t("orders.tab.to")}
              </span>
              <StatusBadge s={status} />
            </div>
            <h1 style={{ fontSize: "clamp(25px,2.8vw,34px)", marginTop: 8 }}>{order.title}</h1>
          </div>
          <div className="col" style={{ alignItems: "flex-end" }}>
            <div className="display" style={{ fontSize: 32 }}>{money(order.amount)}</div>
            <div className="mono tiny" style={{ fontWeight: 700, color: "var(--mint)" }}>{nearDisplay}</div>
            <div className="tiny muted row" style={{ gap: 4, marginTop: 2 }}>
              <Icon name="clock" size={12} /> {t("order.due", { date: date(order.due, { day: "numeric", month: "long" }) })}
            </div>
          </div>
        </div>
      </div>

      {/* NEAR Fiber Settlement Rail */}
      <MoneyRail order={order} status={status} />

      {/* 5-Stage Glass Stepper */}
      {status !== "declined" && (
        <div className="tl">
          {tl.map((label, i) => (
            <div key={label} className={`tl-step ${i < stageIdx ? "done" : i === stageIdx ? "now" : ""}`}>
              <span className="tl-dot mono">{i < stageIdx ? "✓" : `0${i + 1}`}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="od-grid">
        <div className="col" style={{ gap: 20 }}>
          {status === "request" && (
            <RequestPanel
              order={order}
              onAccept={() => {
                setStatus("awaiting_payment");
                if (isCustom) {
                  void setRequestStatus(String(id).toUpperCase(), "accepted");
                  saveMyOrder({ ...order, status: "awaiting_payment" });
                }
                log({ who: NEAR_CONTRACT_ID, msg: `terms_accepted("${order.id}")`, res: "escrow deposit link ready", kind: "near" });
                flash(t("toast.accepted"));
              }}
              onDecline={() => {
                setStatus("declined");
                log({ who: "contract", msg: "declined", kind: "err" });
              }}
            />
          )}

          {status === "awaiting_payment" && (
            <NearDepositPanel
              order={order}
              log={log}
              onFunded={(hash) => {
                if (hash) setTxHash(hash);
                setStatus("in_escrow");
                if (isCustom) saveMyOrder({ ...order, status: "in_escrow" });
                flash(t("toast.funded"));
              }}
            />
          )}

          {(status === "in_escrow" || status === "verifying" || status === "revision") && (
            <DeliveryPanel
              order={order}
              status={status}
              setStatus={setStatus}
              log={log}
              onVerdict={(v) => {
                setVerdict(v);
                if (v.failed === 0) {
                  void fetch("/api/near/escrow", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "verify",
                      orderId: order.id,
                      passed: v.measured,
                      total: order.criteria.length,
                      evidenceHash: v.evidenceHash ?? "sha256:verified",
                      allPassed: true,
                    }),
                  })
                    .then((r) => r.json())
                    .then((d) => {
                      if (d?.txHash) {
                        log({
                          who: NEAR_VERIFIER_ID,
                          msg: `onchain_attest("${order.id}")`,
                          res: `${d.mode === "live" ? "Live Testnet" : "Scoped Receipt"} · ${d.txHash.slice(0, 10)}…`,
                          kind: "near",
                        });
                      }
                    })
                    .catch(() => {});
                }
              }}
            />
          )}

          {status === "review" && (
            <ReviewPanel
              order={order}
              log={log}
              verdict={verdict}
              onReleased={(hash, seal) => {
                if (hash) setTxHash(hash);
                if (seal) setSealCode(seal);
                setStatus("paid");
                if (isCustom) saveMyOrder({ ...order, status: "paid" });
                setJustSealed(true);
                setFire((f) => f + 1);
              }}
            />
          )}

          {status === "paid" && (
            <SealedCertificatePanel
              order={order}
              slam={justSealed}
              txHash={txHash || order.txHash || order.txHashes?.release || ""}
              sealCode={sealCode}
              mediationSplit={mediationSplit}
            />
          )}

          {(status === "review" || status === "paid") && (
            <MediatorPanel
              order={order}
              log={log}
              onSettled={(info) => {
                setMediationSplit(info);
                setStatus("paid");
                setJustSealed(true);
              }}
            />
          )}

          {status === "declined" && (
            <div className="card pad col" style={{ alignItems: "center", gap: 10, textAlign: "center" }}>
              <Orin size={96} pose="idle" />
              <h3 style={{ fontSize: 21 }}>{t("decl.t")}</h3>
              <p className="muted">{t("decl.b")}</p>
              <button className="btn sm" onClick={() => setStatus("request")}>
                <Icon name="refresh" size={14} /> {t("decl.undo")}
              </button>
            </div>
          )}

          {/* Client Brief + Criteria */}
          <div className="card pad col" style={{ gap: 14 }}>
            <div className="row" style={{ gap: 12 }}>
              <Avatar p={order.client} size={40} />
              <div>
                <div style={{ fontWeight: 700 }}>{order.client.name}</div>
                <div className="row tiny muted mono" style={{ gap: 5 }}>
                  {order.client.nearAccount || order.client.city} <Country code={order.client.country} /> · {t("od.briefFrom")}
                </div>
              </div>
            </div>
            <div className="bubble">{order.brief}</div>
            <CriteriaList criteria={order.criteria} />
          </div>
        </div>

        {/* Right Telemetry Terminal */}
        <aside className="col" style={{ gap: 16 }}>
          <div className="card pad col" style={{ gap: 10 }}>
            <div className="row between">
              <span className="kbd">{t("od.contract")}</span>
              <a href={nearExplorerAccount(NEAR_CONTRACT_ID)} target="_blank" rel="noreferrer" className="mono tiny" style={{ color: "var(--mint)", fontWeight: 700 }}>
                {NEAR_CONTRACT_ID} ↗
              </a>
            </div>
            <div className="kv"><span>{t("od.escrowAmt")}</span><b className="mono">{money(order.amount)} ({nearDisplay})</b></div>
            <div className="kv"><span>{t("od.protection")}</span><b className="mono">{t("od.protVal")}</b></div>
            <div className="kv"><span>{t("od.release")}</span><b>{t("od.relVal")}</b></div>
            <div className="kv"><span>Orin Verifier</span><b className="mono tiny" style={{ color: "#fbbf24" }}>{NEAR_VERIFIER_ID}</b></div>
            {order.termsHash && <div className="kv"><span>Terms Hash</span><b className="mono tiny">{order.termsHash.slice(0, 18)}…</b></div>}
          </div>

          <div className="card pad col" style={{ gap: 10, background: "rgba(5,8,13,0.92)", borderColor: "var(--border-strong)" }}>
            <div className="row between">
              <span className="mono tiny" style={{ color: "var(--mint)", fontWeight: 700 }}>● {t("od.log")}</span>
              <span className="mono tiny muted">{logs.length} events</span>
            </div>
            <div className="col mono" style={{ gap: 8, maxHeight: 390, overflowY: "auto", fontSize: 11.5 }}>
              {logs.map((l, i) => (
                <div
                  key={i}
                  style={{
                    padding: "9px 11px",
                    borderRadius: 9,
                    background: "rgba(255,255,255,.035)",
                    borderLeft: `2.5px solid ${l.kind === "near" ? "#00ec97" : l.kind === "ai" ? "#f59e0b" : l.kind === "err" ? "#fb7185" : "#38bdf8"}`,
                  }}
                >
                  <div style={{ color: l.kind === "ai" ? "#fbbf24" : "#00ec97", fontWeight: 700 }}>{l.who}</div>
                  <div style={{ marginTop: 2, color: "#e2e8f0" }}>{l.msg}</div>
                  {l.res && <div style={{ marginTop: 2, color: "#94a3b8" }}>→ {l.res}</div>}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <Toast show={!!toast}><Icon name="check" size={15} /> {toast}</Toast>
      <Confetti fire={fire} />

      <style>{`
        .tl{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
        .tl-step{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:11px;border:1px solid var(--border);background:rgba(255,255,255,0.02);font-weight:600;font-size:12.5px;color:var(--ink-2)}
        .tl-step.done{color:var(--mint);border-color:rgba(0,236,151,0.28);background:rgba(0,236,151,0.06)}
        .tl-step.now{color:#fbbf24;border-color:rgba(245,158,11,0.45);background:rgba(245,158,11,0.1)}
        .tl-dot{width:22px;height:22px;border-radius:6px;border:1px solid currentColor;display:grid;place-items:center;font-size:10.5px;flex:none}
        .od-grid{display:grid;grid-template-columns:1.48fr .88fr;gap:20px;align-items:start}
        .bubble{padding:14px 16px;border-radius:12px;border:1px solid var(--border);background:rgba(255,255,255,0.025);line-height:1.6}
        .kv{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:7px 0;border-bottom:1px solid var(--border)}
        .kv span{color:var(--ink-2)}
        @media (max-width:920px){.od-grid{grid-template-columns:1fr}.tl{grid-template-columns:1fr 1fr}}
      `}</style>
    </div>
  );
}

/* ---------------- Sub-Panels ---------------- */

function RequestPanel({ order, onAccept, onDecline }: { order: Order; onAccept: () => void; onDecline: () => void }) {
  const { t, money } = useI18n();
  return (
    <div className="card pad col" style={{ gap: 12, borderColor: "rgba(245,158,11,0.38)", background: "rgba(245,158,11,0.07)" }}>
      <h3 style={{ fontSize: 20 }}>{t("req.title", { name: order.client.name })}</h3>
      <p className="muted" style={{ fontSize: 14 }}>{t("req.body", { amount: money(order.amount) })}</p>
      <div className="row wrap" style={{ gap: 10 }}>
        <button className="btn mint" onClick={onAccept}><Icon name="check" size={15} /> {t("req.accept")}</button>
        <button className="btn" onClick={onDecline}><Icon name="x" size={15} /> {t("req.decline")}</button>
      </div>
    </div>
  );
}

function NearDepositPanel({ order, log, onFunded }: { order: Order; log: (l: Log) => void; onFunded: (txHash?: string) => void }) {
  const { t, money } = useI18n();
  const { me } = useMe();
  const [asset, setAsset] = useState<"NEAR" | "USDC" | "USDT" | "ETH">("NEAR");
  const [quote, setQuote] = useState<{ amountInFormatted: string; nearOut: string; route: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const nearAmt = order.nearAmount ?? usdToNear(order.amount);

  useEffect(() => {
    let alive = true;
    fetch("/api/near/intents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromAsset: asset, usdAmount: order.amount, recipientId: NEAR_CONTRACT_ID }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setQuote(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [asset, order.amount]);

  const lockEscrow = async () => {
    setBusy(true);
    log({ who: asset === "NEAR" ? "near_wallet" : "near_intents_1click", msg: `fund_escrow("${order.id}", ${nearAmt} NEAR)`, kind: "near" });
    try {
      const res = await fetch("/api/near/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fund",
          orderId: order.id,
          freelancerId: me.nearAccount,
          nearAmount: nearAmt,
          title: order.title,
          termsHash: order.termsHash ?? `sha256:${order.id}`,
          totalCount: order.criteria.length,
        }),
      });
      const d = await res.json();
      log({
        who: NEAR_CONTRACT_ID,
        msg: `create_and_fund_escrow("${order.id}")`,
        res: `${nearAmt} NEAR locked · ${d.txHash?.slice(0, 10)}…`,
        kind: "near",
      });
      onFunded(d.txHash);
    } catch {
      onFunded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card pad col" style={{ gap: 14, borderColor: "rgba(245,158,11,0.35)" }}>
      <div className="row between wrap">
        <div>
          <h3 style={{ fontSize: 20 }}>{t("pay.waitTitle", { name: order.client.name })}</h3>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>
            {t("pay.waitBody", { email: order.client.email ?? order.client.nearAccount ?? "client" })}
          </p>
        </div>
        <Orin pose="idle" size={68} />
      </div>

      <div style={{ padding: 14, borderRadius: 13, border: "1px solid var(--border-strong)", background: "rgba(255,255,255,0.025)" }}>
        <div className="row between wrap" style={{ gap: 10, marginBottom: 10 }}>
          <span className="kbd" style={{ color: "#fbbf24" }}>{t("pay.simLabel")} · NEAR INTENTS 1-CLICK</span>
          <div className="row" style={{ gap: 6 }}>
            {(["NEAR", "USDC", "USDT", "ETH"] as const).map((tk) => (
              <button
                key={tk}
                type="button"
                className={`chip mono ${asset === tk ? "on" : ""}`}
                style={{ padding: "3px 10px", fontSize: 11.5 }}
                onClick={() => setAsset(tk)}
              >
                {tk}
              </button>
            ))}
          </div>
        </div>

        {quote && (
          <div className="mono tiny" style={{ padding: "9px 11px", borderRadius: 9, background: "rgba(7,10,15,0.65)", border: "1px solid var(--border)", marginBottom: 12 }}>
            Pay <b style={{ color: "#fbbf24" }}>{quote.amountInFormatted}</b> → Locks <b style={{ color: "var(--mint)" }}>{quote.nearOut} NEAR</b> ({money(order.amount)}) in <b>{NEAR_CONTRACT_ID}</b><br />
            <span className="muted">{quote.route}</span>
          </div>
        )}

        <button className="btn lg near-pay" disabled={busy} onClick={lockEscrow}>
          <Icon name="lock" size={17} /> {busy ? t("pay.authorising") : `${t("pay.btn")} · ${nearAmt} NEAR (${money(order.amount)})`}
        </button>
      </div>
    </div>
  );
}

function ReviewPanel({
  order, log, verdict, onReleased,
}: {
  order: Order;
  log: (l: Log) => void;
  verdict: { measured: number; manual: number; failed: number } | null;
  onReleased: (txHash?: string, sealId?: string) => void;
}) {
  const { t, money } = useI18n();
  const [busy, setBusy] = useState<"" | "release" | "timeout">("");
  const nearAmt = order.nearAmount ?? usdToNear(order.amount);

  const settle = async (mode: "release" | "timeout_claim") => {
    setBusy(mode === "release" ? "release" : "timeout");
    try {
      const r = await fetch("/api/near/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, orderId: order.id }),
      });
      const d = await r.json();
      log({
        who: NEAR_CONTRACT_ID,
        msg: mode === "release" ? `approve_and_release("${order.id}")` : `claim_after_timeout("${order.id}")`,
        res: `${nearAmt} NEAR → freelancer · ${d.sealId}`,
        kind: "near",
      });
      onReleased(d.txHash, d.sealId);
    } catch {
      onReleased();
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="card pad col" style={{ gap: 14, borderColor: "rgba(167,139,250,0.4)", background: "rgba(167,139,250,0.07)" }}>
      <div className="row between wrap">
        <div>
          <h3 style={{ fontSize: 20 }}>{verdict?.manual ? t("rev.tManual") : t("rev.t")}</h3>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
            {verdict?.manual
              ? t("rev.bManual", { name: order.client.name, m: verdict.measured, u: verdict.manual, amount: money(order.amount) })
              : t("rev.b", { name: order.client.name, n: order.criteria.length, amount: money(order.amount) })}
          </p>
        </div>
        <span className="mono badge" style={{ borderColor: "rgba(245,158,11,0.45)", color: "#fbbf24" }}>71:59:42</span>
      </div>

      <div className="row wrap" style={{ gap: 10 }}>
        <button className="btn mint" disabled={!!busy} onClick={() => settle("release")}>
          <Icon name="award" size={16} /> {busy === "release" ? t("rev.releasing") : t("rev.approve", { name: order.client.name.split(" ")[0] })}
        </button>
        <button className="btn" disabled={!!busy} onClick={() => settle("timeout_claim")}>
          <Icon name="clock" size={15} /> {t("rev.ff")}
        </button>
      </div>
    </div>
  );
}

function SealedCertificatePanel({
  order, slam, txHash, sealCode, mediationSplit,
}: {
  order: Order;
  slam: boolean;
  txHash: string;
  sealCode: string;
  mediationSplit: { percent: number; txHash: string; live: boolean } | null;
}) {
  const { t, money } = useI18n();
  const { me } = useMe();
  const certRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [stampRun, setStampRun] = useState<number>(slam ? 1 : 0);
  const [shaking, setShaking] = useState<boolean>(slam);
  const nearAmt = order.nearAmount ?? usdToNear(order.amount);
  const isRealTestnetTx = txHash && !txHash.startsWith("sim") && txHash.length >= 40;

  useEffect(() => {
    if (!slam) return;
    setShaking(true);
    setStampRun((r) => r + 1);
    const id = setTimeout(() => setShaking(false), 620);
    return () => clearTimeout(id);
  }, [slam]);

  const replayStamp = () => {
    setShaking(true);
    setStampRun((r) => r + 1);
    setTimeout(() => setShaking(false), 620);
  };

  const saveCert = async () => {
    if (!certRef.current) return;
    setSaving(true);
    try {
      const dataUrl = await toPng(certRef.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.download = `${order.id}-NEARSIGNET-SEALED.png`;
      a.href = dataUrl;
      a.click();
    } catch {}
    setSaving(false);
  };

  return (
    <div className="card pad col" style={{ alignItems: "center", gap: 18, borderColor: "var(--border-glow)", background: "radial-gradient(ellipse at 50% 0%, rgba(0,236,151,0.12), rgba(15,22,34,0.88) 70%)" }}>
      <div className="row wrap" style={{ gap: 16, justifyContent: "center" }}>
        <Orin pose="sealed" size={92} />
        <div>
          <h2 style={{ fontSize: 25, color: "var(--mint)" }}>{t("paid.title")}</h2>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>
            {t("paid.sub", { amount: money(order.amount), near: `${nearAmt} NEAR`, acct: me.nearAccount })}
          </p>
        </div>
      </div>

      {/* Cryptographic Dark Titanium Certificate */}
      <div ref={certRef} className={`cert ${shaking ? "cert-shake" : ""}`}>
        <div className="kbd" style={{ textAlign: "center", color: "#00ec97" }}>{t("cert.head")}</div>
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <div className="display" style={{ fontSize: 30, color: "#fff" }}>{nearAmt} NEAR · {money(order.amount)}</div>
          <div style={{ fontWeight: 600, fontSize: 13.5, marginTop: 3, color: "#94a3b8" }}>{order.title}</div>
        </div>

        <div style={{ margin: "16px 0", padding: "11px 14px", borderRadius: 11, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.09)", fontSize: 12 }} className="mono col">
          <div className="row between"><span className="muted">{t("cert.from")}:</span><b>{order.client.nearAccount || order.client.name}</b></div>
          <div className="row between"><span className="muted">{t("cert.to")}:</span><b style={{ color: "#00ec97" }}>{me.nearAccount}</b></div>
          <div className="row between"><span className="muted">Vault:</span><b>{NEAR_CONTRACT_ID}</b></div>
          <div className="row between"><span className="muted">Seal ID:</span><b style={{ color: "#fbbf24" }}>{sealCode}</b></div>
          {mediationSplit && (
            <div className="row between" style={{ color: "#fb923c" }}>
              <span>Mediator Split:</span><b>{100 - mediationSplit.percent}% freelancer / {mediationSplit.percent}% refund</b>
            </div>
          )}
        </div>

        <div className="col" style={{ alignItems: "center", gap: 8 }}>
          <SignetSeal
            key={stampRun}
            size={156}
            sealCode={sealCode}
            slam={stampRun > 0}
            onStamped={() => {
              setShaking(true);
              setTimeout(() => setShaking(false), 620);
            }}
          />
          <div className="tiny muted" style={{ textAlign: "center" }}>{t("cert.verified")}</div>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 10 }}>
        <button type="button" className="btn amber" onClick={replayStamp}>
          <Icon name="award" size={15} /> {t("try.again")}
        </button>
        <button className="btn mint" onClick={saveCert} disabled={saving}>
          <Icon name="download" size={15} /> {saving ? t("cert.saving") : t("cert.save")}
        </button>
        {isRealTestnetTx && (
          <a href={nearExplorerTx(txHash)} target="_blank" rel="noreferrer" className="btn">
            <Icon name="link" size={14} /> Verify Tx on NearBlocks Testnet ↗
          </a>
        )}
      </div>
    </div>
  );
}

function MediatorPanel({
  order, log, onSettled,
}: {
  order: Order;
  log: (l: Log) => void;
  onSettled: (info: { percent: number; txHash: string; live: boolean }) => void;
}) {
  const { t, money, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<{ freelancerPct: number; refundPct: number; summary: string; findings: string[] } | null>(null);

  const askMediator = async () => {
    setBusy(true);
    log({ who: "orin_mediator", msg: `analyze_dispute("${order.id}")`, kind: "ai" });
    try {
      const r = await fetch("/api/agent/mediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: order.title,
          amount: order.amount,
          criteria: order.criteria,
          passed: Math.max(1, order.criteria.length - 1),
          dispute: reason || t("med.defaultReason"),
          lang,
        }),
      });
      const d = await r.json();
      setProposal(d);
      log({ who: NEAR_VERIFIER_ID, msg: `propose_mediation(${d.freelancerPct}/${d.refundPct})`, res: d.summary, kind: "ai" });
    } catch {}
    setBusy(false);
  };

  const executeSplit = async () => {
    if (!proposal) return;
    setBusy(true);
    try {
      const r = await fetch("/api/near/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mediate_settle", orderId: order.id, freelancerPct: proposal.freelancerPct }),
      });
      const d = await r.json();
      log({ who: NEAR_CONTRACT_ID, msg: `execute_mediation("${order.id}")`, res: `${proposal.freelancerPct}% / ${proposal.refundPct}% settled`, kind: "near" });
      onSettled({ percent: proposal.refundPct, txHash: d.txHash, live: d.mode === "live" });
    } catch {}
    setBusy(false);
  };

  return (
    <div className="card pad col" style={{ gap: 12 }}>
      <div className="row between wrap">
        <div>
          <b style={{ fontSize: 15.5 }}><Icon name="scale" size={15} /> {t("med.q")}</b>
          <div className="tiny muted">{t("med.qSub")}</div>
        </div>
        <button className="btn sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : t("med.open")}
        </button>
      </div>

      {open && (
        <div className="col pop-in" style={{ gap: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <textarea
            className="textarea"
            style={{ minHeight: 84 }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("med.defaultReason")}
          />
          {!proposal ? (
            <button className="btn lav" disabled={busy} onClick={askMediator}>
              <Icon name="bot" size={15} /> {busy ? t("med.thinking") : t("med.ask")}
            </button>
          ) : (
            <div className="card" style={{ padding: 14, borderColor: "rgba(167,139,250,0.4)", background: "rgba(167,139,250,0.08)" }}>
              <b>{t("med.propTitle")} — {proposal.freelancerPct}% Freelancer / {proposal.refundPct}% Client</b>
              <p className="tiny muted" style={{ marginTop: 4 }}>{proposal.summary}</p>
              <div className="row wrap" style={{ gap: 10, marginTop: 10 }}>
                <span className="badge st-paid">
                  Freelancer: {money(Math.round((order.amount * proposal.freelancerPct) / 100))}
                </span>
                <span className="badge st-request">
                  Client Refund: {money(Math.round((order.amount * proposal.refundPct) / 100))}
                </span>
                <button className="btn sm mint" disabled={busy} onClick={executeSplit}>
                  {busy ? t("med.settling") : t("med.accept")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
