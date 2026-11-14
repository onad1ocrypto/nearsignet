"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/me";
import { NEAR_CONTRACT_ID, nearExplorerAccount } from "@/lib/near";
import type { SupportedWalletId } from "@/lib/wallet";
import { Icon } from "@/components/Icon";
import { Orin } from "@/components/Orin";
import { Kicker, LangSwitch, Logo, ThemeSwitch } from "@/components/ui";

function SignInInner() {
  const { t, lang } = useI18n();
  const { connectWallet, connectNear, startGuest, session, walletConnected, walletId, sessionReady } = useMe();
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/dashboard";

  const [accountId, setAccountId] = useState("raka.nearsignet-protocol.testnet");
  const [busy, setBusy] = useState<"" | SupportedWalletId | "rpc" | "faucet">("");
  const [err, setErr] = useState("");
  const [showRpc, setShowRpc] = useState(false);
  const [showFaucet, setShowFaucet] = useState(false);
  const [faucetAddr, setFaucetAddr] = useState("");
  const [faucetRes, setFaucetRes] = useState<{ msg: string; txUrl?: string } | null>(null);

  // If user returned from a wallet callback redirect and is now wallet-authenticated, forward cleanly
  useEffect(() => {
    if (sessionReady && walletConnected && session.mode === "near") {
      const hasWalletCallback = typeof window !== "undefined" && window.location.search.includes("account_id=");
      if (hasWalletCallback) {
        router.replace(next);
      }
    }
  }, [sessionReady, walletConnected, session.mode, router, next]);

  const handleWallet = async (wId: SupportedWalletId) => {
    setBusy(wId);
    setErr("");
    const callbackTarget =
      typeof window !== "undefined" ? `${window.location.origin}${next}` : undefined;
    const res = await connectWallet(wId, callbackTarget);
    setBusy("");
    if (!res.ok) {
      setErr(res.error || "Could not connect NEAR wallet");
      return;
    }
    if (!res.redirected) {
      router.push(next);
    }
  };

  const handleConnectRpc = async (acct?: string) => {
    const target = (acct ?? accountId).trim().toLowerCase();
    if (!target) return;
    setBusy("rpc");
    setErr("");
    const res = await connectNear(target);
    setBusy("");
    if (!res.ok) {
      setErr(res.error || "Could not verify NEAR account on Testnet RPC");
      return;
    }
    router.push(next);
  };

  const handleClaimFaucet = async () => {
    const target = faucetAddr.trim().toLowerCase();
    if (!target) return;
    setBusy("faucet");
    setErr("");
    setFaucetRes(null);
    try {
      const r = await fetch("/api/near/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: target }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        alreadyFunded?: boolean;
        amountNear?: string;
        balanceNear?: string;
        explorerUrl?: string;
        message?: string;
        error?: string;
      };
      setBusy("");
      if (!r.ok || !j.ok) {
        setErr(j.error || "Could not send Testnet NEAR");
        return;
      }
      if (j.alreadyFunded) {
        setFaucetRes({ msg: j.message || `Account already has ${j.balanceNear} NEAR` });
      } else {
        setFaucetRes({
          msg:
            lang === "id"
              ? `✓ ${j.amountNear} NEAR Testnet berhasil dikirim ke ${target}! Silakan klik Connect Meteor Wallet.`
              : `✓ Sent ${j.amountNear} Testnet NEAR to ${target}! Now click Connect Meteor Wallet.`,
          txUrl: j.explorerUrl,
        });
      }
    } catch (e) {
      setBusy("");
      setErr(e instanceof Error ? e.message : "Network error");
    }
  };

  const meteorHint =
    lang === "id"
      ? "Tips Meteor Wallet: Pastikan dropdown jaringan di Meteor disetel ke Testnet (default: Mainnet). Akun baru butuh ~1 NEAR Testnet untuk kunci sesi."
      : lang === "zh"
      ? "Meteor 钱包提示：请先在 Meteor 钱包右上角将网络切换为 Testnet（默认是 Mainnet）。"
      : "Meteor tip: Switch Meteor's network dropdown to Testnet (it defaults to Mainnet). New Testnet accounts need ~1 NEAR for login key gas.";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ maxWidth: 1180, width: "100%", margin: "0 auto", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Logo size={44} />
        <div className="row" style={{ gap: 8 }}>
          <ThemeSwitch />
          <LangSwitch compact />
        </div>
      </header>

      <main style={{ flex: 1, display: "grid", placeItems: "center", padding: "16px 24px 56px" }}>
        <div className="card pad rise" style={{ maxWidth: 550, width: "100%", padding: 30, boxShadow: "var(--sh-lg)", borderColor: "var(--border-strong)" }}>
          <div className="row between" style={{ marginBottom: 14 }}>
            <Kicker>{t("si.kicker")}</Kicker>
            <Orin pose="idle" size={76} />
          </div>

          <h1 style={{ fontSize: 30 }}>{t("si.title")}</h1>
          <p className="muted" style={{ marginTop: 8, lineHeight: 1.6 }}>{t("si.sub")}</p>

          {/* 1. REAL NEAR WALLET SELECTOR (METEOR PRIMARY + INTEAR + HOT) */}
          <div
            style={{
              marginTop: 18,
              padding: 16,
              borderRadius: 14,
              background: "rgba(0,236,151,0.055)",
              border: "1px solid var(--border-glow)",
            }}
            className="col"
          >
            <div className="row between wrap" style={{ marginBottom: 10 }}>
              <span className="mono tiny" style={{ color: "var(--mint)", fontWeight: 700 }}>
                ● SIGN WITH REAL NEAR TESTNET WALLET
              </span>
              <span className="badge mono" style={{ fontSize: 10.5 }}>CLIENT-SIDE ED25519</span>
            </div>

            <div className="col" style={{ gap: 10 }}>
              <button
                type="button"
                className="btn lg near-pay"
                style={{ width: "100%", justifyContent: "space-between" }}
                disabled={!!busy}
                onClick={() => void handleWallet("meteor-wallet")}
              >
                <span className="row" style={{ gap: 10 }}>
                  <Icon name="wallet" size={18} />
                  <span>
                    {busy === "meteor-wallet"
                      ? "Connecting Meteor Wallet…"
                      : "Connect Meteor Wallet (Testnet)"}
                  </span>
                </span>
                <span className="mono tiny" style={{ opacity: 0.9 }}>Extension / Web ↗</span>
              </button>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button
                  type="button"
                  className="btn"
                  style={{
                    justifyContent: "space-between",
                    borderColor: "rgba(253,224,71,0.34)",
                    background: "rgba(253,224,71,0.05)",
                    padding: "10px 12px",
                  }}
                  disabled={!!busy}
                  onClick={() => void handleWallet("intear-wallet")}
                >
                  <span className="row" style={{ gap: 7, fontSize: 13 }}>
                    <Icon name="globe" size={15} />
                    <span>{busy === "intear-wallet" ? "Opening…" : "Intear Wallet"}</span>
                  </span>
                  <span className="mono tiny" style={{ color: "#fde047" }}>Web</span>
                </button>

                <button
                  type="button"
                  className="btn"
                  style={{
                    justifyContent: "space-between",
                    borderColor: "rgba(251,146,60,0.34)",
                    background: "rgba(251,146,60,0.06)",
                    padding: "10px 12px",
                  }}
                  disabled={!!busy}
                  onClick={() => void handleWallet("hot-wallet")}
                >
                  <span className="row" style={{ gap: 7, fontSize: 13 }}>
                    <Icon name="sparkles" size={15} />
                    <span>{busy === "hot-wallet" ? "Opening…" : "HOT Wallet"}</span>
                  </span>
                  <span className="mono tiny" style={{ color: "#fb923c" }}>Ext / Web</span>
                </button>
              </div>
            </div>

            <div
              className="tiny"
              style={{
                marginTop: 10,
                padding: "9px 11px",
                borderRadius: 9,
                background: "rgba(253,224,71,0.06)",
                border: "1px solid rgba(253,224,71,0.22)",
                color: "var(--fg-muted)",
                lineHeight: 1.5,
              }}
            >
              <div>
                {meteorHint}{" "}
                <button
                  type="button"
                  className="mono"
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: "#00EC97",
                    fontWeight: 700,
                    textDecoration: "underline",
                    fontSize: "inherit",
                  }}
                  onClick={() => setShowFaucet((v) => !v)}
                >
                  {lang === "id" ? "⚡ Klaim 1.5 NEAR Instan" : "⚡ Instant 1.5 NEAR Faucet"}
                </button>
                {" · "}
                <a
                  href="https://near-faucet.io"
                  target="_blank"
                  rel="noreferrer"
                  className="mono"
                  style={{ color: "#fde047", textDecoration: "underline" }}
                >
                  near-faucet.io ↗
                </a>
                {" · "}
                <a
                  href="https://docs.near.org/getting-started/faucet"
                  target="_blank"
                  rel="noreferrer"
                  className="mono"
                  style={{ color: "#fde047", textDecoration: "underline" }}
                >
                  NEAR Docs Faucet ↗
                </a>
              </div>

              {showFaucet && (
                <div className="col" style={{ gap: 6, marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(253,224,71,0.18)" }}>
                  <div className="row" style={{ gap: 6 }}>
                    <input
                      className="input mono"
                      style={{ height: 34, fontSize: 12 }}
                      value={faucetAddr}
                      onChange={(e) => setFaucetAddr(e.target.value)}
                      placeholder={lang === "id" ? "nama-wallet.testnet atau 64-hex dari Meteor" : "your-wallet.testnet or 64-hex address"}
                    />
                    <button
                      type="button"
                      className="btn sm mint"
                      disabled={!!busy || !faucetAddr.trim()}
                      onClick={() => void handleClaimFaucet()}
                    >
                      {busy === "faucet" ? "Sending…" : "Send 1.5 NEAR"}
                    </button>
                  </div>
                  {faucetRes && (
                    <div className="mono tiny" style={{ color: "var(--mint)" }}>
                      {faucetRes.msg}{" "}
                      {faucetRes.txUrl && (
                        <a href={faucetRes.txUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                          NearBlocks Tx ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {err && (
            <div className="card" style={{ marginTop: 12, padding: "10px 12px", background: "var(--red-l)", borderColor: "rgba(251,113,133,0.4)", color: "var(--red)", fontSize: 13 }}>
              {err}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span className="kbd">{t("si.or")}</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          {/* 2. 1-CLICK LIVE TESTNET SANDBOX (FUNDED RELAYER -> REAL NEARBLOCKS TXS) */}
          <button
            className="btn lg amber"
            style={{ width: "100%" }}
            disabled={!!busy}
            onClick={async () => {
              await startGuest();
              router.push(next);
            }}
          >
            <Icon name="bolt" size={17} /> {t("si.guest")}
          </button>
          <p className="tiny muted" style={{ marginTop: 8, textAlign: "center", lineHeight: 1.5 }}>
            No wallet installed? Broadcasts <b>real signed NEAR Testnet transactions</b> via our funded sandbox relayer (<code className="mono">liam.{NEAR_CONTRACT_ID}</code>) with live NearBlocks Tx links.
          </p>

          {/* 3. COLLAPSIBLE RPC ACCOUNT INSPECTOR */}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <button
              type="button"
              className="tiny mono muted"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
              onClick={() => setShowRpc((v) => !v)}
            >
              {showRpc ? "▾ Hide NEAR Account Inspector" : "▸ Or inspect any .testnet account via RPC"}
            </button>

            {showRpc && (
              <div className="field pop-in" style={{ marginTop: 12 }}>
                <div className="row" style={{ gap: 8 }}>
                  <input
                    id="near-acct"
                    className="input mono"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    placeholder="your-name.testnet"
                  />
                  <button
                    type="button"
                    className="btn mint"
                    disabled={!!busy}
                    onClick={() => void handleConnectRpc()}
                  >
                    {busy === "rpc" ? "Checking…" : "Inspect"}
                  </button>
                </div>
                <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                  {[`raka.${NEAR_CONTRACT_ID}`, `liam.${NEAR_CONTRACT_ID}`, NEAR_CONTRACT_ID].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="chip mono"
                      style={{ fontSize: 11, padding: "3px 9px" }}
                      onClick={() => { setAccountId(preset); void handleConnectRpc(preset); }}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {session.mode === "near" && session.near && (
            <div className="mono tiny" style={{ marginTop: 14, padding: 10, borderRadius: 10, background: "var(--mint-l)", border: "1px solid var(--border-glow)", color: "var(--mint)", textAlign: "center" }}>
              {walletConnected ? `Wallet Connected (${walletId})` : "RPC Connected"}: <b>{session.near.accountId}</b> ({session.near.balanceNear} NEAR)
            </div>
          )}

          <div className="row between tiny muted" style={{ marginTop: 18, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <Link href="/">← Home</Link>
            <a href={nearExplorerAccount(NEAR_CONTRACT_ID)} target="_blank" rel="noreferrer" className="mono">
              Vault: {NEAR_CONTRACT_ID} ↗
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}
