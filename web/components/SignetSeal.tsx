"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { SEAL_LOGO_DATA_URI } from "@/lib/sealLogoData";

function playHydraulicStampSound() {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "triangle";
    sub.frequency.setValueAtTime(118, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 0.22);
    subGain.gain.setValueAtTime(0.32, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    sub.connect(subGain);
    sub.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.27);

    [880, 1318.5, 1760].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + 0.04 + idx * 0.025);
      g.gain.setValueAtTime(0.09 / (idx + 1), now + 0.04 + idx * 0.025);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.62);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + 0.04 + idx * 0.025);
      osc.stop(now + 0.65);
    });
  } catch {
    // Ignore autoplay audio restrictions silently
  }
}

/**
 * Cryptographic Signet Seal with the REAL 3D NearSignet Project Logo filling
 * the central chamber behind the translucent SEALED stamp plate + Hydraulic Stamp Ceremony.
 */
export function SignetSeal({
  size = 164,
  sealCode = "SEAL-NSG-2033",
  slam = false,
  interactive = true,
  onStamped,
}: {
  size?: number;
  sealCode?: string;
  slam?: boolean;
  interactive?: boolean;
  onStamped?: () => void;
}) {
  const { t } = useI18n();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [burstKey, setBurstKey] = useState<number>(slam ? 1 : 0);
  const [stamping, setStamping] = useState<boolean>(slam);

  useEffect(() => {
    if (!slam) return;
    setStamping(true);
    setBurstKey((k) => k + 1);
    const t = setTimeout(() => setStamping(false), 1100);
    return () => clearTimeout(t);
  }, [slam]);

  const triggerStamp = useCallback(() => {
    if (!interactive) return;
    playHydraulicStampSound();
    setStamping(true);
    setBurstKey((k) => k + 1);
    onStamped?.();
    setTimeout(() => setStamping(false), 1100);
  }, [interactive, onStamped]);

  const shortCode = sealCode.length > 18 ? sealCode.slice(0, 18) : sealCode;
  const ticks = Array.from({ length: 48 }, (_, i) => i * 7.5);
  const sparks = Array.from({ length: 16 }, (_, i) => i * 22.5);

  return (
    <div
      className={`sig-seal-wrap ${interactive ? "is-clickable" : ""}`}
      style={{ width: size, height: size }}
      onClick={triggerStamp}
      title={interactive ? "Click to press cryptographic SEALED stamp" : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => {
        if (interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          triggerStamp();
        }
      }}
    >
      {/* Physical Hydraulic Press Plunger + Shockwaves + 16 Radial Sparks */}
      {stamping && (
        <div key={burstKey} className="sig-fx-layer" aria-hidden>
          <div className="sig-plunger" />
          <div className="sig-flash" />
          <div className="sig-wave w1" />
          <div className="sig-wave w2" />
          {sparks.map((deg) => (
            <span
              key={deg}
              className="sig-spark"
              style={{ transform: `rotate(${deg}deg)` }}
            />
          ))}
        </div>
      )}

      <svg
        viewBox="0 0 220 220"
        width={size}
        height={size}
        className={`sig-svg ${stamping ? "sig-stamped" : ""}`}
      >
        <defs>
          <linearGradient id={`goldRim-${uid}`} x1="15" y1="10" x2="205" y2="210" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFBEB" />
            <stop offset="35%" stopColor="#FDE047" />
            <stop offset="70%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#FEF08A" />
          </linearGradient>
          <linearGradient id={`crimsonCore-${uid}`} x1="40" y1="35" x2="180" y2="185" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1E0B13" />
            <stop offset="50%" stopColor="#080D18" />
            <stop offset="100%" stopColor="#260A13" />
          </linearGradient>
          <linearGradient id={`foilSheen-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="50%" stopColor="rgba(254,249,195,0.42)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          {/* Top clockwise arc & Bottom counter-clockwise arc (so bottom text reads right-side-up!) */}
          <path id={`topArc-${uid}`} d="M 28,110 A 82,82 0 1,1 192,110" />
          <path id={`botArc-${uid}`} d="M 22,110 A 88,88 0 0,0 198,110" />
          <clipPath id={`sealClip-${uid}`}>
            <circle cx="110" cy="110" r="102" />
          </clipPath>
          {/* Central Medallion Clip holding the REAL 3D NearSignet Logo */}
          <clipPath id={`centerLogoClip-${uid}`}>
            <circle cx="110" cy="105" r="61" />
          </clipPath>
        </defs>

        {/* Outer Forged Obsidian-Crimson Base Disc */}
        <circle cx="110" cy="110" r="103" fill={`url(#crimsonCore-${uid})`} stroke={`url(#goldRim-${uid})`} strokeWidth="3" />
        <circle cx="110" cy="110" r="96" fill="none" stroke="rgba(253,224,71,0.35)" strokeWidth="1" />

        {/* Outer Slowly Rotating Precision Degree Bezel */}
        <g className="sig-spin-cw">
          {ticks.map((deg, idx) => (
            <line
              key={deg}
              x1="110"
              y1={idx % 4 === 0 ? "9" : "12"}
              x2="110"
              y2="17"
              stroke={idx % 4 === 0 ? "#FDE047" : "rgba(253,224,71,0.45)"}
              strokeWidth={idx % 4 === 0 ? "2" : "1"}
              transform={`rotate(${deg} 110 110)`}
            />
          ))}
        </g>

        {/* Curved Engraved Protocol Text (Top + Right-Side-Up Bottom) */}
        <text
          fill="#FDE047"
          fontSize="10"
          fontWeight="700"
          letterSpacing="2.8"
          fontFamily="var(--font-display), sans-serif"
        >
          <textPath href={`#topArc-${uid}`} startOffset="50%" textAnchor="middle">
            ★ NEARSIGNET PROTOCOL ★
          </textPath>
        </text>
        <text
          fill="#00EC97"
          fontSize="9"
          fontWeight="700"
          letterSpacing="2.3"
          fontFamily="var(--font-mono), monospace"
        >
          <textPath href={`#botArc-${uid}`} startOffset="50%" textAnchor="middle">
            {t("in.verified").toUpperCase()}
          </textPath>
        </text>

        {/* Counter-Rotating Emerald Cryptographic Ring */}
        <g className="sig-spin-ccw">
          <circle
            cx="110"
            cy="108"
            r="67"
            fill="none"
            stroke="#00EC97"
            strokeOpacity="0.65"
            strokeWidth="1.5"
            strokeDasharray="8 5 2 5"
          />
          {[45, 135, 225, 315].map((d) => (
            <polygon
              key={d}
              points="110,37 114,42 110,47 106,42"
              fill="#DC2626"
              stroke="#FDE047"
              strokeWidth="1"
              transform={`rotate(${d} 110 108)`}
            />
          ))}
        </g>

        {/* REAL 3D NEARSIGNET PROJECT LOGO FILLING THE ENTIRE CENTER BEHIND "SEALED" */}
        <g>
          <circle cx="110" cy="105" r="62.5" fill="#070B12" stroke={`url(#goldRim-${uid})`} strokeWidth="2.4" />
          <image
            href={SEAL_LOGO_DATA_URI}
            x="48"
            y="43"
            width="124"
            height="124"
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#centerLogoClip-${uid})`}
          />
          <circle cx="110" cy="105" r="61" fill="none" stroke="rgba(0,236,151,0.45)" strokeWidth="1.2" />
        </g>

        {/* Semi-Translucent Smoked-Glass SEALED Stamp Bar Across Lower Center */}
        <g transform="rotate(-5 110 129)">
          <rect
            x="32"
            y="114"
            width="156"
            height="30"
            rx="7"
            fill="rgba(5, 19, 16, 0.82)"
            stroke="#00EC97"
            strokeWidth="2.1"
          />
          <rect
            x="35.5"
            y="117.5"
            width="149"
            height="23"
            rx="4.5"
            fill="none"
            stroke="rgba(253,224,71,0.52)"
            strokeWidth="0.9"
          />
          <text
            x="110"
            y="135"
            textAnchor="middle"
            fill="#00EC97"
            fontSize="18.5"
            fontWeight="800"
            letterSpacing="4.2"
            fontFamily="var(--font-display), sans-serif"
          >
            SEALED
          </text>
        </g>

        {/* Live On-Chain Seal Code Pill */}
        <rect x="64" y="151" width="92" height="15" rx="7.5" fill="rgba(7,10,16,0.88)" stroke="rgba(253,224,71,0.4)" strokeWidth="0.8" />
        <text
          x="110"
          y="161.5"
          textAnchor="middle"
          fill="#FDE047"
          fontSize="7.6"
          fontWeight="700"
          letterSpacing="1.1"
          fontFamily="var(--font-mono), monospace"
        >
          {shortCode}
        </text>

        {/* Animated Diagonal Holographic Foil Shimmer */}
        <g clipPath={`url(#sealClip-${uid})`}>
          <rect
            x="-120"
            y="-40"
            width="90"
            height="300"
            fill={`url(#foilSheen-${uid})`}
            transform="rotate(25 110 110)"
            className="sig-foil-bar"
          />
        </g>
      </svg>

      <style>{`
        .sig-seal-wrap{position:relative;display:inline-grid;place-items:center;user-select:none}
        .sig-seal-wrap.is-clickable{cursor:pointer}
        .sig-seal-wrap.is-clickable:hover .sig-svg{transform:scale(1.04) rotate(-2deg)}
        .sig-svg{
          display:block;
          filter:drop-shadow(0 14px 28px rgba(0,0,0,0.68)) drop-shadow(0 0 20px rgba(0,236,151,0.22));
          transition:transform .22s cubic-bezier(.2,.8,.2,1);
        }
        .sig-stamped{
          animation:sigStampSlam .62s cubic-bezier(.16,1.25,.3,1) both;
        }
        .sig-spin-cw{transform-origin:110px 110px;animation:sigSpin 32s linear infinite}
        .sig-spin-ccw{transform-origin:110px 108px;animation:sigSpinRev 22s linear infinite}
        .sig-foil-bar{animation:sigFoilSweep 3.8s ease-in-out infinite}

        .sig-fx-layer{position:absolute;inset:0;pointer-events:none;z-index:3;display:grid;place-items:center}
        .sig-plunger{
          position:absolute;width:86%;height:86%;border-radius:50%;
          border:3px solid #FDE047;
          background:radial-gradient(circle, rgba(220,38,38,0.45), rgba(0,236,151,0.25));
          animation:sigPlungerDrop .42s cubic-bezier(.6,0,.9,.3) forwards;
        }
        .sig-flash{
          position:absolute;inset:-18%;border-radius:50%;
          background:radial-gradient(circle, rgba(254,249,195,0.95) 0%, rgba(245,158,11,0.55) 38%, rgba(0,236,151,0) 72%);
          animation:sigImpactFlash .55s ease-out .28s both;
        }
        .sig-wave{
          position:absolute;width:72%;height:72%;border-radius:50%;
          border:2.5px solid #FDE047;
          box-shadow:0 0 24px #00EC97;
          opacity:0;
        }
        .sig-wave.w1{animation:sigShockwave .72s cubic-bezier(.16,1,.3,1) .30s forwards}
        .sig-wave.w2{border-color:#00EC97;animation:sigShockwave .86s cubic-bezier(.16,1,.3,1) .38s forwards}
        .sig-spark{
          position:absolute;left:50%;top:50%;width:2px;height:50%;
          transform-origin:0 0;opacity:0;
          animation:sigSparkBurst .68s cubic-bezier(.16,1,.3,1) .31s forwards;
        }
        .sig-spark::after{
          content:"";display:block;width:3px;height:18px;border-radius:999px;
          margin-top:42%;
          background:linear-gradient(180deg, #FFFBEB, #FDE047, #00EC97);
          box-shadow:0 0 10px #FDE047;
        }

        @keyframes sigSpin{to{transform:rotate(360deg)}}
        @keyframes sigSpinRev{to{transform:rotate(-360deg)}}
        @keyframes sigFoilSweep{
          0%, 20% { transform:translateX(0) rotate(25deg); opacity:0; }
          45% { opacity:1; }
          75%, 100% { transform:translateX(360px) rotate(25deg); opacity:0; }
        }
        @keyframes sigPlungerDrop{
          0% { opacity:0; transform:scale(2.3) translateY(-70px); }
          70% { opacity:0.95; transform:scale(1.0) translateY(0); }
          100% { opacity:0; transform:scale(0.92); }
        }
        @keyframes sigStampSlam{
          0% { opacity:0; transform:scale(2.15) rotate(-18deg); filter:brightness(2); }
          46% { opacity:1; transform:scale(0.90) rotate(-3deg); filter:brightness(1.5); }
          68% { transform:scale(1.06) rotate(-6deg); }
          84% { transform:scale(0.98) rotate(-4.5deg); }
          100% { opacity:1; transform:scale(1) rotate(0deg); filter:brightness(1); }
        }
        @keyframes sigImpactFlash{
          0% { opacity:0; transform:scale(0.5); }
          25% { opacity:1; transform:scale(1.1); }
          100% { opacity:0; transform:scale(1.55); }
        }
        @keyframes sigShockwave{
          0% { opacity:0.95; transform:scale(0.65); }
          100% { opacity:0; transform:scale(1.95); }
        }
        @keyframes sigSparkBurst{
          0% { opacity:1; }
          100% { opacity:0; transform:rotate(var(--r, 0deg)) translateY(36px); }
        }
      `}</style>
    </div>
  );
}
