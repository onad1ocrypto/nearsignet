"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Icon } from "@/components/Icon";
import { Orin } from "@/components/Orin";
import { StatusBadge } from "@/components/ui";
import type { Order, ProductKind, Status } from "@/lib/data";
import type { FileFacts, RuleResult } from "@/lib/verify";

export type Log = { who: string; msg: string; res?: string; txHash?: string; kind: "ai" | "near" | "hook" | "err" };
type CheckState = "idle" | "run" | "pass" | "fail" | "manual";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SAMPLE_PX = 220;
const WHITE = 242;
const AUDIO_DECODE_LIMIT = 60 * 1024 * 1024;

async function videoMetadata(file: File): Promise<{ durationSec?: number; width?: number; height?: number } | null> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = url;
    await new Promise<void>((resolve, reject) => {
      const done = () => resolve();
      v.onloadedmetadata = done;
      v.onerror = () => reject(new Error("metadata"));
      setTimeout(done, 8000);
    });
    if (!Number.isFinite(v.duration)) {
      await new Promise<void>((resolve) => {
        const finish = () => resolve();
        v.ondurationchange = () => { if (Number.isFinite(v.duration)) finish(); };
        v.onseeked = finish;
        setTimeout(finish, 4000);
        try { v.currentTime = 1e101; } catch { finish(); }
      });
    }
    const out = {
      durationSec: Number.isFinite(v.duration) ? v.duration : undefined,
      width: v.videoWidth || undefined,
      height: v.videoHeight || undefined,
    };
    return out.durationSec === undefined && out.width === undefined ? null : out;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function audioLevel(file: File): Promise<{ dbfs?: number; hasAudio?: boolean; durationSec?: number }> {
  if (file.size > AUDIO_DECODE_LIMIT) return {};
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return {};
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    let sum = 0;
    let n = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < data.length; i += 8) {
        sum += data[i] * data[i];
        n++;
      }
    }
    const durationSec = Number.isFinite(buf.duration) ? buf.duration : undefined;
    if (!n) return { hasAudio: false, durationSec };
    const rms = Math.sqrt(sum / n);
    if (rms <= 0) return { hasAudio: false, durationSec };
    return { hasAudio: true, dbfs: 20 * Math.log10(rms), durationSec };
  } catch {
    return {};
  } finally {
    void ctx.close();
  }
}

async function pixelsOf(file: File): Promise<{ width: number; height: number; whiteRatio: number; bgWhite: number; avgSaturation: number; alpha: boolean } | null> {
  try {
    const bmp = await createImageBitmap(file);
    const { width, height } = bmp;
    const scale = Math.min(1, SAMPLE_PX / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    bmp.close?.();

    let white = 0;
    let alpha = false;
    let ringWhite = 0;
    let ringN = 0;
    const rim = Math.max(2, Math.round(Math.min(w, h) * 0.06));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 250) alpha = true;
        const isWhite = r >= WHITE && g >= WHITE && b >= WHITE;
        if (isWhite) white++;
        if (x < rim || y < rim || x >= w - rim || y >= h - rim) {
          ringN++;
          if (isWhite) ringWhite++;
        }
      }
    }
    let satSum = 0;
    let satN = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        satSum += mx === 0 ? 0 : (mx - mn) / mx;
        satN++;
      }
    }
    const n = w * h;
    return { width, height, whiteRatio: white / n, bgWhite: ringN ? ringWhite / ringN : 0, avgSaturation: satN ? satSum / satN : 0, alpha };
  } catch {
    return null;
  }
}

export async function measureFiles(files: File[]): Promise<FileFacts[]> {
  const out: FileFacts[] = [];
  for (const f of files) {
    const base: FileFacts = { name: f.name, mime: f.type || "application/octet-stream", sizeBytes: f.size };
    const e = (f.name.split(".").pop() || "").toLowerCase();
    const video = base.mime.startsWith("video/") || ["mp4", "mov", "m4v", "webm", "mkv", "avi"].includes(e);
    const audio = base.mime.startsWith("audio/") || ["mp3", "wav", "m4a", "aac", "ogg", "opus", "flac"].includes(e);
    if (base.mime.startsWith("image/")) {
      const px = await pixelsOf(f);
      if (px) Object.assign(base, px);
    } else if (video) {
      const meta = await videoMetadata(f);
      if (meta) Object.assign(base, meta);
      const level = await audioLevel(f);
      if (typeof level.hasAudio === "boolean") base.hasAudio = level.hasAudio;
      if (typeof level.dbfs === "number") base.dbfs = level.dbfs;
    } else if (audio) {
      const level = await audioLevel(f);
      if (typeof level.hasAudio === "boolean") base.hasAudio = level.hasAudio;
      if (typeof level.dbfs === "number") base.dbfs = level.dbfs;
      if (typeof level.durationSec === "number") base.durationSec = level.durationSec;
    } else if (/(text\/|json|csv|xml)/.test(base.mime) || /\.(txt|md|csv|json)$/i.test(f.name)) {
      base.text = await f.text().catch(() => "");
    }
    out.push(base);
  }
  return out;
}

const KINDS: ProductKind[] = ["bottle", "mug", "shoe", "bag", "candle", "watch", "plant", "cap"];
const COLORS = ["#00EC97", "#F59E0B", "#38BDF8", "#10B981", "#A78BFA", "#FBBF24"];
const GREY_INDEX = 13;

const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadSampleImage(src: string): Promise<HTMLImageElement | null> {
  if (typeof window === "undefined" || typeof Image === "undefined") return Promise.resolve(null);
  const hit = imgCache.get(src);
  if (hit) return hit;
  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => resolve(null), 2500);
    im.onload = () => {
      window.clearTimeout(timer);
      resolve(im);
    };
    im.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    im.src = src;
  });
  imgCache.set(src, p);
  return p;
}

async function drawTokenRender(
  index: number,
  kind: ProductKind,
  color: string,
  bg: string,
  w: number,
  h: number,
  photo: HTMLImageElement | null
): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  if (photo && photo.naturalWidth > 0) {
    // Composite real photorealistic 3D studio sneaker inside safe inner frame so outer border ring stays 100% pure bg (#FFFFFF or #D6DEDB defect)
    ctx.save();
    const scaleVar = 1 + ((index % 5) - 2) * 0.035;
    const mirror = index % 4 === 2 ? -1 : 1;
    const hueDeg = [0, 0, 14, -12, 28, -22][index % 6];
    if (typeof ctx.filter === "string" && hueDeg !== 0) {
      ctx.filter = `hue-rotate(${hueDeg}deg) saturate(1.06)`;
    }
    if (bg !== "#FFFFFF") {
      // Multiply blends white studio backdrop seamlessly into the grey cyclorama defect (#D6DEDB)
      ctx.globalCompositeOperation = "multiply";
    }
    const boxW = w * 0.78 * scaleVar;
    const boxH = boxW * (photo.naturalHeight / photo.naturalWidth);
    ctx.translate(w / 2, h * 0.51);
    ctx.scale(mirror, 1);
    ctx.drawImage(photo, -boxW / 2, -boxH / 2, boxW, boxH);
    ctx.restore();

    // Subtle studio shot slate inside safe inner zone (well inside outer border ring)
    ctx.save();
    ctx.fillStyle = bg === "#FFFFFF" ? "rgba(15, 23, 42, 0.36)" : "rgba(153, 27, 27, 0.78)";
    ctx.font = `700 ${Math.round(w * 0.018)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText(
      bg === "#FFFFFF" ? `STUDIO SHOT #${String(index + 1).padStart(2, "0")} · 2400×2400 · #FFFFFF` : `STUDIO SHOT #${String(index + 1).padStart(2, "0")} · GREY BACKDROP (#D6DEDB)`,
      w * 0.14,
      h * 0.84
    );
    ctx.restore();
  } else {
    ctx.fillStyle = "rgba(15,23,42,.12)";
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.78, w * 0.22, h * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.strokeStyle = "#0F172A";
    ctx.lineWidth = Math.max(8, w * 0.01);
    const cx = w / 2;
    const cy = h * 0.48;
    const s = Math.min(w, h) * 0.26;
    ctx.beginPath();
    if (kind === "watch" || kind === "bottle") {
      ctx.arc(cx, cy, s * 0.85, 0, Math.PI * 2);
    } else if (kind === "mug" || kind === "bag") {
      ctx.roundRect(cx - s * 0.8, cy - s * 0.8, s * 1.6, s * 1.6, s * 0.24);
    } else {
      ctx.moveTo(cx, cy - s * 0.95);
      ctx.lineTo(cx + s * 0.9, cy);
      ctx.lineTo(cx, cy + s * 0.95);
      ctx.lineTo(cx - s * 0.9, cy);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
  }

  return await new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.9));
}

export async function makeSampleFiles(count = 20, includeGreyDefect = true): Promise<File[]> {
  const sneakerPhoto = await loadSampleImage("/samples/sneaker-white.jpg");
  const files: File[] = [];
  for (let i = 0; i < count; i++) {
    const bad = includeGreyDefect && i === GREY_INDEX;
    const blob = await drawTokenRender(
      i,
      KINDS[i % KINDS.length],
      COLORS[i % COLORS.length],
      bad ? "#D6DEDB" : "#FFFFFF",
      2400,
      2400,
      sneakerPhoto
    );
    files.push(new File([blob], `RENDER_${String(i + 1).padStart(3, "0")}.jpg`, { type: "image/jpeg" }));
  }
  return files;
}

function drawReelFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  total: number,
  reelPhoto: HTMLImageElement | null
) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#070A0F");
  g.addColorStop(1, "#0E2920");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const bob = Math.sin(t * 1.6) * 22;
  if (reelPhoto && reelPhoto.naturalWidth > 0) {
    ctx.save();
    const zoom = 1.04 + Math.sin(t * 0.9) * 0.04;
    const drawH = h * 0.56 * zoom;
    const drawW = drawH * (reelPhoto.naturalWidth / reelPhoto.naturalHeight);
    ctx.translate(w / 2, h * 0.44 + bob);
    ctx.drawImage(reelPhoto, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(w / 2, h * 0.5 + bob);
    ctx.fillStyle = "#00EC97";
    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(0, 0, 220, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (t < 3) {
    ctx.globalAlpha = Math.min(1, 3 - t) * 0.95;
    ctx.fillStyle = "#F59E0B";
    ctx.font = "800 64px system-ui, sans-serif";
    ctx.fillText("NEARSIGNET · NEAR", 70, 150);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "700 92px system-ui, sans-serif";
  ctx.fillText("Chain Abstraction", 70, h - 310);
  ctx.font = "700 112px system-ui, sans-serif";
  ctx.fillText("Intents v2", 70, h - 180);

  ctx.fillStyle = "rgba(255,255,255,.2)";
  ctx.fillRect(70, h - 90, w - 140, 12);
  ctx.fillStyle = "#00EC97";
  ctx.fillRect(70, h - 90, (w - 140) * Math.min(1, t / total), 12);
}

export async function makeSampleVideo(seconds = 6): Promise<File[]> {
  const reelPhoto = await loadSampleImage("/samples/wallet-reel.jpg");
  const W = 1080, H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  const stream = canvas.captureStream(30);

  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  let audioCtx: AudioContext | undefined;
  let osc: OscillatorNode | undefined;
  if (Ctx) {
    try {
      audioCtx = new Ctx();
      const dest = audioCtx.createMediaStreamDestination();
      osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = 220;
      gain.gain.value = 0.15;
      osc.connect(gain);
      gain.connect(dest);
      osc.start();
      for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
    } catch {}
  }

  const mime = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find(
    (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)
  );
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>((res) => { rec.onstop = () => res(); });
  rec.start();

  const t0 = performance.now();
  await new Promise<void>((res) => {
    const frame = () => {
      const t = (performance.now() - t0) / 1000;
      drawReelFrame(ctx, W, H, t, seconds, reelPhoto);
      if (t < seconds) requestAnimationFrame(frame);
      else res();
    };
    frame();
  });

  rec.stop();
  await stopped;
  osc?.stop();
  void audioCtx?.close();

  const type = (mime || "video/webm").split(";")[0];
  const blob = new Blob(chunks, { type });
  return [new File([blob], `motion-reel-9x16.${type === "video/mp4" ? "mp4" : "webm"}`, { type })];
}

export function DeliveryPanel({
  order, status, setStatus, log, onVerdict,
}: {
  order: Order;
  status: Status;
  setStatus: (s: Status) => void;
  log: (l: Log) => void;
  onVerdict?: (v: { measured: number; manual: number; failed: number; evidenceHash?: string }) => void;
}) {
  const { t } = useI18n();
  const [files, setFiles] = useState<File[]>([]);
  const [facts, setFacts] = useState<FileFacts[]>([]);
  const [busy, setBusy] = useState<"" | "reading" | "sample" | "verifying">("");
  const [checks, setChecks] = useState<CheckState[]>(() => order.criteria.map(() => "idle"));
  const [notes, setNotes] = useState<string[]>(() => order.criteria.map(() => ""));
  const [evidenceHash, setEvidenceHash] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const previews = useMemo(() => {
    const out: { url: string; name: string; video: boolean; greyDefect?: boolean }[] = [];
    const pickIndices =
      files.length >= 14
        ? [0, 1, 2, GREY_INDEX, Math.max(3, files.length - 2), Math.max(4, files.length - 1)]
        : files.map((_, idx) => idx).slice(0, 6);
    const seen = new Set<number>();
    for (const idx of pickIndices) {
      if (seen.has(idx) || idx >= files.length) continue;
      seen.add(idx);
      const f = files[idx];
      const e = (f.name.split(".").pop() || "").toLowerCase();
      const video = f.type.startsWith("video/") || ["mp4", "mov", "m4v", "webm"].includes(e);
      if (!f.type.startsWith("image/") && !video) continue;
      const fact = facts[idx];
      const greyDefect = typeof fact?.bgWhite === "number" && fact.bgWhite < 0.85;
      out.push({ url: URL.createObjectURL(f), name: f.name, video, greyDefect });
      if (out.length >= 6) break;
    }
    return out;
  }, [files, facts]);

  const uploaded = files.length > 0;
  const videoJob = useMemo(
    () =>
      order.criteria.some((c) => /duration|audio|aspect|dbfs|count\((videos|clips|audio|reels)/i.test(c.rule)) ||
      /reel|video|podcast|voice|motion/i.test(`${order.title} ${order.brief}`),
    [order.criteria, order.title, order.brief]
  );
  const totalMb = useMemo(() => (files.reduce((s, f) => s + f.size, 0) / 1_048_576).toFixed(1), [files]);

  const take = useCallback(
    async (list: File[], source: "drop" | "sample") => {
      if (!list.length) return;
      setBusy("reading");
      setChecks(order.criteria.map(() => "idle"));
      setNotes(order.criteria.map(() => ""));
      setEvidenceHash("");
      const measured = await measureFiles(list);
      setFiles(list);
      setFacts(measured);
      setBusy("");
      const mb = (list.reduce((s, f) => s + f.size, 0) / 1_048_576).toFixed(1);
      log({
        who: "orin_ingest",
        msg: source === "sample" ? "delivery.uploaded (synthesized set)" : "delivery.uploaded",
        res: `${list.length} files · ${mb} MB`,
        kind: "hook",
      });
      if (status === "revision") setStatus("in_escrow");
    },
    [log, order.criteria, setStatus, status]
  );

  const verify = async () => {
    if (!facts.length) return;
    setBusy("verifying");
    setStatus("verifying");
    log({ who: "verifier.nearsignet-protocol.testnet", msg: "orin_scan_start", res: `${order.criteria.length} rules · ${facts.length} files measured`, kind: "ai" });
    setChecks(order.criteria.map(() => "run"));

    let verdict: { results?: RuleResult[]; evidenceHash?: string } | null = null;
    try {
      const r = await fetch("/api/agent/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria: order.criteria, files: facts, dueAt: order.due }),
      });
      if (r.ok) verdict = await r.json();
    } catch {}

    const results: RuleResult[] = order.criteria.map((_, i) =>
      verdict?.results?.[i] ?? { pass: false, note: "verification could not run — try again", kind: "manual" as const }
    );
    if (verdict?.evidenceHash) setEvidenceHash(verdict.evidenceHash);

    for (let i = 0; i < order.criteria.length; i++) {
      await sleep(400);
      const res = results[i];
      setChecks((x) => x.map((v, j) => (j === i ? (res.pass ? "pass" : res.kind === "manual" ? "manual" : "fail") : v)));
      setNotes((x) => x.map((v, j) => (j === i ? res.note : v)));
      log({
        who: "verifier.nearsignet-protocol.testnet",
        msg: order.criteria[i].rule,
        res: res.pass ? `✓ ${res.note}` : res.note,
        kind: res.pass ? "ai" : res.kind === "manual" ? "hook" : "err",
      });
    }

    const failed = results.filter((r) => !r.pass && r.kind !== "manual");
    const manualOnly = results.filter((r) => !r.pass && r.kind === "manual");
    onVerdict?.({
      measured: results.filter((r) => r.kind === "measured" && r.pass).length,
      manual: manualOnly.length,
      failed: failed.length,
      evidenceHash: verdict?.evidenceHash,
    });
    await sleep(300);
    if (failed.length) {
      const idx = results.findIndex((r) => !r.pass && r.kind !== "manual");
      log({ who: "nearsignet-protocol.testnet", msg: `submit_verification(pass=false, ${order.criteria[idx]?.label ?? "delivery"})`, res: "NEAR stays locked in escrow", kind: "near" });
      setStatus("revision");
    } else {
      log({ who: "nearsignet-protocol.testnet", msg: "submit_verification(all_passed=true)", res: "72h client review started", kind: "near" });
      setStatus("review");
    }
    setBusy("");
  };

  const head =
    status === "revision"
      ? { i: "refresh", t: t("dl.revT"), s: t("dl.revB"), accent: "#fb923c" }
      : status === "verifying"
        ? { i: "bot", t: t("dl.verT"), s: t("dl.verB"), accent: "#00ec97" }
        : { i: "upload", t: t("dl.t"), s: t("dl.b"), accent: "#00ec97" };

  const measuredCount = facts.filter((f) => f.width || f.durationSec !== undefined || f.text !== undefined).length;

  return (
    <div className="card pad" style={{ borderColor: status === "revision" ? "rgba(251,146,60,0.4)" : "var(--border-glow)" }}>
      <div className="row" style={{ gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
        <span
          style={{
            width: 42, height: 42, borderRadius: 11,
            background: "rgba(0, 236, 151, 0.12)", border: `1px solid ${head.accent}`,
            color: head.accent, display: "grid", placeItems: "center", flex: "none",
          }}
        >
          <Icon name={head.i} size={19} />
        </span>
        <div className="col grow" style={{ gap: 2 }}>
          <b style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>{head.t}</b>
          <span className="tiny muted">{head.s}</span>
        </div>
        {status !== "in_escrow" && <StatusBadge s={status} />}
      </div>

      {!uploaded ? (
        <div
          className={`drop ${dragging ? "on" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void take(Array.from(e.dataTransfer.files), "drop"); }}
        >
          <Orin pose="scan" size={88} />
          <b style={{ fontSize: 16.5, marginTop: 4 }}>{busy === "reading" ? t("dl.reading") : t("dl.drop")}</b>
          <span className="tiny muted">{t("dl.dropSub2")}</span>
          <div className="row wrap" style={{ gap: 8, marginTop: 8, justifyContent: "center" }}>
            <button
              className="btn sm"
              onClick={async (e) => {
                e.stopPropagation();
                setBusy("sample");
                const list = videoJob ? await makeSampleVideo() : await makeSampleFiles(20, true);
                await take(list, "sample");
              }}
              disabled={!!busy}
            >
              <Icon name="sparkles" size={14} /> {busy === "sample" ? t(videoJob ? "dl.sampleBusyVideo" : "dl.sampleBusy") : t("dl.sample")}
            </button>
            {!videoJob && (
              <button
                className="btn sm mint"
                onClick={async (e) => {
                  e.stopPropagation();
                  setBusy("sample");
                  const list = await makeSampleFiles(20, false);
                  await take(list, "sample");
                }}
                disabled={!!busy}
              >
                <Icon name="check" size={14} /> Clean Set (20×2400px White)
              </button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.txt,.md,.csv,.json,.mp4,.mov,.webm,.mp3,.wav"
            style={{ display: "none" }}
            data-testid="dl-input"
            onChange={(e) => void take(Array.from(e.target.files ?? []), "drop")}
          />
        </div>
      ) : (
        <div className="dl-grid">
          <div className="col" style={{ gap: 10 }}>
            <div className="thumbs stagger" style={{ position: "relative" }}>
              {busy === "verifying" && <div className="scanline" />}
              {previews.map((p, i) => (
                <div
                  key={p.url}
                  className="thumb"
                  style={p.greyDefect ? { borderColor: "rgba(239,68,68,0.75)", boxShadow: "0 0 0 1px rgba(239,68,68,0.45)" } : undefined}
                >
                  {p.video ? (
                    <>
                      <video src={p.url} muted playsInline preload="metadata" />
                      <span className="thumb-play">▶</span>
                    </>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={p.url} alt={`delivery preview ${i + 1}`} />
                  )}
                  {p.greyDefect && (
                    <span
                      className="mono"
                      style={{
                        position: "absolute",
                        top: 5,
                        right: 5,
                        padding: "2px 6px",
                        borderRadius: 6,
                        background: "rgba(185, 28, 28, 0.92)",
                        color: "#FEE2E2",
                        fontSize: 9,
                        fontWeight: 700,
                      }}
                    >
                      GREY BG
                    </span>
                  )}
                  <span className="thumb-name mono">{p.name.replace(/\.[a-z]+$/i, "")}</span>
                </div>
              ))}
              {files.length > previews.length && (
                <div className="thumb more mono">+{files.length - previews.length}</div>
              )}
            </div>

            <div className="row wrap" style={{ gap: 8 }}>
              <span className="badge">
                <span className="dot" style={{ color: "var(--mint)" }} />
                {t("dl.measured", { n: String(measuredCount), total: String(files.length), mb: totalMb })}
              </span>
              <button className="btn sm" onClick={() => inputRef.current?.click()} disabled={!!busy}>
                <Icon name="refresh" size={13} /> {t("dl.replace")}
              </button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*,.pdf,.txt,.md,.csv,.json,.mp4,.mov,.webm,.mp3,.wav"
                style={{ display: "none" }}
                data-testid="dl-input"
                onChange={(e) => void take(Array.from(e.target.files ?? []), "drop")}
              />
            </div>

            {evidenceHash && (
              <div className="mono tiny" style={{ padding: "8px 11px", borderRadius: 10, border: "1px solid var(--border-glow)", background: "rgba(0,236,151,0.06)", wordBreak: "break-all" }}>
                <b style={{ color: "var(--mint)" }}>SHA-256 Evidence Hash:</b><br />
                {evidenceHash}
              </div>
            )}
          </div>

          <div className="col" style={{ gap: 8 }}>
            {order.criteria.map((c, i) => (
              <div key={c.label} className={`chk ${checks[i]}`}>
                <span className="chk-st">
                  {checks[i] === "pass" ? "✓" : checks[i] === "fail" ? "✕" : checks[i] === "manual" ? "?" : ""}
                </span>
                <span className="col" style={{ gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.label}</span>
                  <span className="mono tiny muted">{c.rule}</span>
                  {notes[i] && (
                    <span className="tiny" style={{ fontWeight: 600, color: checks[i] === "fail" ? "var(--red)" : checks[i] === "manual" ? "var(--amber)" : "var(--mint)" }}>
                      {notes[i]}
                    </span>
                  )}
                </span>
              </div>
            ))}

            {(status === "in_escrow" || status === "revision") && (
              <button className="btn mint" style={{ marginTop: 6 }} onClick={verify} disabled={busy === "verifying"}>
                <Icon name="bot" size={16} /> {busy === "verifying" ? t("dl.verRunning") : t("dl.run2")}
              </button>
            )}

            {status === "revision" && (
              <div className="note pop-in">
                <div className="row" style={{ gap: 10 }}>
                  <Orin size={46} pose="scan" glow={false} />
                  <b>Orin Inspector Flagged Defect</b>
                </div>
                <p className="muted" style={{ margin: "6px 0 10px", fontSize: 13.5 }}>
                  {notes.filter(Boolean).find((_, i) => checks[i] === "fail") ?? t("dl.agentMsg")}
                </p>
                <div className="row wrap" style={{ gap: 8 }}>
                  <button className="btn sm amber" onClick={() => inputRef.current?.click()}>
                    <Icon name="upload" size={14} /> {t("dl.reupload")}
                  </button>
                  {!videoJob && (
                    <button
                      className="btn sm mint"
                      onClick={async () => {
                        setBusy("sample");
                        const list = await makeSampleFiles(20, false);
                        await take(list, "sample");
                      }}
                    >
                      <Icon name="check" size={14} /> Fix #14 & Re-upload Clean Set
                    </button>
                  )}
                </div>
              </div>
            )}

            {status === "review" && (
              <span className="badge st-paid" style={{ alignSelf: "flex-start" }}>
                <span className="dot" /> {t("dl.sent")}
              </span>
            )}
          </div>
        </div>
      )}

      <style>{`
        .drop{width:100%;border:1.5px dashed var(--border-strong);border-radius:16px;padding:28px 20px;background:rgba(255,255,255,0.025);display:flex;flex-direction:column;align-items:center;gap:6px;transition:.2s;cursor:pointer}
        .drop:hover,.drop.on{border-color:var(--mint);background:rgba(0,236,151,0.05)}
        .dl-grid{display:grid;grid-template-columns:1.05fr 1fr;gap:18px}
        .thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;overflow:hidden;border-radius:12px}
        .thumb{aspect-ratio:1;border:1px solid var(--border-strong);border-radius:10px;overflow:hidden;position:relative;background:#0b111b}
        .thumb img,.thumb video{width:100%;height:100%;object-fit:cover;display:block}
        .thumb-play{position:absolute;top:5px;right:5px;width:22px;height:22px;border-radius:50%;background:rgba(7,10,15,0.85);color:var(--mint);display:grid;place-items:center;font-size:10px}
        .thumb.more{display:grid;place-items:center;font-weight:700;border-style:dashed;background:transparent;color:var(--ink-2)}
        .thumb-name{position:absolute;left:5px;bottom:4px;font-size:9px;font-weight:600;color:#f1f5f9;background:rgba(7,10,15,0.78);border-radius:4px;padding:1px 5px}
        .chk{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:11px;background:rgba(255,255,255,0.025);transition:.25s}
        .chk-st{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--ink-3);display:grid;place-items:center;font-size:11px;font-weight:800;flex:none;margin-top:2px}
        .chk.run .chk-st{border-color:var(--ink-3);border-top-color:var(--mint);animation:spin .7s linear infinite}
        .chk.pass{border-color:rgba(0,236,151,0.35);background:rgba(0,236,151,0.08)}
        .chk.pass .chk-st{background:var(--mint);border-color:var(--mint);color:#04120c}
        .chk.fail{border-color:rgba(251,113,133,0.4);background:rgba(251,113,133,0.09)}
        .chk.fail .chk-st{background:var(--red);border-color:var(--red);color:#fff}
        .chk.manual{border-color:rgba(245,158,11,0.4);background:rgba(245,158,11,0.09)}
        .chk.manual .chk-st{background:var(--amber);border-color:var(--amber);color:#140c02}
        .note{background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.35);border-radius:12px;padding:13px}
        @media (max-width:700px){.dl-grid{grid-template-columns:1fr}.thumbs{grid-template-columns:repeat(2,1fr)}}
      `}</style>
    </div>
  );
}
