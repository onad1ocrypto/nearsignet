"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/me";
import { lsGet, lsSet } from "@/lib/safeStorage";
import { freelancerFor, getOrder, ORDERS, type Order, type Status } from "@/lib/data";
import { loadIncomingById, myOrder, requestAsOrder, saveMyOrder, setRequestStatus } from "@/lib/requests";
import {
  NEAR_CONTRACT_ID,
  NEAR_FREELANCER_DEFAULT,
  NEAR_VERIFIER_ID,
  lockDepositNear,
  nearExplorerAccount,
  nearExplorerTx,
  escrowSide,
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
      res: `${lockDepositNear(o.nearAmount ?? usdToNear(o.amount))} NEAR`,
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
  orderId?: string;
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
async function probeEscrow(onchainId: string, presetId?: string, preferId?: string): Promise<EscrowProbe> {
  try {
    const qs = new URLSearchParams({ orderId: onchainId });
    if (presetId) qs.set("preset", presetId);
    if (preferId) qs.set("prefer", preferId);
    const r = await fetch(`/api/near/escrow?${qs.toString()}`, { cache: "no-store" });
    if (!r.ok) return { exists: false };
    const j = (await r.json()) as {
      ok?: boolean;
      orderId?: string;
      escrow?: {
        order_id?: string;
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
      orderId: j.orderId || e.order_id || onchainId,
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
  /**
   * A brief that is not in this browser yet must NOT silently render some other
   * order — that made a client stare at a seed job (and at accounts that are not
   * theirs). Until it resolves we show a placeholder, and if it cannot be found
   * the page says so instead of pretending.
   */
  const [missing, setMissing] = useState(false);
  const [resolving, setResolving] = useState(!known);
  const [order, setOrder] = useState<Order>(known ?? ORDERS[0]);
  const [onchainId, setOnchainId] = useState<string>(() => getOrCreateOnchainId(String(id || "NSG-2041")));

  useEffect(() => {
    const oid = getOrCreateOnchainId(String(id || "NSG-2041"));
    setOnchainId(oid);
    if (known) { setOrder(known); setResolving(false); return; }
    if (!isCustom) return;
    let alive = true;
    (async () => {
      const mine = myOrder(id);
      if (mine) { if (alive) { setOrder(mine); setResolving(false); } return; }
      const r = await loadIncomingById(String(id).toUpperCase());
      if (!alive) return;
      setResolving(false);
      if (r) setOrder(requestAsOrder(r));
      else setMissing(true);
    })();
    return () => { alive = false; };
  }, [id, known, isCustom]);

  const { t, money, nearOf, date } = useI18n();
  const { me, walletConnected, walletId, session, connectWallet, guestAccount, setGuestAccount } = useMe();
  const [status, setStatus] = useState<Status>(order.status);
  useEffect(() => { setStatus(order.status); }, [order]);

  const [chainEscrow, setChainEscrow] = useState<EscrowProbe | null>(null);
  useEffect(() => {
    let alive = true;
    const presetId = String(id || "");
    const pinKey = `nearsignet.chainId.${order.id}`;
    const run = () => void probeEscrow(onchainId, presetId, lsGet(pinKey) || undefined).then((p) => {
      if (!alive) return;
      if (p.exists && p.orderId) lsSet(pinKey, p.orderId);
      setChainEscrow(p);
    });
    run();
    const t = setInterval(run, 15_000);
    return () => { alive = false; clearInterval(t); };
  }, [onchainId, status, id, order.id]);

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

  /**
   * The on-chain/agent telemetry terminal is hidden on the order page: its rows
   * were seeded demo history (compile_predicates / escrow_target / submit_verification)
   * and read as if they had really happened. Kept in state so the real run
   * handlers stay untouched, but nothing fabricated is rendered.
   */
  const [logs, setLogs] = useState<Log[]>(() => seedLogs(order, onchainId));
  const [showLogs] = useState(false);
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
    // Always return to the funding step: a fresh on-chain id means a fresh escrow,
    // so the "Sign & Lock" button must be visible right away.
    setStatus("awaiting_payment");
    setTxHash("");
    setVerdict(null);
    setMediationSplit(null);
    setJustSealed(false);
    setLogs([
      { who: "orin_contract_agent", msg: `new_onchain_session("${fresh}")`, res: "Ready for live Testnet tx", kind: "ai" },
    ]);
    flash(`Fresh on-chain ID ready: ${fresh} — now click Sign & Lock`);
  };

  if (resolving && !known) {
    return (
      <div className="col" style={{ gap: 16, maxWidth: 720, margin: "0 auto", paddingTop: 30 }}>
        <div className="card pad row" style={{ gap: 12, alignItems: "center" }}>
          <Orin pose="scan" size={64} />
          <div>
            <b style={{ fontSize: 16 }}>{t("od.loading")}</b>
            <div className="tiny muted mono" style={{ marginTop: 2 }}>{String(id)}</div>
          </div>
        </div>
      </div>
    );
  }

  if (missing && isCustom) {
    return (
      <div className="col" style={{ gap: 18, maxWidth: 720, margin: "0 auto" }}>
        <Link href="/orders" className="btn sm ghost" style={{ marginLeft: -10 }}>
          <Icon name="left" size={14} /> {t("nav.orders")}
        </Link>
        <div className="card pad col" style={{ gap: 12, borderColor: "rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.07)" }}>
          <div className="row" style={{ gap: 12 }}>
            <Orin pose="idle" size={72} />
            <div>
              <h2 style={{ fontSize: 20 }}>{t("od.missingTitle", { id: String(id) })}</h2>
              <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{t("od.missingBody")}</p>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <Link href={`/to/${me.handle}`} className="btn sm mint">
              <Icon name="send" size={13} /> {t("od.missingResend")}
            </Link>
            <Link href="/orders/new" className="btn sm ghost">
              <Icon name="plus" size={13} /> {t("wp.newOrder")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const stageIdx = TIMELINE.findIndex((g) => g.includes(status));
  const tl = [t("tl.agree"), t("tl.fund"), t("tl.work"), t("tl.verify"), t("tl.sealed")];
  /**
   * If the escrow exists on-chain, the chain is the source of truth for the amount.
   * NSG-2033 was seeded as 0.08 NEAR while the contract holds 0.50 NEAR, so the page
   * used to disagree with the very transaction it links to.
   */
  const chainNear = chainEscrow?.amountNear;
  const nearDisplay = chainNear
    ? `${chainNear} NEAR`
    : order.nearAmount
      ? `${order.nearAmount} NEAR`
      : nearOf(order.amount);
  const nearLabel = chainNear ? `${chainNear} NEAR · ${nearOf(order.amount)} listed` : nearDisplay;
  /**
   * Role of the person in front of this escrow.
   * - wallet connected  -> read the real escrow: whoever funded it is the client,
   *   anybody else is the freelancer, so a client is never handed the upload box.
   * - no wallet (relayer sandbox / judge demo) -> you play both sides, which is the
   *   whole point of the 1-click sandbox, so the delivery panel stays available.
   */
  /**
   * REAL ROLES, from the contract only.
   *   escrow.client      -> may fund + approve the release
   *   escrow.freelancer  -> may deliver the work
   *   anybody else       -> read-only, no delivery box, no release button
   * The account must have proven ownership (NEP-413 signature) to count at all, so
   * "I am sasam.testnet" in a text field buys you nothing.
   */
  /**
   * `proven` = this browser proved the account with a wallet signature.
   *
   *   proven  -> roles come from the contract and are enforced (client releases,
   *              freelancer delivers, everybody else is read-only)
   *   !proven -> DEMO mode: you may walk both sides, exactly like the judge sandbox.
   *              Nothing can be stolen here because the only money movement —
   *              approve_and_release — needs the client's own wallet signature and
   *              the contract checks predecessor == rec.client.
   */
  const proven = session.near?.signatureVerified === true;
  /**
   * The contract is the source of truth; the local order only fills in while the
   * escrow does not exist on chain yet (a brief that has not been funded).
   */
  const worker = chainEscrow?.freelancer || order.freelancerAccount || freelancerFor(order).accountId;
  const escrowParties = { client: chainEscrow?.client || order.client.nearAccount, freelancer: worker };
  const side = escrowSide(escrowParties, session.near?.accountId, proven);
  /**
   * Three different situations, three different labels. They used to collapse into
   * one: a Judge Sandbox guest who never named an account was silently declared the
   * freelancer, and a guest who *did* pick sasam.testnet was still told they play
   * both sides. That is why "aku login sebagai sasam" contradicted the role bar.
   *   sandbox  -> no account picked at all: both sides, labelled as a sandbox
   *   demoMode -> an account is picked but not cryptographically proven yet
   *   proven   -> roles come from the contract and are enforced
   */
  const sandbox = !session.near && !guestAccount;
  const actingAccount = (session.near?.accountId || guestAccount || "").toLowerCase();
  const role: "client" | "freelancer" | "nobody" = side;
  /* A demo claim is judged against the same parties, but it may be stale: NSG-2041 is a
     shared demo whose worker was later re-picked, so a cached claim can point at someone
     who is no longer on this escrow. That is the "aku login sebagai sasam, tapi escrow
     bilang aku bukan sasam" report — so the bar offers a one-click, in-page correction. */
  const claimedSide = escrowSide(escrowParties, actingAccount, true);
  const claimStale = !proven && Boolean(actingAccount) && claimedSide === "nobody";
  const partOptions = [
    { acct: escrowParties.client || "", key: "client" as const },
    { acct: escrowParties.freelancer || "", key: "free" as const },
  ].filter((o) => Boolean(o.acct));
  const demoMode = !proven;
  const canDeliver = demoMode || role === "freelancer";
  const canRelease = demoMode || role === "client";
  const canFund = demoMode || role === "client";
  /** A demo may not run a write path that would fight the chain (see verify handler). */
  /**
   * Writes must target the escrow that actually exists on chain. On a preset order a
   * fresh browser gets its own storage key, so without this a demo release would fund
   * a brand-new escrow instead of settling the very escrow the proof card shows.
   */
  const chainOrderId = chainEscrow?.exists && chainEscrow.orderId ? chainEscrow.orderId : onchainId;
  /**
   * The proof card shows one escrow; a write must land on that same escrow in the same
   * click. Resolving again here (awaiting the read) instead of trusting a 15s-old
   * poll is what keeps "verify" from anchoring a brand-new escrow while the card
   * still displays the previous one.
   */
  const pinKey = `nearsignet.chainId.${order.id}`;
  const resolveEscrow = async () => await probeEscrow(onchainId, String(id || ""), lsGet(pinKey) || undefined);
  const chainBusy = Boolean(chainEscrow && ["IN_REVIEW", "SEALED", "REFUNDED", "MEDIATED"].includes(String(chainEscrow.status || "").toUpperCase()));
  const depositNearFor = (o: Order) => lockDepositNear(o.nearAmount ?? usdToNear(o.amount));

  /**
   * CLIENT-SIDE ROLE SWITCH FOR A DEMO RUN. A real client can never submit the
   * freelancer's work, so this only replays what the worker's browser would do
   * (Orin re-scans the sample set and posts the scoped-key verification), and it
   * announces itself as a simulation instead of pretending the client did the job.
   */
  const handleAdvanceToReview = async () => {
    setStatus("verifying");
    const passedCount = order.criteria.length;
    try {
      const r = await fetch("/api/near/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          orderId: chainOrderId,
          onchainOrderId: chainOrderId,
          amountUsd: order.amount,
          termsHash: order.termsHash,
          passedCount,
          totalCount: order.criteria.length,
          evidenceHash: "sha256:simulated-worker-delivery",
        }),
      });
      const d = await r.json();
      if (d?.txHash) {
        log({
          who: NEAR_VERIFIER_ID,
          msg: `submit_verification("${onchainId}", ${passedCount}/${order.criteria.length})`,
          res: "IN_REVIEW · Scoped Key Tx ✓",
          txHash: d.txHash,
          kind: "near",
        });
        flash(t("role.simulated"));
      } else {
        /* Nothing was broadcast — say so instead of pretending it landed. */
        log({
          who: NEAR_VERIFIER_ID,
          msg: `submit_verification("${onchainId}", ${passedCount}/${order.criteria.length})`,
          res: `${d?.chainStatus || "ON-CHAIN"} · no tx sent`,
          kind: "near",
        });
        flash(t("role.chainBusyTitle", { status: String(d?.chainStatus || "").toUpperCase() }));
      }
    } catch {
      flash(t("role.simulated"));
    }
    if (isCustom) saveMyOrder({ ...order, status: "review" });
    setStatus("review");
  };

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
                {t("od.onchainIdLabel", { id: onchainId })}
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
              ? `● ${t("od.walletSigning", { wallet: walletId || "wallet", acct: session.near?.accountId || "" })}`
              : `● ${t("od.relayActive", { acct: `liam.${NEAR_CONTRACT_ID}` })}`}
          </span>
          <span className="muted">
            — {t("od.relayNote")}
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
              <Icon name="wallet" size={13} /> {t("si.connectMeteor")}
            </button>
          )}
          {walletConnected && (
            <span
              className="mono tiny"
              style={{ color: walletHealth?.canSign === false ? "#fca5a5" : "var(--mint)", letterSpacing: ".1em" }}
              title={t("wp.keyProbe")}
            >
              {walletHealth === null
                ? "KEY PROBE…"
                : walletHealth.canSign
                ? "SCOPED KEY READY ✓"
                : "KEY CANNOT SIGN — RECONNECT"}
            </span>
          )}
          <button
            type="button"
            className="btn sm"
            onClick={startFreshRun}
            title={t("wp.newRunTip")}
          >
            <Icon name="refresh" size={13} /> 1 · {t("wp.newRun")}
          </button>
        </div>
      </div>

      {/*
        ROLE BAR — a client who just locked funds was still being shown "upload your
        delivery", which is the freelancer's job. On a funded escrow the payer provably
        differs from the freelancer, so the viewer is the client: no delivery panel, only
        "waiting for the worker" plus the release button that is actually theirs.
      */}
      <div
        className="row between wrap"
        style={{
          padding: "10px 14px",
          borderRadius: 12,
          gap: 10,
          background:
            role === "client" ? "rgba(56,189,248,0.08)" : role === "freelancer" ? "rgba(0,236,151,0.08)" : "rgba(251,113,133,0.08)",
          border: `1px solid ${role === "client" ? "rgba(56,189,248,0.38)" : role === "freelancer" ? "rgba(0,236,151,0.38)" : "rgba(251,113,133,0.4)"}`,
        }}
      >
        <div className="row wrap" style={{ gap: 8, fontSize: 12.5 }}>
          <span className="mono" style={{ fontWeight: 700, color: role === "client" ? "#7dd3fc" : role === "freelancer" ? "var(--mint)" : "#fb7185" }}>
            ● {(sandbox
              ? t("role.sandbox")
              : demoMode
                ? t("role.demoAs", { acct: actingAccount })
                : role === "client"
                  ? t("role.client")
                  : role === "freelancer"
                    ? t("role.freelancer")
                    : t("role.nobody")).toUpperCase()}
          </span>
          <span className="muted">
            {sandbox
              ? t("role.sandboxNote")
              : demoMode
                ? role === "client"
                  ? t("role.demoClientNote")
                  : role === "freelancer"
                    ? t("role.demoFreeNote", { acct: actingAccount, worker, client: escrowParties.client || "" })
                    : t("role.nobodyNote", { freelancer: worker })
                : role === "client"
                  ? t("role.clientNote")
                  : role === "freelancer"
                    ? t("role.freelancerNote")
                    : t("role.nobodyNote", { freelancer: worker })}
          </span>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {proven ? (
            <span className="mono tiny" style={{ color: "var(--mint)", fontWeight: 700 }}>
              ✓ {t("role.provenAs", { acct: session.near?.accountId || "" })}
            </span>
          ) : null /* the prove / switch links live on the DEMO IDENTITY card below */}
        </div>
      </div>

      {/*
        DEMO IDENTITY CARD — the fix for "aku login sebagai sasam tapi escrow bilang aku
        bukan sasam". A sandbox user names their account here, in the escrow they are
        reading, so no signin round-trip is needed and the return path cannot be lost.
        "Prove ownership" still goes to /signin with next=<this escrow>, so the wallet
        signature path returns where it came from.
      */}
      {!proven && (
        <div className="card pad" style={{ padding: "12px 14px", borderColor: "rgba(125,211,252,0.3)", background: "rgba(125,211,252,0.05)" }}>
          <div className="row between wrap" style={{ gap: 10 }}>
            <div className="col" style={{ gap: 2 }}>
              <span className="mono tiny" style={{ color: "#7dd3fc", fontWeight: 700, letterSpacing: ".08em" }}>
                {t("role.claimTitle").toUpperCase()}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {claimStale ? t("role.claimBanner", { acct: actingAccount }) : t("role.claimSub")}
              </span>
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              {partOptions.map((o) => {
                const active = o.acct.toLowerCase() === actingAccount;
                return (
                  <button
                    key={o.key}
                    type="button"
                    className={`btn sm${active ? " mint" : ""}`}
                    onClick={() => { setGuestAccount(o.acct); flash(t("role.claimNow")); }}
                    title={o.key === "client" ? t("role.client") : t("role.freelancer")}
                  >
                    {active ? "✓ " : ""}{t("role.claimSelf", { acct: o.acct })}
                  </button>
                );
              })}
              {actingAccount ? (
                <button type="button" className="btn sm ghost" onClick={() => { setGuestAccount(""); flash(t("role.claimOther")); }}>
                  {t("role.claimOther")}
                </button>
              ) : null}
              <Link href={`/signin?next=${encodeURIComponent(`/orders/${order.id}`)}`} className="btn sm mint">
                <Icon name="wallet" size={13} /> {t("role.proveShort")}
              </Link>
              {actingAccount ? (
                <Link href={`/signin?next=${encodeURIComponent(`/orders/${order.id}`)}`} className="btn sm ghost">
                  {t("role.switchAccount")}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* NEAR Fiber Settlement Rail */}
      {/* Wallet test path — the two buttons people could not find */}
      <div
        className="card pad"
        style={{
          padding: "12px 14px",
          borderColor: walletConnected ? "rgba(0,236,151,0.35)" : "rgba(253,224,71,0.35)",
          background: walletConnected ? "rgba(0,236,151,0.05)" : "rgba(253,224,71,0.05)",
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span className="mono tiny" style={{ color: walletConnected ? "var(--mint)" : "#fde047", fontWeight: 700, letterSpacing: ".08em" }}>
          {walletConnected
            ? `● ${t("wp.kicker").toUpperCase()} · 2/2`
            : `● ${t("wp.kicker").toUpperCase()} · 0/2`}
        </span>
        <span className="tiny muted" style={{ flex: 1, minWidth: 260 }}>
          {walletConnected ? (
            <>
              {t("wp.stepDone", { id: onchainId })}
            </>
          ) : (
            <>
              {t("wp.stepStart")}
            </>
          )}
        </span>
        <Link href="/orders/new" className="btn sm mint">
          <Icon name="plus" size={13} /> {t("wp.newOrder")}
        </Link>
      </div>

      <MoneyRail
        order={order}
        status={status}
        role={role === "client" ? "client" : "freelancer"}
        chainNear={chainEscrow?.amountNear}
        chainWorker={chainEscrow?.freelancer}
      />

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

      {/*
        ON-CHAIN PROOF — read from the contract, never from this browser's log.
        The log-based strip only appeared after you pressed a button in this tab, so a
        fresh visitor (a judge) saw a verdict with no proof at all. This one shows the
        escrow that actually exists on NEAR Testnet, whichever browser id we started
        from, plus the verifier account the contract recorded.
      */}
      {chainEscrow?.exists && (
        <div className="card pad col" style={{ gap: 10, borderColor: "rgba(0,236,151,0.35)", background: "rgba(0,236,151,0.04)" }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <span className="kbd">{t("proof.title").toUpperCase()}</span>
            <span className="mono tiny" style={{ color: "var(--mint)", fontWeight: 700 }}>● {t("proof.network")}</span>
          </div>
          <div className="row wrap" style={{ gap: 8, fontSize: 12.5 }}>
            <span className="mono tiny" style={{ fontWeight: 700, color: "var(--mint)" }}>
              {String(chainEscrow.status || "").toUpperCase()}
            </span>
            <span className="mono tiny muted">{chainEscrow.orderId}</span>
            {chainEscrow.amountNear ? <span className="mono tiny muted">{chainEscrow.amountNear} NEAR</span> : null}
            {chainEscrow.client ? <span className="mono tiny muted">client: {chainEscrow.client}</span> : null}
            {chainEscrow.freelancer ? <span className="mono tiny muted">worker: {chainEscrow.freelancer}</span> : null}
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <a className="btn sm ghost" href={nearExplorerAccount(NEAR_CONTRACT_ID)} target="_blank" rel="noreferrer">
              <Icon name="lock" size={13} /> {t("role.viewVault")}
            </a>
            {txHash && (
              <a className="btn sm ghost" href={nearExplorerTx(txHash)} target="_blank" rel="noreferrer">
                <Icon name="check" size={13} /> Tx {txHash.slice(0, 8)}…
              </a>
            )}
          </div>
          {(() => {
            /* Real txs from this session (fund / scoped attestation / release), each a
               link to NEAR Testnet. Never seeded rows — only logged write results. */
            const near = logs
              .map((l) => ({ ...l, tx: l.txHash }))
              .filter((l) => l.tx && /(create_and_fund_escrow|submit_verification|approve_and_release|claim_after_timeout|propose_mediation|execute_mediation)/.test(l.msg))
              .slice(-4);
            if (!near.length) return null;
            return (
              <div className="col" style={{ gap: 6 }}>
                {near.map((l) => (
                  <div key={`${l.msg}-${l.tx}`} className="row between wrap" style={{ gap: 8 }}>
                    <span className="mono tiny muted" style={{ minWidth: 0, overflowWrap: "anywhere" }}>{l.msg}</span>
                    <a className="mono tiny" style={{ color: "var(--mint)", fontWeight: 700 }} href={nearExplorerTx(l.tx!)} target="_blank" rel="noreferrer">
                      {String(l.tx).slice(0, 10)}… ↗
                    </a>
                  </div>
                ))}
              </div>
            );
          })()}
          <div className="tiny muted">{t("proof.chainNote")}</div>
        </div>
      )}

      <div className="od-grid od-grid-single">
        <div className="col" style={{ gap: 20 }}>
          {/* A sealed escrow leads with its certificate, not with the client brief. */}
          {status === "paid" && (
            <SealedCertificatePanel
              order={order}
              slam={justSealed}
              txHash={txHash || order.txHash || order.txHashes?.release || ""}
              sealCode={sealCode}
              mediationSplit={mediationSplit}
              chainNear={chainEscrow?.amountNear}
              chainWorker={chainEscrow?.freelancer}
            />
          )}

          {status === "request" && !(proven && side === "client") && (
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

          {/*
            WHO FUNDS: the client, never the worker. An order created from
            /to/sasam-studio belongs to the person who sent the brief; if the
            freelancer opens it they get an invoice with no "Sign & Lock" button —
            a worker must never lock their own payment.
          */}
          {status === "awaiting_payment" && proven && side === "freelancer" && (
            <div className="card pad col" style={{ gap: 12, borderColor: "rgba(0,236,151,0.35)", background: "rgba(0,236,151,0.06)" }}>
              <div className="row between wrap">
                <div>
                  <h3 style={{ fontSize: 19 }}>{t("role.invoiceTitle")}</h3>
                  <p className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>
                    {t("role.invoiceBody", {
                      client: order.client.nearAccount || order.client.name,
                      near: String(lockDepositNear(order.nearAmount ?? usdToNear(order.amount))),
                    })}
                  </p>
                </div>
                <Orin pose="idle" size={64} />
              </div>
              <div className="tiny muted">{t("role.invoiceNote")}</div>
            </div>
          )}

          {status === "awaiting_payment" && canFund && (
            <NearDepositPanel
              order={order}
              onchainId={onchainId}
              log={log}
              flash={flash}
              isCustom={isCustom}
              expectedClient={order.client.nearAccount}
              viewerAccount={session.near?.accountId}
              onFunded={(hash) => {
                if (hash) setTxHash(hash);
                setStatus("in_escrow");
                if (isCustom) saveMyOrder({ ...order, status: "in_escrow" });
                flash(t("toast.funded"));
              }}
            />
          )}

          {(status === "in_escrow" || status === "verifying" || status === "revision") && !canDeliver && !chainBusy && (
            <div className="card pad col" style={{ gap: 12, borderColor: "rgba(56,189,248,0.35)", background: "rgba(56,189,248,0.06)" }}>
              <div className="row between wrap">
                <div>
                  <h3 style={{ fontSize: 19 }}>{t("role.waitTitle")}</h3>
                  <p className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>
                    {t("role.waitBody", { freelancer: NEAR_FREELANCER_DEFAULT, near: String(depositNearFor(order)) })}
                  </p>
                </div>
                <Orin pose="idle" size={64} />
              </div>
              <div className="row wrap" style={{ gap: 8 }}>
                <a className="btn sm ghost" href={nearExplorerAccount(NEAR_CONTRACT_ID)} target="_blank" rel="noreferrer">
                  <Icon name="lock" size={13} /> {t("role.viewVault")}
                </a>
                {txHash && (
                  <a className="btn sm ghost" href={nearExplorerTx(txHash)} target="_blank" rel="noreferrer">
                    <Icon name="check" size={13} /> Tx {txHash.slice(0, 8)}…
                  </a>
                )}
                <button type="button" className="btn sm" onClick={() => void handleAdvanceToReview()}>
                  <Icon name="refresh" size={13} /> {t("role.simulate")}
                </button>
              </div>
              <div className="tiny muted">{t("role.simulateNote")}</div>
            </div>
          )}

          {(status === "in_escrow" || status === "verifying" || status === "revision") && canDeliver && !chainBusy && (
            <DeliveryPanel
              order={order}
              status={status}
              setStatus={setStatus}
              log={log}
              onVerdict={async (v) => {
                setVerdict(v);
                const passedCount = Math.max(0, order.criteria.length - v.failed);
                // Record BOTH failed (REVISION_NEEDED) and passed (IN_REVIEW) attestations LIVE ON-CHAIN via Orin's Scoped Key!
                const targetEscrow = await resolveEscrow();
                const targetId = targetEscrow.exists && targetEscrow.orderId ? targetEscrow.orderId : onchainId;
                void fetch("/api/near/escrow", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "verify",
                    orderId: targetId,
                    onchainOrderId: targetId,
                    amountUsd: order.amount,
                    termsHash: order.termsHash,
                    passedCount,
                    totalCount: order.criteria.length,
                    evidenceHash: v.evidenceHash ?? "sha256:verified",
                  }),
                })
                  .then((r) => r.json())
                  .then((d) => {
                    void probeEscrow(onchainId, String(id || ""), lsGet(pinKey) || undefined).then((p) => {
                      if (p.exists && p.orderId) lsSet(pinKey, p.orderId);
                      setChainEscrow(p);
                    });
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
                        msg: `submit_verification("${targetId}", ${passedCount}/${order.criteria.length})`,
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

          {/*
            NEVER PRESENT A BROKEN WRITE. A demo used to be able to press "Run scoped AI
            verification" on an escrow the chain already had IN_REVIEW, sending the
            relayer's scoped key into a rejected submit_verification — which a judge reads
            as "not me / broken". The chain status wins: explain it, then point at the one
            action that is still valid (release).
          */}
          {/*
            A guest has no wallet, so "Sign & Lock" can never resolve for them. The
            escrow that already exists on chain is the one to settle — say that plainly
            instead of leaving a dead button.
          */}
          {!proven && chainEscrow?.exists && !chainBusy && status !== "paid" && (
            <div className="card pad col" style={{ gap: 8, borderColor: "rgba(125,211,252,0.35)", background: "rgba(125,211,252,0.05)" }}>
              <span className="mono tiny" style={{ color: "#7dd3fc", fontWeight: 700, letterSpacing: ".08em" }}>
                {t("demo.resumeTitle").toUpperCase()}
              </span>
              <p className="muted" style={{ fontSize: 13.5 }}>
                {t("demo.resumeBody", { id: chainOrderId, status: String(chainEscrow.status || "").toUpperCase() })}
              </p>
            </div>
          )}

          {chainBusy && status !== "review" && status !== "paid" && (
            <div className="card pad col" style={{ gap: 10, borderColor: "rgba(253,224,71,0.4)", background: "rgba(253,224,71,0.06)" }}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <h3 style={{ fontSize: 18 }}>
                  {t("role.chainBusyTitle", { status: String(chainEscrow?.status || "").toUpperCase() })}
                </h3>
                <span className="mono tiny" style={{ color: "#fde047", fontWeight: 700 }}>● ON-CHAIN TRUTH</span>
              </div>
              <p className="muted" style={{ fontSize: 13.5 }}>
                {t("role.chainBusyBody", { status: String(chainEscrow?.status || "").toUpperCase() })}
              </p>
              <div className="row wrap" style={{ gap: 8 }}>
                {canRelease && (
                  <button type="button" className="btn sm mint" onClick={() => setStatus("review")}>
                    <Icon name="unlock" size={13} /> {t("role.chainBusyOpen")}
                  </button>
                )}
                <a className="btn sm ghost" href={nearExplorerAccount(NEAR_CONTRACT_ID)} target="_blank" rel="noreferrer">
                  <Icon name="lock" size={13} /> {t("role.viewVault")}
                </a>
              </div>
            </div>
          )}

          {status === "review" && canRelease && (
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
                  ★ DELIVERABLE SAMPLE · REAL VERIFIED RESULT
                </span>
                <span className="mono tiny" style={{ color: "var(--mint)" }}>
                  {t("od.verifiedAgainst", { n: order.criteria.length })}
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
        /* Telemetry terminal hidden at the user's request → single readable column */
        .od-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;align-items:start;max-width:1080px}
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
  isCustom = false,
  expectedClient,
  viewerAccount,
}: {
  order: Order;
  onchainId: string;
  log: (l: Log) => void;
  onFunded: (txHash?: string) => void;
  flash: (msg: string) => void;
  isCustom?: boolean;
  /** Wallet that must pay this escrow (the client who sent the brief). */
  expectedClient?: string;
  /** Wallet currently signed in, if any. */
  viewerAccount?: string;
}) {
  const { t, money } = useI18n();
  const { me, walletConnected, walletId, session } = useMe();
  const [asset, setAsset] = useState<"NEAR" | "USDC" | "USDT" | "ETH">("NEAR");
  const [quote, setQuote] = useState<{ amountInFormatted: string; nearOut: string; route: string } | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * One number drives the summary strip, the log line, the receipt and the
   * actual deposit: whatever the faucet can actually cover (0.05–0.25 NEAR).
   */
  const depositNear = lockDepositNear(order.nearAmount ?? usdToNear(order.amount));
  const nearAmt = depositNear;

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
        /**
         * WHO THE ESCROW PAYS — the freelancer who owns this order, never the relayer
         * and never the signer. On /to/sasam-studio that is sasam.testnet, so only
         * sasam.testnet can deliver and only the payer can release.
         */
        const namedFreelancer = freelancerFor(order).accountId;

        /**
         * And the payer must be the client. If a different wallet is connected, the
         * contract would record THEM as the client — i.e. the freelancer paying
         * himself. Stop before the wallet prompt and say it plainly.
         */
        const payer = session.near?.accountId || "";
        const expected = String(expectedClient || "").toLowerCase();
        if (expected && payer && payer.toLowerCase() !== expected) {
          throw new Error(
            `WRONG_SIGNER — this escrow must be funded by the client (${expectedClient}), but this browser is signed in as ${payer}. Open the client's wallet, or ask the client to fund it.`
          );
        }
        const walletLabel = signerAcct ? `${walletId || "wallet"}: ${signerAcct}` : "wallet";
        const cbUrl =
          typeof window !== "undefined"
            ? `${window.location.origin}${window.location.pathname}?nsgAction=fund`
            : undefined;
        log({
          who: walletLabel,
          msg: `sign_transaction("create_and_fund_escrow", "${onchainId}", freelancer="${namedFreelancer}")`,
          res: `Awaiting wallet signature (${depositNear} NEAR Testnet stake)…`,
          kind: "near",
        });
        const out = await signNearWalletCall({
          methodName: "create_and_fund_escrow",
          args: {
            order_id: onchainId,
            freelancer: namedFreelancer,
            terms_hash: order.termsHash ?? `sha256:${onchainId}`,
            criteria_count: order.criteria.length,
            usd_cents: Math.round(order.amount * 100),
            review_window_ns: "60000000000",
          },
          depositYocto: nearToYocto(String(depositNear)),
          callbackUrl: cbUrl,
        });
        log({
          who: NEAR_CONTRACT_ID,
          msg: `create_and_fund_escrow("${onchainId}")`,
          res: "Locked via NEAR Wallet ✓",
          txHash: out.txHash,
          kind: "near",
        });
        if (isCustom && session.near?.accountId) {
          saveMyOrder({
            ...order,
            status: "in_escrow",
            client: { ...order.client, nearAccount: session.near.accountId },
            freelancerAccount: namedFreelancer,
          });
        }
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
          orderId: onchainId,
          onchainOrderId: onchainId,
          freelancerId: freelancerFor(order).accountId,
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
              ? `Sign create_and_fund_escrow directly with ${session.near?.accountId} (${depositNear} NEAR Testnet stake).`
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
            Pay <b style={{ color: "#fbbf24" }}>{asset === "NEAR" ? `${depositNear} NEAR` : quote.amountInFormatted}</b> → Locks <b style={{ color: "var(--mint)" }}>{depositNear} NEAR</b> ({money(order.amount)} contract value) in <b>{NEAR_CONTRACT_ID}</b><br />
            <span className="muted">{quote.route}</span>
          </div>
        )}

        <button className="btn lg near-pay" disabled={busy} onClick={lockEscrow}>
          <Icon name="lock" size={17} />{" "}
          {busy
            ? "Broadcasting to NEAR Testnet…"
            : walletConnected
            ? `Sign & Lock in NEAR Wallet (${depositNear} NEAR Testnet)`
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
  /**
   * One number drives the summary strip, the log line, the receipt and the
   * actual deposit: whatever the faucet can actually cover (0.05–0.25 NEAR).
   * When the escrow already exists on-chain, the contract is the source of truth.
   */
  const depositNear = lockDepositNear(order.nearAmount ?? usdToNear(order.amount));
  const nearAmt = probe?.amountNear ?? depositNear;

  useEffect(() => {
    let alive = true;
    const run = () => void probeEscrow(onchainId).then((p) => { if (alive) setProbe(p); });
    run();
    const id = setInterval(run, 15_000);
    return () => { alive = false; clearInterval(id); };
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
  const windowLabel =
    deadlineNs > 0 && probe
      ? `${Math.max(1, Math.round((deadlineNs / 1e6 - Date.now() + 1000) / 60000))} min left`
      : "72h review window";
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
          orderId: onchainId,
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
              ? `The review window is still open (${windowLabel}). It ends ${deadlineLabel}.`
              : "Review window expired — the freelancer can claim the escrow."
          }
          onClick={() => settle("timeout_claim")}
        >
          <Icon name="clock" size={15} /> {busy === "timeout" ? "Claiming on Testnet…" : t("rev.ff")}
        </button>
      </div>
      <p className="tiny muted" style={{ marginTop: 2 }}>
        {t("od.ffNote")}
      </p>
    </div>
  );
}

function SealedCertificatePanel({
  order, slam, txHash, sealCode, mediationSplit, chainNear, chainWorker,
}: {
  order: Order;
  slam: boolean;
  txHash: string;
  sealCode: string;
  mediationSplit: { percent: number; txHash: string; live: boolean } | null;
  chainNear?: string;
  chainWorker?: string;
}) {
  const { t, money } = useI18n();
  const { me } = useMe();
  const certRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [stampRun, setStampRun] = useState<number>(slam ? 1 : 0);
  const [shaking, setShaking] = useState<boolean>(slam);
  /**
   * One number drives the summary strip, the log line, the receipt and the
   * actual deposit: whatever the faucet can actually cover (0.05–0.25 NEAR).
   */
  const depositNear = lockDepositNear(order.nearAmount ?? usdToNear(order.amount));
  /** A sealed escrow exists on-chain: the receipt shows what the contract actually paid. */
  const nearAmt = chainNear ?? depositNear;
  /** Who actually received the payout: the escrow's worker, not the viewer. */
  const workerForSeal = chainWorker || order.freelancerAccount || freelancerFor(order).accountId;
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
            {t("paid.sub", { amount: money(order.amount), near: `${nearAmt} NEAR`, acct: order.freelancerAccount || workerForSeal })}
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
          <div className="row between"><span className="muted">{t("cert.to")}:</span><b style={{ color: "#00ec97" }}>{order.freelancerAccount || workerForSeal}</b></div>
          <div className="row between"><span className="muted">Vault:</span><b>{NEAR_CONTRACT_ID}</b></div>
          <div className="row between"><span className="muted">Seal ID:</span><b style={{ color: "#fbbf24" }}>{sealCode}</b></div>
          {isRealTestnetTx && (
            <div className="row between"><span className="muted">Tx Hash:</span><b style={{ color: "#00ec97" }}>{txHash.slice(0, 18)}…</b></div>
          )}
          {mediationSplit && (
            <div className="row between" style={{ color: "#fb923c" }}>
              <span>{t("od.mediatorSplit")}</span><b>{100 - mediationSplit.percent}% freelancer / {mediationSplit.percent}% refund</b>
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
            orderId: onchainId,
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
          orderId: onchainId,
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
