"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { hostOf, useMe } from "@/lib/me";
import { NEAR_CONTRACT_ID, NEAR_VERIFIER_ID, nearExplorerAccount, nearExplorerTx } from "@/lib/near";
import { Confetti, Kicker, LangSwitch, Logo, ThemeSwitch } from "@/components/ui";
import { Orin } from "@/components/Orin";
import { SignetSeal } from "@/components/SignetSeal";
import { Icon } from "@/components/Icon";

const STAGE_TX_DEMO = "GM3AHKng3oHVbF3djXaYZouKWwtBKZU1mYGxB7onknVF";

export default function LandingPage() {
  const { t } = useI18n();
  const { me, signedIn, startGuest } = useMe();
  const router = useRouter();
  const [stage, setStage] = useState(0);
  const [tryBurst, setTryBurst] = useState(0);
  const [tryFire, setTryFire] = useState(0);
  const [chainStats, setChainStats] = useState<{ totalEscrows: number; totalSealed: number; verifierScoped: boolean } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setStage((s) => (s + 1) % 4), 3200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch("/api/near/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.stats) {
          setChainStats({
            totalEscrows: d.stats.totalEscrows ?? 1,
            totalSealed: d.stats.totalSealed ?? 1,
            verifierScoped: Array.isArray(d.verifierKeys) && d.verifierKeys.length > 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  const launchJudgeDemo = (target: string) => {
    if (!signedIn) void startGuest();
    router.push(target);
  };

  const orinPose = stage === 2 ? "scan" : stage === 3 ? "sealed" : "idle";

  return (
    <div style={{ overflowX: "clip" }}>
      {/* Subtle Live NEAR Testnet Telemetry Bar */}
      <div className="testnet-strip">
        <div className="testnet-inner mono">
          <span className="row" style={{ gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#00EC97", boxShadow: "0 0 10px #00EC97" }} />
            <b style={{ color: "#00EC97" }}>NEAR TESTNET LIVE</b>
          </span>
          <a href={nearExplorerAccount(NEAR_CONTRACT_ID)} target="_blank" rel="noreferrer" className="strip-link">
            Vault: {NEAR_CONTRACT_ID} ↗
          </a>
          <a href={nearExplorerAccount(NEAR_VERIFIER_ID)} target="_blank" rel="noreferrer" className="strip-link">
            Verifier: {NEAR_VERIFIER_ID} {chainStats?.verifierScoped ? "· Scoped FunctionCall ✓" : ""} ↗
          </a>
          <a href={nearExplorerTx(STAGE_TX_DEMO)} target="_blank" rel="noreferrer" className="strip-link" style={{ color: "#fbbf24" }}>
            SEALED Proof: {STAGE_TX_DEMO.slice(0, 10)}… ↗
          </a>
        </div>
      </div>

      {/* Floating Glass Top Navigation */}
      <div style={{ position: "sticky", top: 14, zIndex: 35, padding: "12px 20px 0" }}>
        <header className="lp-glass-nav">
          <Logo size={48} />
          <nav className="lp-links">
            <a href="#architecture">Protocol</a>
            <a href="#how">{t("nav.how")}</a>
            <a href="#corridors">{t("nav.forWho")}</a>
            <Link href={`/to/${me.handle}`}>{t("nav.clientLink")}</Link>
          </nav>
          <div className="row" style={{ gap: 8 }}>
            <ThemeSwitch />
            <LangSwitch compact />
            {!signedIn && (
              <Link href="/signin" className="btn sm">
                {t("lp.signin")}
              </Link>
            )}
            <button
              type="button"
              className="btn sm mint"
              onClick={() => (signedIn ? router.push("/dashboard") : launchJudgeDemo("/dashboard"))}
            >
              {t("lp.openApp")} <Icon name="arrow" size={13} />
            </button>
          </div>
        </header>
      </div>

      {/* Hero Section */}
      <section className="lp-hero">
        <div className="col rise" style={{ gap: 22 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <Kicker><Icon name="shield" size={13} /> {t("lp.kicker")}</Kicker>
            <Kicker amber>ORIN AI INSPECTOR</Kicker>
          </div>

          <h1 className="lp-h1">
            {t("lp.h1.a")}{" "}
            <span className="hl">{t("lp.h1.hl")}</span>
            <br />
            {t("lp.h1.b")}
          </h1>

          <p className="muted" style={{ fontSize: 17.5, lineHeight: 1.65, maxWidth: 550 }}>
            {t("lp.sub")}
          </p>

          <div className="row wrap" style={{ gap: 12, marginTop: 4 }}>
            <button className="btn lg mint" onClick={() => launchJudgeDemo("/orders/NSG-2041")}>
              <Icon name="shield" size={17} /> Launch Interactive Escrow (NSG-2041)
            </button>
            <Link href="/signin" className="btn lg">
              <Icon name="wallet" size={17} /> {t("lp.cta1")}
            </Link>
          </div>

          <div className="row wrap" style={{ gap: 8, paddingTop: 6 }}>
            <span className="badge" style={{ borderColor: "rgba(0,236,151,0.3)", color: "var(--mint)" }}>
              <Icon name="lock" size={12} /> Non-Custodial `nearsignet-protocol.testnet`
            </span>
            <span className="badge" style={{ borderColor: "rgba(245,158,11,0.35)", color: "#fbbf24" }}>
              <Icon name="key" size={12} /> Scoped Function-Call AI Firewall
            </span>
            <span className="badge">
              <Icon name="clock" size={12} /> 72h `blockTimestamp` Auto-Release
            </span>
          </div>
        </div>

        {/* Interactive Smoked-Glass Terminal + Orin Cyber-Owl */}
        <div className="rise" style={{ position: "relative" }}>
          <div className="card pad hero-terminal">
            <div className="row between" style={{ marginBottom: 14 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="mono tiny muted">NSG-2041</span>
                <span className="badge" style={{ borderColor: stage === 3 ? "rgba(0,236,151,0.45)" : "rgba(245,158,11,0.35)", color: stage === 3 ? "var(--mint)" : "#fbbf24" }}>
                  <span className="dot" />
                  {["01 · AI Predicate", "02 · Vault Locked", "03 · Orin Laser Scan", "04 · SEALED"][stage]}
                </span>
              </div>
              <span className="mono" style={{ fontWeight: 700, fontSize: 14, color: "var(--mint)" }}>30.0 NEAR · $150</span>
            </div>

            {/* Orin Showcase Header + Real Deliverable Sample */}
            <div className="row between" style={{ padding: "10px 14px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", marginBottom: 14, gap: 10 }}>
              <div className="row" style={{ gap: 12, minWidth: 0 }}>
                <div style={{ width: 68, height: 52, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border-strong)", flex: "none" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/samples/sneaker-white.jpg" alt="3D Sneaker Render sample" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
                <div className="col" style={{ gap: 3, minWidth: 0 }}>
                  <span className="kbd" style={{ color: "#fbbf24" }}>AUTONOMOUS ESCROW NOTARY</span>
                  <b style={{ fontSize: 15.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>3D Sneaker Render Pack · 20 Angles</b>
                  <span className="mono tiny muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>raka.nearsignet-protocol.testnet ← liam-client.testnet</span>
                </div>
              </div>
              <Orin key={orinPose} pose={orinPose} size={104} className="pop-in" />
            </div>

            {/* Stage Selector */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 14 }}>
              {["Predicates", "NEAR Vault", "Orin Scan", "SEALED"].map((lb, idx) => (
                <button
                  key={lb}
                  onClick={() => setStage(idx)}
                  className="mono"
                  style={{
                    padding: "7px 6px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                    border: `1px solid ${stage === idx ? "var(--mint)" : "var(--border)"}`,
                    background: stage === idx ? "rgba(0,236,151,0.14)" : "rgba(255,255,255,0.02)",
                    color: stage === idx ? "var(--mint)" : "var(--ink-2)",
                  }}
                >
                  {lb}
                </button>
              ))}
            </div>

            {stage === 0 && (
              <div className="col pop-in" style={{ gap: 7 }}>
                {[
                  ["Exactly 20 studio renders", "count(files) == 20"],
                  ["Min 2000px long edge", "max(w,h) >= 2000"],
                  ["Pure white studio backdrop", "vision: bg >= 97% #FFF"],
                ].map(([l, r]) => (
                  <div key={l} className="row between" style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "rgba(255,255,255,0.025)" }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{l}</span>
                    <span className="mono tiny" style={{ color: "var(--mint)" }}>{r}</span>
                  </div>
                ))}
              </div>
            )}

            {stage === 1 && (
              <div className="col pop-in" style={{ gap: 9, padding: 14, borderRadius: 12, border: "1px solid rgba(56,189,248,0.35)", background: "rgba(56,189,248,0.07)" }}>
                <div className="row between">
                  <b style={{ color: "#38bdf8" }}>Locked in `nearsignet-protocol.testnet`</b>
                  <span className="mono tiny" style={{ color: "var(--mint)" }}>30.0 Ⓝ</span>
                </div>
                <p className="tiny muted" style={{ lineHeight: 1.55 }}>
                  Client funds via native NEAR or NEAR Intents 1-Click (`USDC` / `ETH` → `NEAR`). Protected by on-chain `blockTimestamp` 72h auto-release.
                </p>
                <div className="mono tiny" style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(7,10,15,0.65)", border: "1px solid var(--border)", color: "#fbbf24" }}>
                  call: create_and_fund_escrow(&quot;NSG-2041&quot;)
                </div>
              </div>
            )}

            {stage === 2 && (
              <div className="col pop-in" style={{ gap: 8, position: "relative", overflow: "hidden", padding: 14, borderRadius: 12, border: "1px solid var(--border-glow)", background: "rgba(0,236,151,0.06)" }}>
                <div className="scanline" />
                <div className="row between">
                  <b style={{ color: "var(--mint)" }}>Orin · `verifier.nearsignet-protocol.testnet`</b>
                  <span className="mono tiny" style={{ color: "#fbbf24" }}>Scoped Key ✓</span>
                </div>
                <div className="mono tiny">✓ count(files) == 20 (20 real JPEGs decoded)</div>
                <div className="mono tiny">✓ max(w,h) &gt;= 2000 (verified 2400×2400px)</div>
                <div className="mono tiny" style={{ color: "var(--mint)" }}>✓ SHA-256 digest signed via FunctionCall key</div>
              </div>
            )}

            {stage === 3 && (
              <div className="row between pop-in" style={{ padding: 14, borderRadius: 12, border: "1px solid rgba(0,236,151,0.45)", background: "rgba(7,11,18,0.85)" }}>
                <div className="col" style={{ gap: 4 }}>
                  <span className="kbd" style={{ color: "var(--mint)" }}>CRYPTOGRAPHICALLY SEALED</span>
                  <div className="display" style={{ fontSize: 22 }}>30.0 NEAR → raka-studio.testnet</div>
                  <span className="mono tiny" style={{ color: "#fbbf24" }}>seal_id: SEAL-NSG-2033-034003</span>
                </div>
                <SignetSeal size={92} sealCode="SEAL-NSG-2033" slam />
              </div>
            )}

            <div className="row between" style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <span className="mono tiny muted">Orin Cyber-Owl · Zero FullAccess AI Key</span>
              <button className="btn sm mint" onClick={() => launchJudgeDemo("/orders/NSG-2041")}>
                Open Live Terminal <Icon name="arrow" size={13} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Sleek Ticker */}
      <div className="lp-ticker marquee">
        <div className="marquee-track mono">
          {[0, 1].map((dup) => (
            <span key={dup} className="row" style={{ gap: 42 }}>
              {["m1", "m2", "m3", "m4", "m5", "m6"].map((k) => (
                <span key={k} className="row" style={{ gap: 10, fontSize: 12.5, color: "var(--ink-2)" }}>
                  <span style={{ color: "var(--mint)" }}>◈</span> {t(`lp.${k}`)}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* Bento Architecture Section */}
      <section id="architecture" className="lp-sec">
        <div className="col" style={{ alignItems: "center", textAlign: "center", gap: 10, marginBottom: 34 }}>
          <Kicker amber>NEAR PROTOCOL ARCHITECTURE</Kicker>
          <h2 style={{ fontSize: "clamp(28px, 3.5vw, 42px)" }}>Engineered for Autonomous Cross-Border Settlement</h2>
          <p className="muted" style={{ maxWidth: 640 }}>
            Every escrow vault, AI verification signature, and timeout guarantee is anchored on NEAR Testnet (`nearsignet-protocol.testnet`).
          </p>
        </div>

        <div className="grid-3">
          <div className="card pad lift col" style={{ gap: 10 }}>
            <div className="row between">
              <Kicker>Real-World Economy</Kicker>
              <Icon name="globe" size={20} />
            </div>
            <h3 style={{ fontSize: 21, marginTop: 4 }}>Sub-Cent NEAR Vaults & 72h Auto-Release</h3>
            <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
              Eliminates 6–20% legacy corridor fees. Once Orin verifies a delivery, `near.blockTimestamp()` guarantees trustless release after 72 hours even if a client disappears.
            </p>
          </div>

          <div className="card pad lift col" style={{ gap: 10, borderColor: "rgba(245,158,11,0.28)" }}>
            <div className="row between">
              <Kicker amber>Security & FinTech</Kicker>
              <Icon name="key" size={20} />
            </div>
            <h3 style={{ fontSize: 21, marginTop: 4 }}>Scoped Function-Call Key Firewall</h3>
            <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
              Orin signs attestations with an `ed25519` Function-Call key strictly restricted on-chain to `submit_verification` and `propose_mediation` (0.25 NEAR gas cap). Zero `FullAccess` risk.
            </p>
          </div>

          <div className="card pad lift col" style={{ gap: 10 }}>
            <div className="row between">
              <Kicker>AI Agents & Intents</Kicker>
              <Icon name="bot" size={20} />
            </div>
            <h3 style={{ fontSize: 21, marginTop: 4 }}>3 Specialized Agents + NEAR Intents</h3>
            <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
              Contract Agent compiles briefs into rules; Orin Verification Agent inspects real pixels, video frames & WebAudio dBFS; Mediator Agent computes proportional NEAR splits; Intents quotes `USDC`/`ETH` → `NEAR`.
            </p>
          </div>
        </div>
      </section>

      {/* 4-Step Workflow */}
      <section id="how" className="lp-sec">
        <div className="col" style={{ alignItems: "center", textAlign: "center", gap: 10, marginBottom: 32 }}>
          <Kicker>{t("lp.howKicker")}</Kicker>
          <h2 style={{ fontSize: "clamp(28px, 3.4vw, 40px)" }}>{t("lp.howTitle")}</h2>
        </div>
        <div className="grid-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="card pad lift col" style={{ gap: 10 }}>
              <div className="row between">
                <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: n % 2 === 0 ? "#fbbf24" : "var(--mint)" }}>STEP 0{n}</span>
                <Icon name={["sparkles", "lock", "bot", "award"][n - 1]} size={19} />
              </div>
              <h3 style={{ fontSize: 19 }}>{t(`lp.s${n}.t`)}</h3>
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>{t(`lp.s${n}.b`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Two Directions */}
      <section id="corridors" className="lp-sec">
        <div className="grid-2">
          <div className="card pad col" style={{ gap: 14 }}>
            <Kicker>{t("lp.in.tag")}</Kicker>
            <h3 style={{ fontSize: 23 }}>{t("lp.in.t")}</h3>
            <p className="muted" style={{ lineHeight: 1.6 }}>{t("lp.in.b")}</p>
            <div className="row between" style={{ padding: "10px 14px", borderRadius: 11, border: "1px solid var(--border-strong)", background: "rgba(255,255,255,0.03)" }}>
              <span className="mono tiny" style={{ color: "var(--mint)" }}>{hostOf()}/to/{me.handle}</span>
              <Link href={`/to/${me.handle}`} className="btn sm mint">{t("lp.in.cta")}</Link>
            </div>
          </div>

          <div className="card pad col" style={{ gap: 14 }}>
            <Kicker amber>{t("lp.out.tag")}</Kicker>
            <h3 style={{ fontSize: 23 }}>{t("lp.out.t")}</h3>
            <p className="muted" style={{ lineHeight: 1.6 }}>{t("lp.out.b")}</p>
            <div className="row wrap" style={{ gap: 10, marginTop: "auto" }}>
              <button className="btn mint" onClick={() => launchJudgeDemo("/orders/new")}>
                <Icon name="send" size={15} /> {t("lp.out.cta")}
              </button>
              <button className="btn" onClick={() => launchJudgeDemo("/insights")}>
                <Icon name="shield" size={15} /> Live Scoped-Key Audit
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Cryptographic Signet Stamp Ceremony */}
      <section className="lp-sec">
        <div
          className={`card pad stamp-showcase ${tryBurst ? "cert-shake" : ""}`}
          style={{
            padding: "32px",
            borderColor: "rgba(253,224,71,0.38)",
            background: "radial-gradient(ellipse at 75% 50%, rgba(153,27,27,0.18), rgba(12,16,26,0.92) 68%)",
          }}
        >
          <div className="col" style={{ gap: 12 }}>
            <Kicker amber>{t("try.kicker")}</Kicker>
            <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)" }}>{t("try.title")}</h2>
            <p className="muted" style={{ lineHeight: 1.65, maxWidth: 540 }}>{t("try.body")}</p>
            <div className="row wrap" style={{ gap: 10, marginTop: 6 }}>
              <button
                type="button"
                className="btn lg amber"
                onClick={() => {
                  setTryBurst((n) => n + 1);
                  setTryFire((f) => f + 1);
                }}
              >
                <Icon name="award" size={17} /> {tryBurst > 0 ? t("try.again") : t("try.button")}
              </button>
              <button type="button" className="btn lg" onClick={() => launchJudgeDemo("/orders/NSG-2033")}>
                Inspect Live SEALED Order →
              </button>
            </div>
          </div>

          <div className="col" style={{ alignItems: "center", gap: 8 }}>
            <SignetSeal
              key={tryBurst}
              size={176}
              sealCode="SEAL-NSG-2033"
              slam={tryBurst > 0}
              onStamped={() => setTryFire((f) => f + 1)}
            />
            <span className="mono tiny muted">Click button or crest to trigger hydraulic stamp</span>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="lp-sec" style={{ paddingBottom: 64 }}>
        <div className="card pad" style={{ padding: "34px 32px", borderColor: "var(--border-glow)", background: "linear-gradient(135deg, rgba(0,236,151,0.09) 0%, rgba(15,22,34,0.9) 60%, rgba(245,158,11,0.08) 100%)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
          <div className="row" style={{ gap: 20 }}>
            <Orin pose="sealed" size={96} />
            <div className="col" style={{ gap: 6 }}>
              <h2 style={{ fontSize: "clamp(23px, 2.8vw, 32px)" }}>{t("lp.endTitle")}</h2>
              <p className="muted" style={{ maxWidth: 520 }}>{t("cta.body")}</p>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 10 }}>
            <button className="btn lg mint" onClick={() => launchJudgeDemo("/dashboard")}>
              <Icon name="sparkles" size={17} /> {t("lp.endBtn")}
            </button>
            <a href={nearExplorerAccount(NEAR_CONTRACT_ID)} target="_blank" rel="noreferrer" className="btn lg">
              Inspect `nearsignet-protocol.testnet` ↗
            </a>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="row between wrap" style={{ maxWidth: 1240, margin: "0 auto", gap: 12 }}>
          <div className="row" style={{ gap: 12 }}>
            <Logo size={38} />
            <span className="tiny muted">{t("lp.foot")}</span>
          </div>
          <div className="row wrap tiny mono muted" style={{ gap: 18 }}>
            <Link href="/dashboard">Overview</Link>
            <Link href="/insights">Chain Audit</Link>
            <Link href={`/to/${me.handle}`}>Intake Link</Link>
            <a href={nearExplorerAccount(NEAR_CONTRACT_ID)} target="_blank" rel="noreferrer">NearBlocks Testnet ↗</a>
          </div>
        </div>
      </footer>
      <Confetti fire={tryFire} />

      <style>{`
        .testnet-strip{background:rgba(4,7,11,0.9);border-bottom:1px solid var(--border);padding:8px 20px;font-size:11.5px}
        .testnet-inner{max-width:1240px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}
        .strip-link{color:var(--ink-2);transition:color .15s}
        .strip-link:hover{color:var(--mint)}
        .lp-glass-nav{
          max-width:1240px;margin:0 auto;padding:10px 18px;
          display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;
          background:rgba(11,16,26,0.78);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);
          border:1px solid var(--border-strong);border-radius:18px;box-shadow:var(--sh);
        }
        [data-theme="daylight"] .lp-glass-nav{background:rgba(255,255,255,0.88)}
        .lp-links{display:flex;gap:24px;font-weight:600;font-size:13.5px;color:var(--ink-2)}
        .lp-links a:hover{color:var(--ink)}
        .lp-hero{max-width:1240px;margin:0 auto;padding:42px 24px 56px;display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,.96fr);gap:36px;align-items:center}
        .lp-h1{font-size:clamp(34px, 4.4vw, 56px);line-height:1.05}
        .hero-terminal{box-shadow:var(--sh-lg);border-color:var(--border-strong);min-width:0}
        .lp-ticker{border-top:1px solid var(--border);border-bottom:1px solid var(--border);background:rgba(255,255,255,0.02);padding:12px 0;overflow:hidden}
        .lp-sec{max-width:1240px;margin:0 auto;padding:56px 24px 8px}
        .grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
        .grid-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
        .grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
        .stamp-showcase{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:28px;align-items:center}
        .lp-foot{border-top:1px solid var(--border);padding:24px;background:rgba(7,10,15,0.6)}
        @media (max-width:940px){
          .lp-hero{grid-template-columns:1fr}
          .lp-links{display:none}
          .grid-3,.grid-4,.grid-2,.stamp-showcase{grid-template-columns:1fr}
        }
      `}</style>
    </div>
  );
}
