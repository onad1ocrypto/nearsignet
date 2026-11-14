"use client";

import { useEffect, useRef } from "react";

interface BoltSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

interface Bolt {
  segments: BoltSegment[];
  alpha: number;
  decay: number;
}

function createBolt(w: number, h: number): Bolt {
  const startX = Math.random() * w;
  const startY = -20;
  const targetX = startX + (Math.random() - 0.5) * w * 0.52;
  const targetY = h * (0.35 + Math.random() * 0.42);
  const steps = 14;
  const segments: BoltSegment[] = [];

  let cx = startX;
  let cy = startY;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const nx = startX + (targetX - startX) * t + (Math.random() - 0.5) * 64;
    const ny = startY + (targetY - startY) * t + (Math.random() - 0.5) * 16;
    segments.push({ x1: cx, y1: cy, x2: nx, y2: ny, width: Math.max(0.7, 2.3 * (1 - t * 0.65)) });

    if (i > 3 && i < steps - 2 && Math.random() < 0.32) {
      let bx = nx;
      let by = ny;
      const bSteps = 4 + Math.floor(Math.random() * 3);
      const dir = Math.random() < 0.5 ? -1 : 1;
      for (let b = 0; b < bSteps; b++) {
        const bnx = bx + dir * (16 + Math.random() * 32);
        const bny = by + 16 + Math.random() * 26;
        segments.push({ x1: bx, y1: by, x2: bnx, y2: bny, width: 0.8 });
        bx = bnx;
        by = bny;
      }
    }
    cx = nx;
    cy = ny;
  }

  return {
    segments,
    alpha: 0.78,
    decay: 0.026 + Math.random() * 0.018,
  };
}

/**
 * Global "Kilatan Emas" (Golden Lightning + Liquid Gold Shimmer) Web Atmosphere.
 * Uses soft volumetric radial bokeh & branching lightning streaks (zero flat dots).
 */
export function GoldenAtmosphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const bolts: Bolt[] = [createBolt(w, h)];
    let nextBoltAt = performance.now() + 2400;
    let raf = 0;

    const render = (now: number) => {
      ctx.clearRect(0, 0, w, h);

      if (now >= nextBoltAt && bolts.length < 2) {
        bolts.push(createBolt(w, h));
        nextBoltAt = now + 2800 + Math.random() * 3600;
      }

      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        b.alpha -= b.decay;
        if (b.alpha <= 0) {
          bolts.splice(i, 1);
          continue;
        }

        if (b.segments.length > 0) {
          const head = b.segments[Math.floor(b.segments.length * 0.4)];
          const grad = ctx.createRadialGradient(head.x1, head.y1, 4, head.x1, head.y1, 310);
          grad.addColorStop(0, `rgba(253, 224, 71, ${b.alpha * 0.14})`);
          grad.addColorStop(0.5, `rgba(245, 158, 11, ${b.alpha * 0.06})`);
          grad.addColorStop(1, "rgba(245, 158, 11, 0)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        }

        ctx.save();
        ctx.lineCap = "round";
        ctx.shadowBlur = 18;
        ctx.shadowColor = `rgba(245, 158, 11, ${b.alpha})`;

        for (const seg of b.segments) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(245, 158, 11, ${b.alpha * 0.44})`;
          ctx.lineWidth = seg.width * 2.5;
          ctx.moveTo(seg.x1, seg.y1);
          ctx.lineTo(seg.x2, seg.y2);
          ctx.stroke();

          ctx.beginPath();
          ctx.strokeStyle = `rgba(254, 249, 195, ${b.alpha * 0.85})`;
          ctx.lineWidth = seg.width * 0.8;
          ctx.moveTo(seg.x1, seg.y1);
          ctx.lineTo(seg.x2, seg.y2);
          ctx.stroke();
        }
        ctx.restore();
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="gold-atmo" aria-hidden>
      <div className="gold-atmo-img" />
      <div className="gold-atmo-sheen" />
      <canvas ref={canvasRef} className="gold-atmo-canvas" />
    </div>
  );
}
