"use client";

import type { CSSProperties } from "react";

export type OrinPose = "idle" | "scan" | "sealed" | "wink" | "slam" | "jump";

const POSE_SRC: Record<"idle" | "scan" | "sealed", string> = {
  idle: "/brand/v5-orin-idle.jpg",
  scan: "/brand/v5-orin-scan.jpg",
  sealed: "/brand/v5-orin-sealed.jpg",
};

const POSE_TAG: Record<"idle" | "scan" | "sealed", string> = {
  idle: "ORIN · READY",
  scan: "ORIN · SCAN",
  sealed: "ORIN · SEALED",
};

function normalizePose(p: OrinPose): "idle" | "scan" | "sealed" {
  if (p === "scan" || p === "wink") return "scan";
  if (p === "sealed" || p === "slam" || p === "jump") return "sealed";
  return "idle";
}

/**
 * Orin — Cyber-Inspector Owl in Deep Imperial Crimson Cloak (`v5`),
 * displayed inside a sleek smoked-glass 3D vault viewport.
 */
export function Orin({
  pose = "idle",
  size = 116,
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
  const w = actual === "idle" ? size : Math.round(size * 1.32);
  const h = size;
  const radius = Math.max(12, Math.round(size * 0.16));

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: w,
        height: h,
        borderRadius: radius,
        overflow: "hidden",
        flex: "none",
        border: actual === "sealed"
          ? "1px solid rgba(253, 224, 71, 0.58)"
          : actual === "scan" || glow
            ? "1px solid rgba(0, 236, 151, 0.52)"
            : "1px solid rgba(185, 28, 28, 0.55)",
        boxShadow:
          actual === "sealed"
            ? "0 12px 30px rgba(0,0,0,0.65), 0 0 24px rgba(245,158,11,0.24)"
            : glow
              ? "0 12px 30px rgba(0,0,0,0.65), 0 0 28px rgba(0,236,151,0.28)"
              : "0 10px 26px rgba(0,0,0,0.65), 0 0 22px rgba(153,27,27,0.28)",
        background: "#06080E",
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
          objectPosition: "center 30%",
          display: "block",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          boxShadow: "inset 0 0 20px rgba(6, 8, 14, 0.72)",
          background: "linear-gradient(180deg, transparent 60%, rgba(6,8,14,0.82) 100%)",
          pointerEvents: "none",
        }}
      />
      {size >= 84 && (
        <span
          className="mono"
          style={{
            position: "absolute",
            left: 8,
            bottom: 6,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: actual === "scan" ? "#00EC97" : "#FDE047",
            textShadow: "0 1px 6px #000",
            pointerEvents: "none",
          }}
        >
          ● {POSE_TAG[actual]}
        </span>
      )}
    </div>
  );
}
