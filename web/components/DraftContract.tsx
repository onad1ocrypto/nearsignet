"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { draftCriteria, type Criterion } from "@/lib/data";
import { Icon } from "./Icon";
import { Orin } from "./Orin";

const ICON_FOR: Record<Criterion["icon"], string> = {
  file: "file",
  image: "image",
  ruler: "ruler",
  palette: "palette",
  clock: "clock",
  text: "text",
};

export function BriefDrafter({
  brief, setBrief, onDrafted, example, placeholder,
}: {
  brief: string;
  setBrief: (s: string) => void;
  onDrafted: (r: ReturnType<typeof draftCriteria>) => void;
  example: string;
  placeholder: string;
}) {
  const { t, lang } = useI18n();
  const [phase, setPhase] = useState<"idle" | "thinking" | "done">("idle");
  const [result, setResult] = useState<ReturnType<typeof draftCriteria> | null>(null);

  useEffect(() => {
    if (phase !== "thinking") return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      const started = Date.now();
      let r: (ReturnType<typeof draftCriteria> & { source?: string }) | null = null;
      try {
        const res = await fetch("/api/agent/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brief, lang }),
        });
        if (res.ok) r = await res.json();
      } catch {}
      if (!r) r = { ...draftCriteria(brief, lang), source: "local" };
      const wait = Math.max(300, 1100 - (Date.now() - started));
      timer = setTimeout(() => {
        if (!live) return;
        setResult(r);
        setPhase("done");
        onDrafted(r);
      }, wait);
    })();
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="field">
        <div className="row between">
          <label htmlFor="brief">{t("new.briefLabel")}</label>
          <button type="button" className="btn sm ghost" style={{ color: "var(--mint)" }} onClick={() => { setBrief(example); setPhase("idle"); }}>
            <Icon name="sparkles" size={14} /> {t("new.useExample")}
          </button>
        </div>
        <textarea
          id="brief"
          className="textarea"
          value={brief}
          placeholder={placeholder}
          onChange={(e) => { setBrief(e.target.value); if (phase === "done") setPhase("idle"); }}
        />
      </div>

      <div className="row wrap" style={{ gap: 12 }}>
        <button
          type="button"
          className="btn mint"
          disabled={brief.trim().length < 15 || phase === "thinking"}
          onClick={() => setPhase("thinking")}
        >
          <Icon name="sparkles" size={16} /> {phase === "done" ? t("new.redraft") : t("new.draftAI")}
        </button>
        <span className="tiny muted">{t("new.aiHint")}</span>
      </div>

      {phase === "thinking" && (
        <div className="card pop-in row" style={{ gap: 16, padding: 16, borderColor: "var(--border-glow)", background: "rgba(0, 236, 151, 0.06)" }}>
          <Orin size={68} pose="scan" />
          <div>
            <b style={{ color: "var(--mint)" }}>{t("new.thinking")}</b>
            <div className="typing-dots" style={{ marginTop: 6 }}><span /><span /><span /></div>
          </div>
        </div>
      )}

      {phase === "done" && result && <CriteriaList criteria={result.criteria} />}
    </div>
  );
}

export function CriteriaList({ criteria, onRemove }: { criteria: Criterion[]; onRemove?: (i: number) => void }) {
  const { t } = useI18n();
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8 }}>
        <b>{t("new.criteria")}</b>
        <span className="badge" style={{ borderColor: "var(--border-glow)", background: "var(--mint-l)", color: "var(--mint)" }}>
          <Icon name="bot" size={13} /> {t("new.aiVerified")}
        </span>
      </div>
      <div className="crit-grid stagger">
        {criteria.map((c, i) => (
          <div key={c.label + i} className="row crit">
            <span className="crit-ic"><Icon name={ICON_FOR[c.icon]} size={15} /></span>
            <div className="grow">
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.label}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--mint)", opacity: 0.9 }}>{c.rule}</div>
            </div>
            {onRemove && (
              <button type="button" aria-label="remove" className="btn ghost sm" style={{ padding: 4 }} onClick={() => onRemove(i)}>
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      <style>{`
        .crit-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:10px}
        .crit{gap:10px;padding:11px 13px;border:1px solid var(--border-strong);border-radius:12px;background:rgba(255,255,255,0.03)}
        .crit-ic{width:32px;height:32px;border-radius:8px;border:1px solid rgba(0,236,151,0.32);background:rgba(0,236,151,0.1);color:var(--mint);display:grid;place-items:center;flex:none}
      `}</style>
    </div>
  );
}
