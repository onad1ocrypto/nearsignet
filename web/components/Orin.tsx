"use client";

import type { CSSProperties } from "react";

export type OrinPose = "idle" | "scan" | "sealed" | "wink" | "slam" | "jump";

/**
 * Cut-out PNGs (transparent background, bottom-edge fade). The JPEG originals were
 * opaque rectangles, which is why every Orin looked like a pasted-on sticker with a
 * visible box around the mascot.
 */
const POSE_SRC: Record<"idle" | "scan" | "sealed", string> = {
  idle: "/brand/orin-idle.png",
  scan: "/brand/orin-scan.png",
  sealed: "/brand/orin-sealed.png",
};

/** Square transparent head crops, used for the small inline avatars. */
const POSE_HEAD_SRC: Record<"idle" | "scan" | "sealed", string> = {
  idle: "/brand/orin-head-idle.png",
  scan: "/brand/orin-head-scan.png",
  sealed: "/brand/orin-head-sealed.png",
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
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...style,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={POSE_HEAD_SRC[actual]}
          alt={alt}
          loading="lazy"
          decoding="async"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
            filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.55))",
          }}
        />
      </div>
    );
  }

  // Seamless, generously sized close-up character bust (`128px–220px` tall)
  const h = Math.max(124, Math.round(size * 1.42));
  const w = Math.round(h * 1.44);

  /* Optional soft light bloom behind the mascot — never an outline. */
  const aura =
    actual === "sealed"
      ? "radial-gradient(ellipse 62% 62% at 50% 46%, rgba(245, 158, 11, 0.22), transparent 72%)"
      : actual === "scan" || glow
        ? "radial-gradient(ellipse 62% 62% at 50% 46%, rgba(0, 236, 151, 0.2), transparent 72%)"
        : "transparent";

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
      {aura !== "transparent" && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: "-6%",
            background: aura,
            filter: "blur(18px)",
          }}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={POSE_SRC[actual]}
        alt={alt}
        loading="lazy"
        decoding="async"
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "50% 50%",
          display: "block",
          filter: "contrast(1.04) saturate(1.06) drop-shadow(0 12px 22px rgba(0,0,0,0.6))",
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
