"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/me";
import { NEAR_CONTRACT_ID, nearExplorerAccount } from "@/lib/near";
import { Icon } from "@/components/Icon";
import { Orin } from "@/components/Orin";
import { Kicker, LangSwitch, Logo, ThemeSwitch } from "@/components/ui";

function SignInInner() {
  const { t } = useI18n();
  const { connectWallet, connectNear, startGuest, session, walletConnected, walletId, sessionReady } = useMe();
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/dashboard";

  const [accountId, setAccountId] = useState("raka.nearsignet-protocol.testnet");
  const [busy, setBusy] = useState<"" | "my-near-wallet" | "meteor-wallet" | "rpc">("");
  const [err, setErr] = useState("");
  const [showRpc, setShowRpc] = useState(false);

  // If user returned from MyNearWallet redirect and is now wallet-authenticated, forward cleanly
  useEffect(() => {
    if (sessionReady && walletConnected && session.mode === "near") {
      const hasWalletCallback = typeof window !== "undefined" && window.location.search.includes("account_id=");
      if (hasWalletCallback) {
        router.replace(next);
      }
    }
  }, [sessionReady, walletConnected, session.mode, router, next]);

  const handleWallet = async (wId: "my-near-wallet" | "meteor-wallet") => {
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

          {/* 1. REAL NEAR WALLET SELECTOR */}
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
                onClick={() => void handleWallet("my-near-wallet")}
              >
                <span className="row" style={{ gap: 10 }}>
                  <Icon name="wallet" size={18} />
                  <span>{busy === "my-near-wallet" ? "Opening MyNearWallet…" : "Connect MyNearWallet (Testnet)"}</span>
                </span>
                <span className="mono tiny" style={{ opacity: 0.85 }}>Web Wallet ↗</span>
              </button>

              <button
                type="button"
                className="btn lg"
                style={{
                  width: "100%",
                  justifyContent: "space-between",
                  borderColor: "rgba(253,224,71,0.38)",
                  background: "rgba(253,224,71,0.06)",
                }}
                disabled={!!busy}
                onClick={() => void handleWallet("meteor-wallet")}
              >
                <span className="row" style={{ gap: 10 }}>
                  <Icon name="sparkles" size={18} />
                  <span>{busy === "meteor-wallet" ? "Connecting Meteor Wallet…" : "Connect Meteor Wallet"}</span>
                </span>
                <span className="mono tiny" style={{ color: "#fde047" }}>Extension / Web</span>
              </button>
            </div>

            <p className="tiny muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
              Sign <code className="mono">create_and_fund_escrow</code> & <code className="mono">approve_and_release</code> directly from your NEAR Testnet wallet while Orin attests verification via its Scoped Function-Call Key.
            </p>
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
            <Icon name="bolt" size={17} /> {t("si.guest")} (Live Testnet Relayer)
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
