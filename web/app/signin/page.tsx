"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/me";
import { NEAR_CONTRACT_ID, nearExplorerAccount } from "@/lib/near";
import { Icon } from "@/components/Icon";
import { Orin } from "@/components/Orin";
import { Kicker, LangSwitch, Logo, ThemeSwitch } from "@/components/ui";

function SignInInner() {
  const { t } = useI18n();
  const { connectNear, startGuest, session } = useMe();
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/dashboard";

  const [accountId, setAccountId] = useState("raka-studio.testnet");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const handleConnect = async (acct?: string) => {
    const target = (acct ?? accountId).trim().toLowerCase();
    if (!target) return;
    setBusy(true);
    setErr("");
    const res = await connectNear(target);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error || "Could not verify NEAR account");
      return;
    }
    router.push(next);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ maxWidth: 1180, width: "100%", margin: "0 auto", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Logo />
        <div className="row" style={{ gap: 8 }}>
          <ThemeSwitch />
          <LangSwitch compact />
        </div>
      </header>

      <main style={{ flex: 1, display: "grid", placeItems: "center", padding: "16px 24px 56px" }}>
        <div className="card pad rise" style={{ maxWidth: 520, width: "100%", padding: 30, boxShadow: "var(--sh-lg)", borderColor: "var(--border-strong)" }}>
          <div className="row between" style={{ marginBottom: 14 }}>
            <Kicker>{t("si.kicker")}</Kicker>
            <Orin pose="idle" size={76} />
          </div>

          <h1 style={{ fontSize: 30 }}>{t("si.title")}</h1>
          <p className="muted" style={{ marginTop: 8, lineHeight: 1.6 }}>{t("si.sub")}</p>

          <div className="col" style={{ gap: 8, marginTop: 18 }}>
            {["b1", "b2", "b3"].map((k) => (
              <div key={k} className="row tiny" style={{ gap: 9 }}>
                <span style={{ width: 19, height: 19, borderRadius: "50%", background: "var(--mint-l)", border: "1px solid var(--border-glow)", display: "grid", placeItems: "center", color: "var(--mint)", fontSize: 11 }}>✓</span>
                <span>{t(`si.${k}`)}</span>
              </div>
            ))}
          </div>

          <div className="field" style={{ marginTop: 20 }}>
            <label htmlFor="near-acct">NEAR Account ID (Live RPC Verification on `rpc.testnet.near.org`)</label>
            <input
              id="near-acct"
              className="input mono"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="your-name.testnet"
            />
            <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
              <span className="tiny muted">Testnet presets:</span>
              {["raka-studio.testnet", "liam-client.testnet", "nearsignet.testnet"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="chip mono"
                  style={{ fontSize: 11, padding: "3px 9px" }}
                  onClick={() => { setAccountId(preset); void handleConnect(preset); }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {err && (
            <div className="card" style={{ marginTop: 12, padding: "10px 12px", background: "var(--red-l)", borderColor: "rgba(251,113,133,0.4)", color: "var(--red)", fontSize: 13 }}>
              {err}
            </div>
          )}

          <button className="btn lg near-pay" style={{ marginTop: 16 }} disabled={busy} onClick={() => void handleConnect()}>
            <Icon name="wallet" size={17} /> {busy ? "Verifying on NEAR Testnet RPC…" : t("si.btn")}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span className="kbd">{t("si.or")}</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <button
            className="btn lg amber"
            style={{ width: "100%" }}
            onClick={() => {
              void startGuest();
              router.push(next);
            }}
          >
            <Icon name="sparkles" size={17} /> {t("si.guest")} (1-Click Judge Sandbox)
          </button>
          <p className="tiny muted" style={{ marginTop: 8, textAlign: "center" }}>{t("si.guestSub")}</p>

          {session.mode === "near" && session.near && (
            <div className="mono tiny" style={{ marginTop: 14, padding: 10, borderRadius: 10, background: "var(--mint-l)", border: "1px solid var(--border-glow)", color: "var(--mint)", textAlign: "center" }}>
              Connected: <b>{session.near.accountId}</b> ({session.near.balanceNear} NEAR)
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
