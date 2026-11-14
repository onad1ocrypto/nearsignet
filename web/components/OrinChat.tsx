"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { Orin } from "./Orin";

type Turn = { role: "user" | "orin"; text: string; source?: string; model?: string };

const PANEL_W = 384;
const PANEL_H = 560;

const COPY = {
  en: {
    title: "Orin",
    role: "Cyber-Inspector · NearSignet",
    open: "Ask Orin",
    close: "Close",
    placeholder: "Ask about an escrow or a failed check…",
    send: "Inspect",
    listening: "Listening…",
    thinking: "Inspecting evidence…",
    greeting:
      "Orin online. I inspect NearSignet escrows and the scoped verifier key. Ask me about an order, a failed predicate, or the 72-hour release shield.",
    error: "Signal lost. Try again in a moment.",
    limited: "Too many requests — give me a minute.",
    footnote: "Grounded in nearsignet-protocol.testnet",
  },
  id: {
    title: "Orin",
    role: "Cyber-Inspector · NearSignet",
    open: "Tanya Orin",
    close: "Tutup",
    placeholder: "Tanya soal escrow atau cek yang gagal…",
    send: "Periksa",
    listening: "Mendengarkan…",
    thinking: "Memeriksa bukti…",
    greeting:
      "Orin aktif. Saya memeriksa escrow NearSignet dan scoped verifier key. Tanya soal order, predikat yang gagal, atau proteksi rilis 72 jam.",
    error: "Sinyal terputus. Coba lagi sebentar.",
    limited: "Terlalu banyak permintaan — tunggu satu menit.",
    footnote: "Berbasis data nearsignet-protocol.testnet",
  },
  zh: {
    title: "Orin",
    role: "Cyber-Inspector · NearSignet",
    open: "询问 Orin",
    close: "关闭",
    placeholder: "询问托管或未通过的检查…",
    send: "检查",
    listening: "正在聆听…",
    thinking: "正在核验证据…",
    greeting: "Orin 已上线。我负责核验 NearSignet 托管与作用域验证密钥。可以询问订单、未通过的规则或 72 小时放款保护。",
    error: "信号中断，请稍后重试。",
    limited: "请求过多，请等待一分钟。",
    footnote: "数据来源 nearsignet-protocol.testnet",
  },
} as const;

/** Detect an escrow id from the current route, e.g. /orders/NSG-2041 */
function orderIdFromPath(path: string): string | undefined {
  const m = path.match(/\/orders\/(NSG-\d{3,4})/i);
  return m ? m[1].toUpperCase() : undefined;
}

export function OrinChat() {
  const { lang } = useI18n();
  const pathname = usePathname() ?? "/";
  const c = COPY[lang] ?? COPY.en;

  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [chips, setChips] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const orderId = useMemo(() => orderIdFromPath(pathname), [pathname]);

  // Subtle one-time attention pulse so judges notice the widget exists.
  useEffect(() => {
    const t = setTimeout(() => setNudge(true), 2600);
    const t2 = setTimeout(() => setNudge(false), 12_000);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, busy]);

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? draft).trim();
      if (!text || busy) return;
      setDraft("");
      setError(null);
      setChips([]);
      const history = turns.map((t) => ({ role: t.role, text: t.text }));
      setTurns((prev) => [...prev, { role: "user", text }]);
      setBusy(true);
      try {
        const r = await fetch("/api/agent/orin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history, orderId, pathname, lang }),
        });
        if (r.status === 429) {
          setError(c.limited);
          setBusy(false);
          return;
        }
        const j = (await r.json()) as { text?: string; chips?: string[]; source?: string; model?: string; error?: string };
        if (!r.ok || !j.text) {
          setError(c.error);
          setBusy(false);
          return;
        }
        setTurns((prev) => [...prev, { role: "orin", text: j.text!, source: j.source, model: j.model }]);
        setChips(Array.isArray(j.chips) ? j.chips.slice(0, 3) : []);
      } catch {
        setError(c.error);
      } finally {
        setBusy(false);
      }
    },
    [busy, c.error, c.limited, draft, lang, orderId, pathname, turns]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          type="button"
          className={`orin-launch ${nudge ? "nudge" : ""}`}
          onClick={() => setOpen(true)}
          aria-label={c.open}
          title={c.open}
        >
          <Orin pose="idle" size={54} />
          <span className="orin-launch-label mono">{c.open}</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <section className="orin-panel" role="dialog" aria-label="Orin AI chat" aria-modal="false">
          <header className="orin-head">
            <div className="orin-id">
              <Orin pose={busy ? "scan" : "idle"} size={54} />
              <div className="col" style={{ gap: 1 }}>
                <strong style={{ fontFamily: "var(--font-display)", fontSize: 15, letterSpacing: "-.01em" }}>{c.title}</strong>
                <span className="mono tiny" style={{ color: busy ? "#00EC97" : "rgba(253,224,71,0.86)", letterSpacing: ".1em" }}>
                  {busy ? c.thinking : c.role}
                </span>
              </div>
            </div>
            <button type="button" className="orin-x" onClick={() => setOpen(false)} aria-label={c.close}>
              ✕
            </button>
          </header>

          {orderId && (
            <div className="orin-ctx mono tiny">
              <span className="dot" /> CONTEXT · {orderId}
            </div>
          )}

          <div className="orin-body" ref={scrollRef}>
            <Bubble role="orin" text={c.greeting} />
            {turns.map((t, i) => (
              <Bubble key={i} role={t.role} text={t.text} source={t.source} />
            ))}
            {busy && (
              <div className="orin-row orin-row-them">
                <div className="orin-avatar"><Orin pose="scan" size={54} /></div>
                <div className="orin-bubble them">
                  <span className="orin-listen" aria-hidden>
                    <i /><i /><i /><i />
                  </span>
                  <span className="mono tiny" style={{ color: "rgba(244,244,245,0.62)" }}>{c.thinking}</span>
                </div>
              </div>
            )}
            {error && <div className="orin-err mono tiny">{error}</div>}
            {!busy && chips.length > 0 && (
              <div className="orin-chips">
                {chips.map((q) => (
                  <button key={q} type="button" className="orin-chip" onClick={() => void send(q)}>
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          <footer className="orin-foot">
            <div className="orin-input">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={c.placeholder}
                rows={1}
                maxLength={800}
              />
              <button type="button" className="orin-send" onClick={() => void send()} disabled={busy || !draft.trim()}>
                {c.send}
              </button>
            </div>
            <span className="mono tiny orin-note">{c.footnote}</span>
          </footer>
        </section>
      )}

      <style>{`
        .orin-launch{
          position:fixed;right:clamp(14px,2.2vw,26px);bottom:clamp(14px,2.2vw,24px);
          z-index:1200;display:flex;align-items:center;gap:10px;
          padding:8px 16px 8px 8px;border-radius:999px;cursor:pointer;
          background:linear-gradient(135deg, rgba(12,17,24,0.94), rgba(7,10,15,0.96));
          border:1px solid rgba(253,224,71,0.42);
          box-shadow:0 14px 40px rgba(0,0,0,0.62), 0 0 0 1px rgba(0,236,151,0.1) inset;
          backdrop-filter:blur(14px);color:#FAF8F5;
          transition:transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s, border-color .18s;
        }
        .orin-launch:hover{transform:translateY(-2px);border-color:rgba(0,236,151,0.6);box-shadow:0 18px 48px rgba(0,0,0,0.7), 0 0 22px rgba(0,236,151,0.24)}
        .orin-launch.nudge{animation:orinPulse 2.4s ease-in-out 0s 3}
        .orin-launch-label{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(253,224,71,0.92)}
        @keyframes orinPulse{
          0%,100%{box-shadow:0 14px 40px rgba(0,0,0,0.62), 0 0 0 0 rgba(0,236,151,0.0)}
          50%{box-shadow:0 14px 40px rgba(0,0,0,0.62), 0 0 0 8px rgba(0,236,151,0.16)}
        }
        .orin-panel{
          position:fixed;right:clamp(14px,2.2vw,26px);bottom:clamp(14px,2.2vw,24px);
          z-index:1201;display:flex;flex-direction:column;
          width:min(${PANEL_W}px, calc(100vw - 24px));
          max-height:min(${PANEL_H}px, calc(100vh - 32px));
          border-radius:20px;overflow:hidden;
          background:linear-gradient(180deg, #0C1118 0%, #080B11 100%);
          border:1px solid rgba(253,224,71,0.28);
          box-shadow:0 28px 80px rgba(0,0,0,0.72), 0 0 0 1px rgba(0,236,151,0.08) inset;
          backdrop-filter:blur(18px);
          animation:orinIn .26s cubic-bezier(.22,1,.36,1);
        }
        @keyframes orinIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
        .orin-head{
          display:flex;align-items:center;justify-content:space-between;gap:10px;
          padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.07);
          background:linear-gradient(180deg, rgba(253,224,71,0.07), transparent);
        }
        .orin-id{display:flex;align-items:center;gap:9px;min-width:0;flex:1;overflow:hidden}
        .orin-id .col{min-width:0}
        .orin-id strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.25}
        .orin-id .mono{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:9.5px;line-height:1.35}
        .orin-x{
          width:28px;height:28px;border-radius:9px;flex:none;cursor:pointer;
          background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
          color:rgba(250,248,245,0.75);font-size:12px;line-height:1;
        }
        .orin-x:hover{background:rgba(255,255,255,0.1);color:#FAF8F5}
        .orin-ctx{
          display:flex;align-items:center;gap:6px;padding:5px 12px;
          color:rgba(0,236,151,0.9);letter-spacing:.14em;
          background:rgba(0,236,151,0.06);border-bottom:1px solid rgba(0,236,151,0.14);
        }
        .orin-ctx .dot{width:6px;height:6px;border-radius:50%;background:#00EC97;box-shadow:0 0 8px #00EC97}
        .orin-body{
          flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;
          padding:12px;display:flex;flex-direction:column;gap:10px;
          scrollbar-width:thin;
        }
        .orin-row{display:flex;gap:8px;align-items:flex-start}
        .orin-row-them{justify-content:flex-start}
        .orin-row-me{justify-content:flex-end}
        .orin-avatar{flex:none;margin-top:2px}
        .orin-bubble{
          max-width:84%;min-width:0;padding:9px 12px;border-radius:14px;
          font-size:13px;line-height:1.55;white-space:pre-wrap;word-break:break-word;
        }
        .orin-bubble.them{
          background:rgba(255,255,255,0.055);border:1px solid rgba(255,255,255,0.09);
          border-top-left-radius:4px;color:#EDEDEF;
        }
        .orin-bubble.me{
          background:linear-gradient(135deg, rgba(0,236,151,0.17), rgba(0,236,151,0.09));
          border:1px solid rgba(0,236,151,0.34);border-top-right-radius:4px;color:#EAFBF3;
        }
        .orin-src{
          display:block;margin-top:5px;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;
          color:rgba(253,224,71,0.72);
        }
        .orin-listen{display:inline-flex;align-items:flex-end;gap:3px;margin-right:8px;height:14px;vertical-align:-2px}
        .orin-listen i{width:3px;border-radius:2px;background:#00EC97;animation:orinWave 1s ease-in-out infinite}
        .orin-listen i:nth-child(1){height:6px;animation-delay:0s}
        .orin-listen i:nth-child(2){height:13px;animation-delay:.15s}
        .orin-listen i:nth-child(3){height:9px;animation-delay:.3s}
        .orin-listen i:nth-child(4){height:4px;animation-delay:.45s}
        @keyframes orinWave{0%,100%{transform:scaleY(.45);opacity:.6}50%{transform:scaleY(1);opacity:1}}
        .orin-err{color:#FCA5A5;padding:2px 4px}
        .orin-chips{display:flex;flex-direction:column;gap:6px;margin-top:2px}
        .orin-chip{
          text-align:left;padding:7px 10px;border-radius:10px;cursor:pointer;
          background:rgba(253,224,71,0.06);border:1px solid rgba(253,224,71,0.24);
          color:rgba(253,224,71,0.92);font-size:11.5px;line-height:1.35;
          transition:background .15s,border-color .15s;
        }
        .orin-chip:hover{background:rgba(253,224,71,0.13);border-color:rgba(253,224,71,0.45)}
        .orin-foot{padding:10px 12px 8px;border-top:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;gap:6px}
        .orin-input{display:flex;gap:8px;align-items:flex-end}
        .orin-input textarea{
          flex:1;height:38px;min-height:38px;max-height:104px;resize:none;overflow-y:auto;
          padding:9px 11px;border-radius:11px;font-size:13px;line-height:1.4;
          background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.11);
          color:#FAF8F5;font-family:inherit;
        }
        .orin-input textarea:focus{outline:none;border-color:rgba(0,236,151,0.55);box-shadow:0 0 0 3px rgba(0,236,151,0.12)}
        .orin-input textarea::placeholder{color:rgba(250,248,245,0.38)}
        .orin-send{
          flex:none;padding:9px 14px;border-radius:11px;cursor:pointer;border:none;
          background:linear-gradient(135deg,#00EC97,#0BBf7d);color:#04120C;
          font-size:12px;font-weight:700;letter-spacing:.02em;
        }
        .orin-send:disabled{opacity:.42;cursor:not-allowed}
        .orin-note{color:rgba(250,248,245,0.36);letter-spacing:.08em}
        @media (max-width:560px){
          .orin-launch{padding:7px}
          .orin-launch-label{display:none}
          .orin-panel{width:calc(100vw - 20px);max-height:calc(100vh - 92px)}
        }
      `}</style>
    </>
  );
}

function Bubble({ role, text, source }: { role: "user" | "orin"; text: string; source?: string }) {
  if (role === "user") {
    return (
      <div className="orin-row orin-row-me">
        <div className="orin-bubble me">{text}</div>
      </div>
    );
  }
  return (
    <div className="orin-row orin-row-them">
      <div className="orin-avatar">
        <Orin pose="idle" size={54} />
      </div>
      <div className="orin-bubble them">
        {text}
        {source === "near-ai" && <span className="orin-src mono">NEAR AI · TEE inference</span>}
      </div>
    </div>
  );
}
