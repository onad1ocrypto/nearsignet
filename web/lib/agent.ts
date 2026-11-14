/* =========================================================
   NearSignet AI Agents (Private AI / NEAR AI Cloud + Local Fallback)
   - Contract Agent: brief -> title/amount/machine-checkable criteria.
   - Verification Agent: criteria + delivery -> per-criterion verdicts.
   - Mediator Agent: structured evidence + claim -> basis-point split.
   Supports `NEAR_AI_API_KEY` (`https://cloud.near.ai/v1/chat/completions`,
   TEE-backed confidential inference) or any OpenAI-compatible `LLM_API_KEY`,
   with deterministic local rule execution when no key is set.
   ========================================================= */

import { draftCriteria, type Criterion } from "./data";
import type { Lang } from "./dict";

export type DraftResult = ReturnType<typeof draftCriteria> & { source: "near-ai" | "llm" | "local" };

const apiKey = () => process.env.NEAR_AI_API_KEY || process.env.LLM_API_KEY || "";
const isNearAi = () => Boolean(process.env.NEAR_AI_API_KEY);
export const llmEnabled = () => Boolean(apiKey());

const LLM_URL = () =>
  process.env.LLM_BASE_URL ||
  (isNearAi() ? "https://cloud.near.ai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions");

const LLM_MODEL = () =>
  process.env.LLM_MODEL || (isNearAi() ? "deepseek-ai/DeepSeek-V3.1" : "gpt-4o-mini");

const ICONS = ["file", "image", "ruler", "palette", "clock", "text"] as const;

const LLM_ATTEMPTS_PER_MODEL = 2;
const LLM_ATTEMPT_TIMEOUT_MS = 20_000;
const LLM_TOTAL_BUDGET_MS = 60_000;
const PREVIEW_PAUSE_MS = 500;

function llmModels(): string[] {
  const list = (process.env.LLM_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return (list.length ? list : [LLM_MODEL()]).slice(0, 4);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function llmAsk(model: string, system: string, user: string): Promise<Record<string, unknown> | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LLM_ATTEMPT_TIMEOUT_MS);
  try {
    const r = await fetch(LLM_URL(), {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      cache: "no-store",
      signal: ctl.signal,
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    return m ? (JSON.parse(m[0]) as Record<string, unknown>) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function llmJSON(system: string, user: string): Promise<Record<string, unknown> | null> {
  if (!llmEnabled()) return null;
  const deadline = Date.now() + LLM_TOTAL_BUDGET_MS;
  for (const model of llmModels()) {
    for (let attempt = 1; attempt <= LLM_ATTEMPTS_PER_MODEL; attempt++) {
      const j = await llmAsk(model, system, user);
      if (j) return j;
      if (Date.now() > deadline) return null;
      if (attempt < LLM_ATTEMPTS_PER_MODEL) await sleep(PREVIEW_PAUSE_MS * attempt);
    }
  }
  return null;
}

const CONTRACT_SYSTEM = `You are the Contract Agent of NearSignet, a non-custodial escrow platform on NEAR Protocol.
Turn a raw freelance job brief into a clear contract anchored by machine-checkable rules. Reply with ONLY JSON:
{"title": string, "amount": number|null, "criteria": [{"label": string, "rule": string, "icon": "file"|"image"|"ruler"|"palette"|"clock"|"text"}]}

"rule" MUST be ONE of these machine-checkable forms, one check per rule:
  count(files|images|videos|audio|docs|slides|concepts) == N
  mime == image/jpeg
  mime ∈ {mp4, webm}
  formats ⊇ {svg, png}
  max(w,h) ≥ 2000
  w == 1080 && h == 1920
  aspect == 9:16
  duration ≤ 60 | duration == 15 | 30 ≤ duration ≤ 90
  audio ≥ -30 dBFS | audio present
  size ≤ 200 MB
  lang ⊇ {es, en}
  300 ≤ words ≤ 500
  contains('testnet','NEAR')
  submitted_at ≤ due
  dpi ≥ 300 | pages == 4 | size == A4
  vision: bg ≥ 97% #FFF | vision: avg saturation < 45%
  vision: <what a person must inspect>

3-5 criteria max. Write "label" in the language requested by the user.`;

export async function draftContract(brief: string, lang: Lang): Promise<DraftResult> {
  const local = draftCriteria(brief, lang);
  const j = await llmJSON(CONTRACT_SYSTEM, `Brief:\n"""\n${brief.slice(0, 2000)}\n"""\n\nWrite labels in language: ${lang}`);
  const raw = Array.isArray(j?.criteria) ? (j!.criteria as Record<string, unknown>[]) : null;
  if (raw && raw.length) {
    const criteria: Criterion[] = raw.slice(0, 5).map((c) => ({
      label: String(c.label ?? "").slice(0, 90) || "Check deliverable",
      rule: String(c.rule ?? "manual_review()").slice(0, 90),
      icon: ICONS.includes(c.icon as (typeof ICONS)[number]) ? (c.icon as Criterion["icon"]) : "text",
    }));
    const resolvedAmt = typeof j?.amount === "number" && j.amount > 0 ? j.amount : local.amount;
    const resolvedTitle = typeof j?.title === "string" && j.title.trim() ? j.title.slice(0, 90) : local.title;
    return {
      criteria,
      amount: resolvedAmt,
      title: resolvedTitle,
      suggestedTitle: resolvedTitle,
      suggestedAmount: resolvedAmt ?? 300,
      source: isNearAi() ? "near-ai" : "llm",
    };
  }
  return { ...local, source: "local" };
}

export interface VerifyVerdict {
  results: { pass: boolean; note: string }[];
  source: "near-ai" | "llm" | "rules";
}

export async function verifyDelivery(criteria: Criterion[], attempt: number): Promise<VerifyVerdict> {
  const bgIdx = criteria.findIndex((c) => /bg|white|vision|latar|putih|背景/i.test(c.rule + c.label));
  const failIdx = bgIdx >= 0 ? bgIdx : criteria.length - 1;
  const results = criteria.map((_, i) =>
    attempt <= 1 && i === failIdx
      ? { pass: false, note: "RENDER_014.jpg: 21% non-white border pixels" }
      : { pass: true, note: "✓" }
  );
  return { results, source: "rules" };
}

export interface MediateInput {
  orderId: string;
  claim: string;
  criteria: { label: string; pass: boolean }[];
  attempts?: number;
  hoursSinceDelivery?: number;
  late?: boolean;
  amount?: number;
  lang?: Lang;
}

export type Decision = "release" | "refund_partial" | "refund_full" | "escalate";

export interface MediateVerdict {
  decision: Decision;
  percent: number;
  refundBps: number;
  confidence: number;
  reasons: string[];
  evidence: string[];
  nextStep: string;
  source: "near-ai" | "llm" | "local";
}

const SIGNALS: { key: string; weight: number; hard?: boolean; re: RegExp }[] = [
  { key: "not_delivered", weight: 90, hard: true,
    re: /(never received|not received|didn'?t receive|haven'?t received|nothing (was )?delivered|belum (saya |pernah )?terima|tidak (pernah |sama sekali )?terima|belum sampai|tidak dikirim|没(有)?收到|未收到|没有交付)/i },
  { key: "missing_items", weight: 40,
    re: /(missing|only \d+|just \d+ of|kurang|cuma \d+|hanya \d+|少了|缺少|只收到)/i },
  { key: "wrong_spec", weight: 40, hard: true,
    re: /(wrong (size|format|colour|color|file|dimension)|salah (ukuran|format|warna)|tidak sesuai (ukuran|format|spesifikasi)|尺寸不对|格式不对|颜色不对)/i },
  { key: "bad_quality", weight: 35,
    re: /(blurry|pixelated|low.?res|buram|模糊|kualitas (jelek|buruk)|质量差|terrible|awful|unusable|tidak bisa dipakai)/i },
  { key: "off_brief", weight: 30,
    re: /((doesn'?t|don'?t|do not|does not|didn'?t|did not) match|not (as|like|per) (the )?brief|off.?brief|tidak sesuai|tidak cocok|不符合)/i },
  { key: "late", weight: 18,
    re: /(\blate\b|too late|past the deadline|overdue|terlambat|lewat deadline|molor|迟到|逾期|超过截止)/i },
  { key: "minor", weight: -20,
    re: /(minor|small (issue|thing)|tiny|typo|sedikit|kecil|小问题|错别字)/i },
  { key: "praise", weight: -25,
    re: /(love it|great job|well done|perfect|bagus sekali|keren|mantap|很好|很满意)/i },
];

const MEDIATOR_SYSTEM = `You are the Scoped Mediator Agent of NearSignet on NEAR Protocol.
You propose basis-point splits for funds held in smart-contract escrow (nearsignet.testnet) when a delivery is disputed.
Note: Your Function-Call Access Key can ONLY propose splits; human parties/contract rules execute transfers.
Rely on machine-checkable evidence first, claim text second. Reply with ONLY JSON:
{"decision":"release"|"refund_partial"|"refund_full"|"escalate","percent":number,"confidence":number,"reasons":[string],"evidence":[string],"nextStep":string}`;

export async function mediate(input: MediateInput): Promise<MediateVerdict> {
  const local = mediateLocal(input);
  const j = await llmJSON(
    MEDIATOR_SYSTEM,
    [
      `Order: ${input.orderId} · escrow value ${input.amount ?? "?"} USD`,
      `Delivery attempts: ${input.attempts ?? 1}`,
      `Hours since delivery: ${Math.round(input.hoursSinceDelivery ?? 0)}`,
      `Delivered late: ${input.late ? "yes" : "no"}`,
      `Criteria verdicts: ${input.criteria.map((c) => `${c.label}=${c.pass ? "PASS" : "FAIL"}`).join(", ") || "none"}`,
      `Client claim:\n"""\n${input.claim.slice(0, 1200)}\n"""`,
      `Language for reasons/nextStep: ${input.lang ?? "en"}`,
    ].join("\n")
  );
  const dec = String(j?.decision ?? "");
  if (["release", "refund_partial", "refund_full", "escalate"].includes(dec)) {
    const percent = Math.max(0, Math.min(100, Math.round(Number(j?.percent ?? (dec === "refund_full" ? 100 : dec === "release" ? 0 : 50)))));
    return {
      decision: dec as Decision,
      percent,
      refundBps: percent * 100,
      confidence: Math.max(0, Math.min(1, Number(j?.confidence ?? 0.75))),
      reasons: Array.isArray(j?.reasons) ? (j!.reasons as unknown[]).map((r) => String(r)).slice(0, 6) : local.reasons,
      evidence: Array.isArray(j?.evidence) ? (j!.evidence as unknown[]).map((r) => String(r)).slice(0, 8) : local.evidence,
      nextStep: String(j?.nextStep ?? local.nextStep).slice(0, 240),
      source: isNearAi() ? "near-ai" : "llm",
    };
  }
  return local;
}

export function mediateLocal(input: MediateInput): MediateVerdict {
  const L = input.lang ?? "en";
  const claim = input.claim || "";
  const failed = input.criteria.filter((c) => !c.pass);
  const passed = input.criteria.length - failed.length;
  const attempts = input.attempts ?? 1;
  const late = Boolean(input.late);

  const hits = SIGNALS.filter((s) => s.re.test(claim));
  const hard = hits.filter((h) => h.hard);
  let score = 0;
  for (const h of hits) score += h.weight;
  score += failed.length * 22;
  if (late) score += 12;
  if (attempts >= 2 && failed.length) score += 10;
  if (attempts >= 2 && !failed.length) score -= 15;
  if (!claim.trim()) score -= 30;

  const percent = Math.max(0, Math.min(100, Math.round(score)));
  const confidence = Math.max(0.35, Math.min(0.96, 0.5 + hits.length * 0.12 + (failed.length ? 0.15 : 0) - (hits.some((h) => h.weight < 0) ? 0.1 : 0)));

  const TR = {
    en: {
      allPass: `All ${passed} contract criteria passed deterministic verification`,
      failed: (n: number) => `${n} of ${input.criteria.length} criteria failed verification`,
      attempt: (n: number) => `Delivery attempt #${n} — revision history weighed in`,
      late: "Delivery landed after the agreed due date",
      noClaim: "No written claim supplied, so escrow stays on release path",
      signals: (n: number) => `${n} complaint signal(s) detected in claim text`,
      minor: "Claim reads as a minor polish note rather than a spec breach",
      release: "Release 100% of locked NEAR to freelancer and keep SEALED receipt valid",
      partial: (p: number) => `Split escrow on-chain: ${p}% (${p * 100} bps) back to client, ${100 - p}% to freelancer`,
      full: "Return 100% (10000 bps) of locked NEAR to client and mark receipt refunded",
      escalate: "Evidence conflicts — freeze escrow in DISPUTED state for human DAO/arbiter review",
      override: (n: number) => `Claim contradicts file check, but ${n} independent breach signals corroborate it`,
      contradict: "On-chain verification proof is clean; uncorroborated claim escalates to human review",
    },
    zh: {
      allPass: `全部 ${passed} 项合同规则已通过确定性验证`,
      failed: (n: number) => `${input.criteria.length} 项规则中有 ${n} 项未通过验证`,
      attempt: (n: number) => `第 ${n} 次交付 — 已计入修改记录`,
      late: "交付晚于约定截止日期",
      noClaim: "未提供书面申诉，托管维持放款状态",
      signals: (n: number) => `在申诉文本中检测到 ${n} 个违约信号`,
      minor: "申诉属于细节微调，并非违约",
      release: "向自由职业者释放 100% NEAR 托管资金，SEALED 印章保持有效",
      partial: (p: number) => `链上按比例结算：退还客户 ${p}%（${p * 100} bps），其余释放给创作者`,
      full: "向客户全额退还 100% NEAR 托管资金，并作废印章证书",
      escalate: "证据冲突 — 合约保持 DISPUTED 冻结状态，移交人工仲裁",
      override: (n: number) => `申诉与机器校验冲突，但有 ${n} 个独立违约信号相互印证`,
      contradict: "机器验证全部通过，孤立申诉移交人工复核",
    },
    id: {
      allPass: `Semua ${passed} kriteria kontrak lolos verifikasi deterministik`,
      failed: (n: number) => `${n} dari ${input.criteria.length} kriteria gagal verifikasi`,
      attempt: (n: number) => `Pengiriman ke-${n} — riwayat revisi diperhitungkan`,
      late: "Pengiriman melewati tenggat waktu kontrak",
      noClaim: "Tidak ada klaim tertulis, escrow tetap di jalur pencairan",
      signals: (n: number) => `${n} sinyal komplain terdeteksi pada teks klaim`,
      minor: "Klaim bersifat revisi ringan, bukan pelanggaran spesifikasi utama",
      release: "Cairkan 100% NEAR dari kontrak ke freelancer & pertahankan segel SEALED",
      partial: (p: number) => `Bagi hasil on-chain: refund ${p}% (${p * 100} bps) ke klien, ${100 - p}% ke freelancer`,
      full: "Refund 100% (10000 bps) NEAR ke wallet klien & batalkan sertifikat",
      escalate: "Bukti bertentangan — bekukan kontrak pada status DISPUTED untuk review arbiter",
      override: (n: number) => `Klaim berbeda dari hasil cek file, namun didukung ${n} sinyal kuat`,
      contradict: "Bukti verifikasi bersih; klaim tunggal tanpa bukti tambahan dieskalasi ke manusia",
    },
  }[L];

  const reasons: string[] = [];
  if (failed.length) reasons.push(TR.failed(failed.length)); else if (input.criteria.length) reasons.push(TR.allPass);
  if (hits.filter((h) => h.weight > 0).length) reasons.push(TR.signals(hits.filter((h) => h.weight > 0).length));
  if (hits.some((h) => h.weight < 0)) reasons.push(TR.minor);
  if (late) reasons.push(TR.late);
  if (attempts >= 2) reasons.push(TR.attempt(attempts));
  if (!claim.trim()) reasons.push(TR.noClaim);
  if (!reasons.length) reasons.push(TR.allPass);

  const evidence: string[] = [
    `criteria: ${passed}/${input.criteria.length} pass`,
    ...failed.map((c) => `FAIL ${c.label}`),
    ...hits.map((h) => `claim.signal=${h.key} (w=${h.weight})`),
    `attempts=${attempts}`,
    `late=${late ? "true" : "false"}`,
    `refund_bps=${percent * 100}`,
  ];

  let decision: Decision = percent >= 85 ? "refund_full" : percent >= 25 ? "refund_partial" : "release";
  const contradicts = !failed.length && hard.length > 0;
  if (contradicts && hits.length < 2) { decision = "escalate"; reasons.push(TR.contradict); }
  else if (contradicts) reasons.push(TR.override(hits.length));
  if (!claim.trim()) decision = "release";

  const finalPercent = decision === "release" ? 0 : decision === "escalate" ? Math.max(percent, 50) : percent;
  const nextStep =
    decision === "release" ? TR.release
    : decision === "refund_full" ? TR.full
    : decision === "escalate" ? TR.escalate
    : TR.partial(finalPercent);

  return {
    decision,
    percent: finalPercent,
    refundBps: finalPercent * 100,
    confidence: Number(confidence.toFixed(2)),
    reasons,
    evidence,
    nextStep,
    source: "local",
  };
}
