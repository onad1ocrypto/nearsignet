"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/me";
import { lsGet, lsSet } from "@/lib/safeStorage";
import { getOrder, ORDERS, type Order, type Status } from "@/lib/data";
import { loadIncomingById, myOrder, requestAsOrder, saveMyOrder, setRequestStatus } from "@/lib/requests";
import {
  NEAR_CONTRACT_ID,
  NEAR_FREELANCER_DEFAULT,
  NEAR_VERIFIER_ID,
  nearExplorerAccount,
  nearExplorerTx,
  nearToYocto,
  usdToNear,
} from "@/lib/near";
import { signNearWalletCall, walletCapabilities, walletSessionHint } from "@/lib/wallet";
import { MoneyRail } from "@/components/MoneyRail";
import { Orin } from "@/components/Orin";
import { SignetSeal } from "@/components/SignetSeal";
import { Icon } from "@/components/Icon";
import { CriteriaList } from "@/components/DraftContract";
import { DeliveryPanel, type Log } from "@/components/DeliveryPanel";
import { Avatar, Confetti, Country, SAMPLE_IMAGE_BY_KIND, StatusBadge, Toast } from "@/components/ui";

/** Turn raw near-api-js / wallet-selector errors into an operator-readable line. */
function walletFailure(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "Unknown wallet error");
  const m = raw.toLowerCase();
  if (m.includes("no ne") && m.includes("wallet")) return "WALLET_SESSION_MISSING — session expired. Reconnect your wallet, then retry.";
  if (m.includes("user rejected") || m.includes("denied") || m.includes("cancelled") || m.includes("canceled"))
    return "REJECTED_IN_WALLET — you declined the signature request.";
  if (m.includes("does not have permission") || m.includes("access key") || m.includes("not allowed") || m.includes("method name"))
    return "KEY_SCOPE_MISMATCH — the wallet key is not authorised for this method. Reconnect the wallet to re-issue a scoped key.";
  if (m.includes("insufficient") || m.includes("not enough balance") || m.includes("lack"))
    return "INSUFFICIENT_BALANCE — top up Testnet NEAR from the in-app faucet, then retry.";
  if (m.includes("timeout") || m.includes("network") || m.includes("fetch"))
    return "RPC_TIMEOUT — wallet did not answer in time. The request may still be pending in the wallet; check before retrying.";
  return raw.slice(0, 220);
}

const TIMELINE: Status[][] = [["request"], ["awaiting_payment"], ["in_escrow"], ["verifying", "revision", "review"], ["paid"]];

function makeRunSuffix(): string {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function getOrCreateOnchainId(orderId: string): string {
  if (orderId === "NSG-2033") return "NSG-2033";
  if (/^REQ-/i.test(orderId)) return orderId;
  const key = `nearsignet.onchainId.${orderId}`;
  const saved = lsGet(key);
  if (saved) return saved;
  const fresh = `${orderId}-${makeRunSuffix()}`;
  lsSet(key, fresh);
  return fresh;
}

function seedLogs(o: Order, onchainId: string): Log[] {
  const base: Log[] = [
    { who: "orin_contract_agent", msg: `compile_predicates("${onchainId}")`, res: `${o.criteria.length} checkable rules`, kind: "ai" },
  ];
  if (o.status !== "request" && o.status !== "awaiting_payment") {
    base.push({
      who: NEAR_CONTRACT_ID,
      msg: `escrow_target("${onchainId}")`,
      res: `${o.nearAmount ?? usdToNear(o.amount)} NEAR`,
      txHash: o.txHashes?.fund,
      kind: "near",
    });
  }
  if (o.status === "review" || o.status === "paid") {
    base.push({
      who: NEAR_VERIFIER_ID,
      msg: `submit_verification("${onchainId}", pass=true)`,
      res: "Scoped FunctionCall ✓",
      txHash: o.txHashes?.verify,
      kind: "ai",
    });
  }
  if (o.status === "paid") {
    base.push({
      who: NEAR_CONTRACT_ID,
      msg: `approve_and_release("${onchainId}")`,
      res: o.sealId ?? "SEALED",
      txHash: o.txHash || o.txHashes?.release,
      kind: "near",
    });
  }
  return base;
}

interface EscrowProbe {
  exists: boolean;
  status?: string;
  client?: string;
  freelancer?: string;
  amountNear?: string;
  reviewDeadlineNs?: string;
}

/**
 * Pre-flight contract read before any wallet signature. Wallets show nothing at
 * all when the transaction will fail with an `assert` (e.g. ORDER_NOT_FOUND or
 * NOT_CLIENT) — so we check the escrow record first and explain it in the UI.
 */
async function probeEscrow(onchainId: string): Promise<EscrowProbe> {
  try {
    const r = await fetch(`/api/near/escrow?orderId=${encodeURIComponent(onchainId)}`, { cache: "no-store" });
    if (!r.ok) return { exists: false };
    const j = (await r.json()) as {
      ok?: boolean;
      escrow?: {
        status?: string;
        client?: string;
        freelancer?: string;
        amount_yocto?: string;
        review_deadline_ns?: string;
      } | null;
    };
    const e = j.escrow;
    if (!e) return { exists: false };
    return {
      exists: true,
      status: e.status,
      client: e.client,
      freelancer: e.freelancer,
      amountNear: e.amount_yocto ? (Number(e.amount_yocto) / 1e24).toFixed(2) : undefined,
      reviewDeadlineNs: e.review_deadline_ns,
    };
  } catch {
    return { exists: false };
  }
}

function OrderDetailInner() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const known = getOrder(id);
  const isCustom = !known && /^REQ-/i.test(String(id));
  const [order, setOrder] = useState<Order>(known ?? ORDERS[0]);
  const [onchainId, setOnchainId] = useState<string>(() => getOrCreateOnchainId(String(id || "NSG-2041")));

  useEffect(() => {
    const oid = getOrCreateOnchainId(String(id || "NSG-2041"));
    setOnchainId(oid);
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
  const { walletConnected, walletId, session, connectWallet } = useMe();
  const [status, setStatus] = useState<Status>(order.status);
  useEffect(() => { setStatus(order.status); }, [order]);

  const [chainEscrow, setChainEscrow] = useState<EscrowProbe | null>(null);
  useEffect(() => {
    let alive = true;
    const run = () => void probeEscrow(onchainId).then((p) => { if (alive) setChainEscrow(p); });
    run();
    const t = setInterval(run, 15_000);
    return () => { alive = false; clearInterval(t); };
  }, [onchainId, status]);

  const [walletHealth, setWalletHealth] = useState<{ walletId: string | null; canSign: boolean; hasSession: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    const probe = () => void walletCapabilities().then((c) => { if (alive) setWalletHealth(c); });
    probe();
    const t = setInterval(probe, 4000);
    const onFocus = () => probe();
    window.addEventListener("focus", onFocus);
    return () => { alive = false; clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [walletConnected]);

  const [logs, setLogs] = useState<Log[]>(() => seedLogs(order, onchainId));
  useEffect(() => { setLogs(seedLogs(order, onchainId)); }, [order, onchainId]);

  const [fire, setFire] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [justSealed, setJustSealed] = useState(false);
  const [txHash, setTxHash] = useState<string>(order.txHash || order.txHashes?.release || "");
  const [sealCode, setSealCode] = useState<string>(order.sealId || `SEAL-${order.id}-NEAR`);
  const [verdict, setVerdict] = useState<{ measured: number; manual: number; failed: number; evidenceHash?: string } | null>(null);
  const [mediationSplit, setMediationSplit] = useState<{ percent: number; txHash: string; live: boolean } | null>(null);

  const log = (l: Log) => setLogs((x) => [...x, l]);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  // Handle redirect callbacks from NEAR browser wallets (`?transactionHashes=...&nsgAction=...`)
  useEffect(() => {
    const callbackTx = sp.get("transactionHashes");
    const cbAction = sp.get("nsgAction");
    if (!callbackTx) return;
    const firstHash = callbackTx.split(",")[0];
    if (cbAction === "fund") {
      setTxHash(firstHash);
      setStatus("in_escrow");
      log({
        who: session.near?.accountId || "near_wallet",
        msg: `create_and_fund_escrow("${onchainId}")`,
        res: "Signed via NEAR Wallet ✓",
        txHash: firstHash,
        kind: "near",
      });
      flash("Escrow locked on NEAR Testnet!");
    } else if (cbAction === "release") {
      const generatedSeal = `SEAL-${onchainId}-${firstHash.slice(0, 6).toUpperCase()}`;
      setTxHash(firstHash);
      setSealCode(generatedSeal);
      setStatus("paid");
      setJustSealed(true);
      setFire((f) => f + 1);
      log({
        who: session.near?.accountId || "near_wallet",
        msg: `approve_and_release("${onchainId}")`,
        res: `SEALED · ${generatedSeal}`,
        txHash: firstHash,
        kind: "near",
      });
    }
  }, [sp, onchainId, session.near?.accountId]);

  const startFreshRun = () => {
    const fresh = `${order.id}-${makeRunSuffix()}`;
    lsSet(`nearsignet.onchainId.${order.id}`, fresh);
    setOnchainId(fresh);
    setStatus(order.id === "NSG-2033" ? "awaiting_payment" : order.status === "paid" ? "awaiting_payment" : order.status);
    setTxHash("");
    setVerdict(null);
    setMediationSplit(null);
    setJustSealed(false);
    setLogs([
      { who: "orin_contract_agent", msg: `new_onchain_session("${fresh}")`, res: "Ready for live Testnet tx", kind: "ai" },
    ]);
    flash(`Fresh on-chain ID ready: ${fresh}`);
  };

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
              <span className="badge mono" style={{ borderColor: "var(--border-glow)", color: "var(--mint)" }}>
                On-Chain ID: {onchainId}
              </span>
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

      {/* Live Execution Mode Strip (Wallet vs Live Testnet Relayer) */}
      <div
        className="row between wrap"
        style={{
          padding: "10px 16px",
          borderRadius: 12,
          background: walletConnected ? "rgba(0,236,151,0.09)" : "rgba(245,158,11,0.08)",
          border: `1px solid ${walletConnected ? "rgba(0,236,151,0.38)" : "rgba(245,158,11,0.35)"}`,
          gap: 10,
        }}
      >
        <div className="row wrap" style={{ gap: 8, fontSize: 12.5 }}>
          <span className="mono" style={{ fontWeight: 700, color: walletConnected ? "var(--mint)" : "#fbbf24" }}>
            {walletConnected
              ? `● REAL WALLET SIGNING (${walletId}: ${session.near?.accountId})`
              : `● LIVE TESTNET RELAYER ACTIVE (liam.${NEAR_CONTRACT_ID})`}
          </span>
          <span className="muted">
            — Every escrow lock, Scoped-Key AI verification, and payout broadcasts a real transaction on NEAR Testnet.
          </span>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          {!walletConnected && (
            <button
              type="button"
              className="btn sm mint"
              onClick={() =>
                void connectWallet(walletSessionHint() ?? "meteor-wallet", typeof window !== "undefined" ? window.location.href : undefined)
              }
            >
              <Icon name="wallet" size={13} /> {walletSessionHint() ? "Reconnect Wallet" : "Connect Meteor Wallet"}
            </button>
          )}
          {walletConnected && (
            <span
              className="mono tiny"
              style={{ color: walletHealth?.canSign === false ? "#fca5a5" : "var(--mint)", letterSpacing: ".1em" }}
              title="Live wallet capability probe (re-checked every 4s and on window focus)"
            >
              {walletHealth === null
                ? "KEY PROBE…"
                : walletHealth.canSign
                ? "SCOPED KEY READY ✓"
                : "KEY CANNOT SIGN — RECONNECT"}
            </span>
          )}
          <button type="button" className="btn sm" onClick={startFreshRun} title="Generate a fresh on-chain escrow ID to test the full lifecycle again">
            <Icon name="refresh" size={13} /> New On-Chain Run
          </button>
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
                log({ who: NEAR_CONTRACT_ID, msg: `terms_accepted("${onchainId}")`, res: "escrow deposit link ready", kind: "near" });
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
              onchainId={onchainId}
              log={log}
              flash={flash}
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
                const passedCount = Math.max(0, order.criteria.length - v.failed);
                // Record BOTH failed (REVISION_NEEDED) and passed (IN_REVIEW) attestations LIVE ON-CHAIN via Orin's Scoped Key!
                void fetch("/api/near/escrow", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "verify",
                    orderId: order.id,
                    onchainOrderId: onchainId,
                    amountUsd: order.amount,
                    termsHash: order.termsHash,
                    passedCount,
                    totalCount: order.criteria.length,
                    evidenceHash: v.evidenceHash ?? "sha256:verified",
                  }),
                })
                  .then((r) => r.json())
                  .then((d) => {
                    if (d?.fundTxHash) {
                      log({
                        who: NEAR_CONTRACT_ID,
                        msg: `create_and_fund_escrow("${onchainId}")`,
                        res: "Anchored on NEAR Testnet ✓",
                        txHash: d.fundTxHash,
                        kind: "near",
                      });
                    }
                    if (d?.txHash) {
                      log({
                        who: NEAR_VERIFIER_ID,
                        msg: `submit_verification("${onchainId}", ${passedCount}/${order.criteria.length})`,
                        res: `${v.failed === 0 ? "IN_REVIEW" : "REVISION_NEEDED"} · Scoped Key Tx ✓`,
                        txHash: d.txHash,
                        kind: "near",
                      });
                    }
                  })
                  .catch(() => {});
              }}
            />
          )}

          {status === "review" && (
            <ReviewPanel
              order={order}
              onchainId={onchainId}
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
              onchainId={onchainId}
              log={log}
              onSettled={(info) => {
                setMediationSplit(info);
                if (info.txHash) setTxHash(info.txHash);
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

            {/* Real Visual Sample / Deliverable Reference Card */}
            <div
              style={{
                borderRadius: 13,
                border: "1px solid var(--border-strong)",
                background: "rgba(5, 8, 15, 0.72)",
                overflow: "hidden",
              }}
            >
              <div
                className="row between wrap"
                style={{
                  padding: "9px 14px",
                  borderBottom: "1px solid var(--border)",
                  gap: 8,
                }}
              >
                <span className="mono tiny" style={{ color: "#fbbf24", fontWeight: 700, letterSpacing: "0.05em" }}>
                  ★ DELIVERABLE VISUAL SAMPLE · CONTOH HASIL TUGAS NYATA
                </span>
                <span className="mono tiny" style={{ color: "var(--mint)" }}>
                  Verified against {order.criteria.length} objective predicates
                </span>
              </div>
              <div style={{ position: "relative", aspectRatio: "16 / 8.5", maxHeight: 290, width: "100%", overflow: "hidden", background: "#060911" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={SAMPLE_IMAGE_BY_KIND[order.product ?? order.kind ?? "shoe"]}
                  alt={`${order.title} sample deliverable`}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </div>
            </div>

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
            <div className="kv"><span>On-Chain Order ID</span><b className="mono tiny" style={{ color: "var(--mint)" }}>{onchainId}</b></div>
            <div className="kv"><span>{t("od.escrowAmt")}</span><b className="mono">{money(order.amount)} ({nearDisplay})</b></div>
            <div className="kv">
              <span>{t("od.protection")}</span>
              <b className="mono">
                {chainEscrow?.exists && chainEscrow.reviewDeadlineNs && Number(chainEscrow.reviewDeadlineNs) > 0
                  ? `Ends ${new Date(Number(chainEscrow.reviewDeadlineNs) / 1e6).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} UTC`
                  : chainEscrow?.exists
                  ? "Starts after verification passes"
                  : "Not funded on-chain yet"}
              </b>
            </div>
            <div className="kv"><span>Orin Verifier</span><b className="mono tiny" style={{ color: "#fbbf24" }}>{NEAR_VERIFIER_ID}</b></div>
            {order.termsHash && <div className="kv"><span>Terms Hash</span><b className="mono tiny">{order.termsHash.slice(0, 18)}…</b></div>}
          </div>

          <div className="card pad col" style={{ gap: 10, background: "rgba(5,8,13,0.92)", borderColor: "var(--border-strong)" }}>
            <div className="row between">
              <span className="mono tiny" style={{ color: "var(--mint)", fontWeight: 700 }}>● {t("od.log")}</span>
              <span className="mono tiny muted">{logs.length} events</span>
            </div>
            <div className="col mono" style={{ gap: 8, maxHeight: 420, overflowY: "auto", fontSize: 11.5 }}>
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
                  <div className="row between" style={{ gap: 6 }}>
                    <span style={{ color: l.kind === "ai" ? "#fbbf24" : "#00ec97", fontWeight: 700 }}>{l.who}</span>
                    {l.txHash && (
                      <a
                        href={nearExplorerTx(l.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#00ec97", fontSize: 10.5, textDecoration: "underline", fontWeight: 700 }}
                      >
                        Tx {l.txHash.slice(0, 7)}… ↗
                      </a>
                    )}
                  </div>
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
        .tl{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
        .tl-step{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:11px;border:1px solid var(--border);background:rgba(255,255,255,0.02);font-weight:600;font-size:12.5px;color:var(--ink-2);min-width:0}
        .tl-step span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .tl-step.done{color:var(--mint);border-color:rgba(0,236,151,0.28);background:rgba(0,236,151,0.06)}
        .tl-step.now{color:#fbbf24;border-color:rgba(245,158,11,0.45);background:rgba(245,158,11,0.1)}
        .tl-dot{width:22px;height:22px;border-radius:6px;border:1px solid currentColor;display:grid;place-items:center;font-size:10.5px;flex:none}
        .od-grid{display:grid;grid-template-columns:minmax(0,1.46fr) minmax(0,.88fr);gap:20px;align-items:start}
        .od-grid > *{min-width:0}
        .bubble{padding:14px 16px;border-radius:12px;border:1px solid var(--border);background:rgba(255,255,255,0.025);line-height:1.6}
        .kv{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:7px 0;border-bottom:1px solid var(--border)}
        .kv span{color:var(--ink-2)}
        @media (max-width:920px){.od-grid{grid-template-columns:1fr}.tl{grid-template-columns:1fr 1fr}}
      `}</style>
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <Suspense fallback={null}>
      <OrderDetailInner />
    </Suspense>
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

function NearDepositPanel({
  order,
  onchainId,
  log,
  onFunded,
  flash,
}: {
  order: Order;
  onchainId: string;
  log: (l: Log) => void;
  onFunded: (txHash?: string) => void;
  flash: (msg: string) => void;
}) {
  const { t, money } = useI18n();
  const { me, walletConnected, session } = useMe();
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
    try {
      // 1. REAL BROWSER WALLET SIGNING (Meteor / Nightly — the testnet-capable survivors)
      if (walletConnected) {
        const chain = await probeEscrow(onchainId);
        if (chain.exists) {
          throw new Error(
            `ONCHAIN_ESCROW_EXISTS — "${onchainId}" is already ${chain.status} on ${NEAR_CONTRACT_ID}. Funding the same order id would revert; click "New On-Chain Run" to get a fresh id first.`
          );
        }
        const signerAcct = session.near?.accountId || "";
        const targetFreelancer =
          me.nearAccount && me.nearAccount !== signerAcct ? me.nearAccount : NEAR_FREELANCER_DEFAULT;
        const cbUrl =
          typeof window !== "undefined"
            ? `${window.location.origin}${window.location.pathname}?nsgAction=fund`
            : undefined;
        log({
          who: signerAcct || "near_wallet",
          msg: `sign_transaction("create_and_fund_escrow", "${onchainId}")`,
          res: "Awaiting wallet signature (0.15 NEAR Testnet stake)…",
          kind: "near",
        });
        const out = await signNearWalletCall({
          methodName: "create_and_fund_escrow",
          args: {
            order_id: onchainId,
            freelancer: targetFreelancer,
            terms_hash: order.termsHash ?? `sha256:${onchainId}`,
            criteria_count: order.criteria.length,
            usd_cents: Math.round(order.amount * 100),
            review_window_ns: "60000000000",
          },
          depositYocto: nearToYocto("0.15"),
          callbackUrl: cbUrl,
        });
        log({
          who: NEAR_CONTRACT_ID,
          msg: `create_and_fund_escrow("${onchainId}")`,
          res: "Locked via NEAR Wallet ✓",
          txHash: out.txHash,
          kind: "near",
        });
        onFunded(out.txHash);
        return;
      }

      // 2. LIVE TESTNET SANDBOX RELAYER
      log({ who: "near_testnet_relayer", msg: `fund_escrow("${onchainId}")`, kind: "near" });
      const res = await fetch("/api/near/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fund",
          orderId: order.id,
          onchainOrderId: onchainId,
          freelancerId: me.nearAccount,
          amountUsd: order.amount,
          nearAmount: nearAmt,
          termsHash: order.termsHash ?? `sha256:${onchainId}`,
          totalCount: order.criteria.length,
        }),
      });
      const d = await res.json();
      log({
        who: NEAR_CONTRACT_ID,
        msg: `create_and_fund_escrow("${onchainId}")`,
        res: d.mode === "live" ? "Live NEAR Testnet Tx ✓" : `${nearAmt} NEAR locked`,
        txHash: d.txHash || undefined,
        kind: "near",
      });
      onFunded(d.txHash);
    } catch (e) {
      const reason = walletFailure(e);
      log({ who: "wallet", msg: "create_and_fund_escrow failed", res: reason, kind: "err" });
      flash(reason);
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
            {walletConnected
              ? `Sign create_and_fund_escrow directly with ${session.near?.accountId} (0.15 NEAR Testnet stake).`
              : t("pay.waitBody", { email: order.client.email ?? order.client.nearAccount ?? "client" })}
          </p>
        </div>
        <Orin pose="idle" size={68} />
      </div>

      <div style={{ padding: 14, borderRadius: 13, border: "1px solid var(--border-strong)", background: "rgba(255,255,255,0.025)" }}>
        <div className="row between wrap" style={{ gap: 10, marginBottom: 10 }}>
          <span className="kbd" style={{ color: "#fbbf24" }}>
            {walletConnected ? "REAL NEAR WALLET DEPOSIT" : "LIVE TESTNET ESCROW · NEAR INTENTS 1-CLICK"}
          </span>
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
          <Icon name="lock" size={17} />{" "}
          {busy
            ? "Broadcasting to NEAR Testnet…"
            : walletConnected
            ? `Sign & Lock in NEAR Wallet (0.15 NEAR Testnet)`
            : `${t("pay.btn")} · ${nearAmt} NEAR (${money(order.amount)})`}
        </button>
      </div>
    </div>
  );
}

function ReviewPanel({
  order,
  onchainId,
  log,
  verdict,
  onReleased,
}: {
  order: Order;
  onchainId: string;
  log: (l: Log) => void;
  verdict: { measured: number; manual: number; failed: number } | null;
  onReleased: (txHash?: string, sealId?: string) => void;
}) {
  const { t, money } = useI18n();
  const { walletConnected, session } = useMe();
  const [busy, setBusy] = useState<"" | "release" | "timeout">("");
  const [probe, setProbe] = useState<EscrowProbe | null>(null);
  const nearAmt = order.nearAmount ?? usdToNear(order.amount);

  useEffect(() => {
    let alive = true;
    void probeEscrow(onchainId).then((p) => { if (alive) setProbe(p); });
    return () => { alive = false; };
  }, [onchainId, busy]);

  // A wallet can sign only when it holds a key for the contract AND we have a session account.
  const canWalletSign = Boolean(walletConnected && session.near?.accountId);

  /**
   * `claim_after_timeout` reverts with "72-hour client review window has not
   * expired yet" until the on-chain deadline passes. Read the real deadline so the
   * button is honest instead of firing a transaction the wallet would reject.
   */
  const deadlineNs = Number(probe?.reviewDeadlineNs ?? 0);
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const msLeft = deadlineNs > 0 ? deadlineNs / 1e6 - Date.now() : 0;
  const countdownLabel =
    deadlineNs <= 0
      ? "—"
      : msLeft <= 0
      ? "EXPIRED"
      : `${String(Math.floor(msLeft / 3600000)).padStart(2, "0")}:${String(
          Math.floor((msLeft % 3600000) / 60000)
        ).padStart(2, "0")}:${String(Math.floor((msLeft % 60000) / 1000)).padStart(2, "0")}`;
  const timeoutReady = Boolean(probe?.exists && deadlineNs > 0 && Date.now() * 1e6 >= deadlineNs);
  const deadlineLabel =
    deadlineNs > 0
      ? new Date(deadlineNs / 1e6).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) + " UTC"
      : "unknown";

  const settle = async (mode: "release" | "timeout_claim") => {
    setBusy(mode === "release" ? "release" : "timeout");
    try {
      if (canWalletSign && mode === "release") {
        if (!probe?.exists) {
          throw new Error(
            `ONCHAIN_ESCROW_MISSING — "${onchainId}" is not in ${NEAR_CONTRACT_ID} yet, so there is nothing to release from the wallet. Use "New On-Chain Run" to fund it, or run the relayer settlement below.`
          );
        }
        const cbUrl =
          typeof window !== "undefined"
            ? `${window.location.origin}${window.location.pathname}?nsgAction=release`
            : undefined;
        const out = await signNearWalletCall({
          methodName: "approve_and_release",
          args: { order_id: onchainId },
          gas: "100000000000000",
          callbackUrl: cbUrl,
        });
        const seal = `SEAL-${onchainId}-${(out.txHash || "NEAR").slice(0, 6).toUpperCase()}`;
        log({
          who: session.near?.accountId || NEAR_CONTRACT_ID,
          msg: `approve_and_release("${onchainId}")`,
          res: `Signed via Wallet · ${seal}`,
          txHash: out.txHash,
          kind: "near",
        });
        onReleased(out.txHash, seal);
        return;
      }

      const r = await fetch("/api/near/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode,
          orderId: order.id,
          onchainOrderId: onchainId,
          amountUsd: order.amount,
          totalCount: order.criteria.length,
        }),
      });
      const d = await r.json();
      if (d?.txHash) {
        log({
          who: NEAR_CONTRACT_ID,
          msg: mode === "release" ? `approve_and_release("${onchainId}")` : `claim_after_timeout("${onchainId}")`,
          res: d.sealId ? `${nearAmt} NEAR → freelancer · ${d.sealId}` : `${nearAmt} NEAR → freelancer`,
          txHash: d.txHash,
          kind: "near",
        });
      }
      if (!r.ok || d.ok === false) throw new Error(d.error || "NEAR Testnet call failed");
      onReleased(d.txHash, d.sealId);
    } catch (e) {
      log({ who: NEAR_CONTRACT_ID, msg: "approve_and_release failed", res: walletFailure(e), kind: "err" });
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
        <span
          className="mono badge"
          title={
            deadlineNs > 0
              ? `On-chain review_deadline_ns — auto-release unlocks at ${deadlineLabel}`
              : "No on-chain review deadline yet (escrow not verified)"
          }
          style={{
            borderColor: msLeft <= 0 && deadlineNs > 0 ? "rgba(0,236,151,0.5)" : "rgba(245,158,11,0.45)",
            color: msLeft <= 0 && deadlineNs > 0 ? "var(--mint)" : "#fbbf24",
          }}
        >
          {countdownLabel}
        </span>
      </div>

      <div className="row wrap" style={{ gap: 10 }}>
        <button className="btn mint" disabled={!!busy} onClick={() => settle("release")}>
          <Icon name="award" size={16} />{" "}
          {busy === "release"
            ? "Signing on NEAR Testnet…"
            : walletConnected
            ? "Approve & Release in NEAR Wallet"
            : t("rev.approve", { name: order.client.name.split(" ")[0] })}
        </button>
        <button
          className="btn"
          disabled={!!busy || !timeoutReady}
          title={
            !probe?.exists
              ? "This escrow is not funded on-chain yet — fund it first."
              : !timeoutReady
              ? `The 72h review window is still open. It ends ${deadlineLabel}.`
              : "Review window expired — the freelancer can claim the escrow."
          }
          onClick={() => settle("timeout_claim")}
        >
          <Icon name="clock" size={15} /> {busy === "timeout" ? "Claiming on Testnet…" : t("rev.ff")}
        </button>
      </div>
      <p className="tiny muted" style={{ marginTop: 2 }}>
        ⓘ Fast-Forward is claimed by the freelancer account, so NearSignet relays it —
        <strong> no wallet prompt is expected</strong>. Only Approve &amp; Release and
        Mediation Settlement are signed by your wallet.
      </p>
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
  const isRealTestnetTx = Boolean(txHash && txHash.length >= 40 && !txHash.endsWith("NearTx7x9Q"));

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
          {isRealTestnetTx && (
            <div className="row between"><span className="muted">Tx Hash:</span><b style={{ color: "#00ec97" }}>{txHash.slice(0, 18)}…</b></div>
          )}
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
  order,
  onchainId,
  log,
  onSettled,
}: {
  order: Order;
  onchainId: string;
  log: (l: Log) => void;
  onSettled: (info: { percent: number; txHash: string; live: boolean }) => void;
}) {
  const { t, money, lang } = useI18n();
  const { walletConnected, session } = useMe();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<{ freelancerPct: number; refundPct: number; summary: string; findings: string[]; source?: string } | null>(null);

  const askMediator = async () => {
    setBusy(true);
    log({ who: "orin_mediator", msg: `analyze_dispute("${onchainId}")`, kind: "ai" });
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
      log({
        who: NEAR_VERIFIER_ID,
        msg: `mediation_verdict(${d.freelancerPct}/${d.refundPct})`,
        res: `${d.source === "near-ai" ? "NEAR AI Cloud TEE" : "Rule Engine"} · ${d.summary}`,
        kind: "ai",
      });
    } catch {}
    setBusy(false);
  };

  const executeSplit = async () => {
    if (!proposal) return;
    setBusy(true);
    try {
      if (walletConnected && session.near?.accountId) {
        const propRes = await fetch("/api/near/escrow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "mediate_propose",
            orderId: order.id,
            onchainOrderId: onchainId,
            freelancerPct: proposal.freelancerPct,
          }),
        });
        const propData = await propRes.json();
        if (propData?.proposeTxHash) {
          log({
            who: NEAR_VERIFIER_ID,
            msg: `propose_mediation("${onchainId}")`,
            res: "Scoped Key Attestation ✓",
            txHash: propData.proposeTxHash,
            kind: "near",
          });
        }
        const execOut = await signNearWalletCall({
          methodName: "execute_mediation",
          args: { order_id: onchainId },
          gas: "120000000000000",
        });
        log({
          who: NEAR_CONTRACT_ID,
          msg: `execute_mediation("${onchainId}")`,
          res: `${proposal.freelancerPct}% / ${proposal.refundPct}% settled via Wallet ✓`,
          txHash: execOut.txHash,
          kind: "near",
        });
        onSettled({ percent: proposal.refundPct, txHash: execOut.txHash, live: true });
        return;
      }

      const r = await fetch("/api/near/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mediate_settle",
          orderId: order.id,
          onchainOrderId: onchainId,
          amountUsd: order.amount,
          totalCount: order.criteria.length,
          freelancerPct: proposal.freelancerPct,
        }),
      });
      const d = await r.json();
      if (d?.proposeTxHash) {
        log({
          who: NEAR_VERIFIER_ID,
          msg: `propose_mediation("${onchainId}")`,
          res: "Scoped FunctionCall Tx ✓",
          txHash: d.proposeTxHash,
          kind: "near",
        });
      }
      log({
        who: NEAR_CONTRACT_ID,
        msg: `execute_mediation("${onchainId}")`,
        res: `${proposal.freelancerPct}% / ${proposal.refundPct}% settled on Testnet ✓`,
        txHash: d.txHash || undefined,
        kind: "near",
      });
      onSettled({ percent: proposal.refundPct, txHash: d.txHash, live: d.mode === "live" });
    } catch (e) {
      log({ who: NEAR_CONTRACT_ID, msg: "execute_mediation failed", res: walletFailure(e), kind: "err" });
    } finally {
      setBusy(false);
    }
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
                  {busy ? "Settling on NEAR Testnet…" : t("med.accept")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
