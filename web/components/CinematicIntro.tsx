"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Opening cinematic copy is intentionally ENGLISH-ONLY (never localized).
 * The trailer itself is wordless footage (emblem -> Orin scan -> SEALED), so the
 * cinema overlay must read as an international film title card for judges/demo.
 */
const CINEMA = {
  act1: "INITIALIZING CRYPTOGRAPHIC ESCROW VAULT",
  act2: "ORIN CYBER-INSPECTOR · SCOPED AI KEY ACTIVE",
  act3: "AI-VERIFIED FREELANCE PROTOCOL ON NEAR",
  skip: "Skip Intro",
} as const;

interface IntroCtx {
  replayIntro: () => void;
}

const Ctx = createContext<IntroCtx>({ replayIntro: () => {} });
export const useCinematicIntro = () => useContext(Ctx);

/**
 * Full-screen Opening Cinematic Video Gate.
 * Plays immediately on frame 0 when opening "/" (before the website reveals),
 * and can also be replayed anytime from the navbar.
 */
export function CinematicIntroProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // True from frame 0 on "/" so the opening video ALWAYS appears FIRST before the website!
  const [open, setOpen] = useState<boolean>(() => pathname === "/");
  const [closing, setClosing] = useState(false);
  const [runId, setRunId] = useState(0);

  const finish = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 620);
  }, []);

  const replayIntro = useCallback(() => {
    setClosing(false);
    setRunId((n) => n + 1);
    setOpen(true);
  }, []);

  return (
    <Ctx.Provider value={{ replayIntro }}>
      {open && <CinematicVideoPlayer key={runId} closing={closing} onFinish={finish} />}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          opacity: open && !closing ? 0 : 1,
          transition: "opacity 0.55s ease",
          pointerEvents: open && !closing ? "none" : "auto",
        }}
      >
        {children}
      </div>
    </Ctx.Provider>
  );
}

function CinematicVideoPlayer({ closing, onFinish }: { closing: boolean; onFinish: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [pct, setPct] = useState(0);
  const [act, setAct] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.currentTime = 0;
      const p = v.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {});
      }
    }
    // Safety fallback timer (6.2s) in case browser throttles video events
    const fallback = setTimeout(() => {
      onFinish();
    }, 6200);
    return () => clearTimeout(fallback);
  }, [onFinish]);

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const cur = v.currentTime;
    const dur = v.duration;
    setPct(Math.min(100, (cur / dur) * 100));
    if (cur < 1.85) setAct(1);
    else if (cur < 3.65) setAct(2);
    else setAct(3);
  };

  const subtitle = act === 1 ? CINEMA.act1 : act === 2 ? CINEMA.act2 : CINEMA.act3;

  return (
    <div className={`cvideo-root ${closing ? "cvideo-closing" : ""}`} role="dialog" aria-label="NearSignet Opening Video">
      {/* Real 24fps HD Cinematic Video (Logo Emblem -> Orin Scan -> Triumphant SEALED) */}
      <video
        ref={videoRef}
        className="cvideo-el"
        src="/brand/nearsignet-trailer-v5.webm"
        poster="/brand/v3-emblem-scene.jpg"
        autoPlay
        muted
        playsInline
        preload="auto"
        onTimeUpdate={onTimeUpdate}
        onEnded={onFinish}
      />

      <div className="cvideo-shade" />

      {/* Top Widescreen Cinema Letterbox */}
      <div className="cvideo-bar top">
        <div className="row" style={{ gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#00EC97", boxShadow: "0 0 12px #00EC97" }} />
          <span className="mono tiny" style={{ color: "rgba(253,224,71,0.9)", letterSpacing: ".16em", fontWeight: 700 }}>
            NEARSIGNET PROTOCOL · NEAR TESTNET
          </span>
        </div>
        <button type="button" className="cvideo-skip mono" onClick={onFinish}>
          {CINEMA.skip} →
        </button>
      </div>

      {/* Lower-Third Cinema Title Overlay (Matches Main Brand Lockup) */}
      <div className="cvideo-lower">
        <div className="cvideo-brand">
          Near<span style={{ color: "#00EC97" }}>Signet</span>
        </div>
        <div className="cvideo-caption mono">{subtitle}</div>
      </div>

      {/* Bottom Widescreen Cinema Letterbox + Golden Progress Bar */}
      <div className="cvideo-bar bottom">
        <div className="cvideo-track">
          <div className="cvideo-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <style>{`
        .cvideo-root{
          position:fixed;inset:0;z-index:9999;overflow:hidden;
          background:#04060A;
          transition:opacity .58s cubic-bezier(.22,1,.36,1), transform .62s cubic-bezier(.22,1,.36,1);
        }
        .cvideo-closing{opacity:0;transform:scale(1.04);pointer-events:none}
        .cvideo-el{
          position:absolute;inset:0;width:100%;height:100%;
          object-fit:cover;display:block;
        }
        .cvideo-shade{
          position:absolute;inset:0;pointer-events:none;
          background:linear-gradient(180deg, rgba(4,6,10,0.55) 0%, transparent 24%, transparent 62%, rgba(4,6,10,0.88) 100%);
        }
        .cvideo-bar{
          position:absolute;left:0;right:0;z-index:4;
          height:clamp(52px,7.5vh,76px);
          background:rgba(3,4,8,0.92);
          backdrop-filter:blur(12px);
          display:flex;align-items:center;justify-content:space-between;
          padding:0 clamp(18px,4vw,48px);
          transition:transform .55s cubic-bezier(.22,1,.36,1);
        }
        .cvideo-bar.top{top:0;border-bottom:1px solid rgba(253,224,71,0.28)}
        .cvideo-bar.bottom{bottom:0;border-top:1px solid rgba(253,224,71,0.28)}
        .cvideo-closing .cvideo-bar.top{transform:translateY(-100%)}
        .cvideo-closing .cvideo-bar.bottom{transform:translateY(100%)}
        .cvideo-skip{
          padding:7px 16px;border-radius:999px;font-size:12px;font-weight:700;
          color:#090D14;
          background:linear-gradient(135deg, #FDE047 0%, #F59E0B 100%);
          border:none;
          box-shadow:0 4px 18px rgba(245,158,11,0.38);
          transition:transform .15s, filter .15s;
        }
        .cvideo-skip:hover{transform:translateY(-1px);filter:brightness(1.06)}
        .cvideo-lower{
          position:absolute;left:0;right:0;bottom:clamp(68px,10.5vh,104px);
          z-index:3;text-align:center;padding:0 20px;pointer-events:none;
        }
        .cvideo-brand{
          font-family:var(--font-display), sans-serif;
          font-weight:700;
          font-size:clamp(32px,4.8vw,56px);
          letter-spacing:-.03em;
          color:#FAF8F5;
          filter:drop-shadow(0 6px 26px rgba(0,0,0,0.95));
        }
        .cvideo-caption{
          margin-top:6px;
          font-size:clamp(10.5px,1.2vw,13px);
          font-weight:700;
          letter-spacing:.22em;
          color:#FAF8F5;
          text-shadow:0 2px 14px rgba(0,0,0,0.95);
        }
        .cvideo-track{
          width:100%;height:3px;border-radius:999px;
          background:rgba(255,255,255,0.14);overflow:hidden;
        }
        .cvideo-fill{
          height:100%;
          background:linear-gradient(90deg, #F59E0B, #FDE047, #00EC97);
          box-shadow:0 0 14px #FDE047;
          transition:width .12s linear;
        }
      `}</style>
    </div>
  );
}
