"use client";

import type { CSSProperties } from "react";

export type OrinPose = "idle" | "scan" | "sealed" | "wink" | "slam" | "jump";

const POSE_SRC: Record<"idle" | "scan" | "sealed", string> = {
  idle: "/brand/v6-orin-idle.jpg",
  scan: "/brand/v6-orin-scan.jpg",
  sealed: "/brand/v6-orin-sealed.jpg",
};

const POSE_TAG: Record<"idle" | "scan" | "sealed", string> = {
  idle: "ORIN · READY",
  scan: "ORIN · SCANNING",
  sealed: "ORIN · SEALED",
};

function normalizePose(p: OrinPose): "idle" | "scan" | "sealed" {
  if (p === "scan" || p === "wink") return "scan";
  if (p === "sealed" || p === "slam" || p === "jump") return "sealed";
  return "idle";
}

/**
 * Orin — Cyber-Inspector Owl in Deep Imperial Crimson & Gold Cloak (`v6` Close-Up Hero Bust).
 * Rendered large, razor-sharp, and seamlessly feathered into the glass surface (zero boxy sticker edges).
 */
export function Orin({
  pose = "idle",
  size = 128,
  glow = false,
  className = "",
  style,
  alt = "Orin — NearSignet Cyber-Inspector Owl",
}: {
  pose?: OrinPose;
  size?: number;
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
  alt?: string;
}) {
  const actual = normalizePose(pose);

  // Compact circular close-up avatar for inline chat/notes (`size <= 54`)
  if (size <= 54) {
    const d = Math.max(48, size);
    return (
      <div
        className={className}
        style={{
          position: "relative",
          width: d,
          height: d,
          borderRadius: "50%",
          overflow: "hidden",
          flex: "none",
          border: actual === "scan" ? "1.5px solid rgba(0,236,151,0.6)" : "1.5px solid rgba(253,224,71,0.55)",
          boxShadow: "0 6px 18px rgba(0,0,0,0.6), 0 0 16px rgba(0,236,151,0.22)",
          background: "#05070D",
          ...style,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={POSE_SRC[actual]}
          alt={alt}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "50% 40%",
            transform: "scale(1.32)",
            display: "block",
          }}
        />
      </div>
    );
  }

  // Seamless, generously sized close-up character bust (`128px–220px` tall)
  const h = Math.max(124, Math.round(size * 1.42));
  const w = Math.round(h * 1.44);

  const aura =
    actual === "sealed"
      ? "radial-gradient(ellipse 68% 68% at 50% 52%, rgba(245, 158, 11, 0.28), rgba(185, 28, 28, 0.16) 52%, transparent 76%)"
      : actual === "scan" || glow
        ? "radial-gradient(ellipse 68% 68% at 50% 52%, rgba(0, 236, 151, 0.26), rgba(185, 28, 28, 0.14) 52%, transparent 76%)"
        : "radial-gradient(ellipse 68% 68% at 50% 52%, rgba(185, 28, 28, 0.28), rgba(0, 236, 151, 0.14) 54%, transparent 76%)";

  const featherMask =
    "radial-gradient(ellipse 80% 86% at 50% 50%, #000 58%, rgba(0,0,0,0.82) 73%, rgba(0,0,0,0.25) 88%, transparent 100%)";

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: w,
        height: h,
        maxWidth: "100%",
        flex: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        userSelect: "none",
        ...style,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: "-8%",
          background: aura,
          filter: "blur(10px)",
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={POSE_SRC[actual]}
        alt={alt}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "50% 38%",
          display: "block",
          WebkitMaskImage: featherMask,
          maskImage: featherMask,
          filter: "contrast(1.06) saturate(1.08) drop-shadow(0 14px 26px rgba(0,0,0,0.75))",
        }}
      />
      <span
        className="mono"
        style={{
          position: "absolute",
          bottom: 4,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "2px 9px",
          borderRadius: 999,
          background: "rgba(6, 9, 16, 0.84)",
          border:
            actual === "scan"
              ? "1px solid rgba(0, 236, 151, 0.48)"
              : "1px solid rgba(253, 224, 71, 0.42)",
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: "0.09em",
          whiteSpace: "nowrap",
          color: actual === "scan" ? "#00EC97" : "#FDE047",
          boxShadow: "0 4px 12px rgba(0,0,0,0.65)",
        }}
      >
        ● {POSE_TAG[actual]}
      </span>
    </div>
  );
}
