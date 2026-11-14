/* =========================================================
   Orin Chat — Grounded Cyber-Inspector persona for NearSignet.
   Every answer is anchored to verifiable facts: the live contract id,
   the scoped Function-Call access key model, and the escrow orders the
   platform actually tracks. No free-form speculation.
   ========================================================= */

import { ORDERS, getOrder, ME, type Order } from "./data";
import type { Lang } from "./dict";
import { NEAR_CONTRACT_ID, NEAR_VERIFIER_ID, LIVE_TESTNET_ARTIFACTS } from "./near";

export interface OrinTurn {
  role: "user" | "orin";
  text: string;
}

export interface OrinContext {
  orderId?: string;
  pathname?: string;
  lang?: Lang;
}

export interface OrinReply {
  text: string;
  chips: string[];
  source: "near-ai" | "local";
  model?: string;
  /** A grounded one-liner the UI can render as an on-chain evidence tag. */
  evidence?: string;
}

const F = LIVE_TESTNET_ARTIFACTS;

/* ---------- Grounding fact sheet (single source of truth) ---------- */

export function factSheet(): string {
  const lines: string[] = [
    `Network: NEAR Testnet. Escrow contract: ${NEAR_CONTRACT_ID}.`,
    `Autonomous verifier / relayer account: ${NEAR_VERIFIER_ID}.`,
    `Verifier holds 0 FullAccess keys and exactly 1 scoped Function-Call key (${F.scopedAgentPublicKey}) limited to ${NEAR_CONTRACT_ID} and the methods [attest_verification, resolve_dispute].`,
    `Freelancer demo account: ${F.freelancerAccount}. Client demo account: ${F.clientAccount}.`,
    `Escrow lifecycle: brief -> machine-checkable criteria -> create_and_fund (NEAR locked) -> submit_delivery -> Orin attest_verification -> SEALED receipt on-chain, or 72h timeout auto-release.`,
    `Orin verification checks real files: pixel dimensions, MIME type, file count, background whiteness (vision), duration, audio dBFS, word counts.`,
    `Disputes: Orin proposes a basis-point split (release / refund_partial / refund_full / escalate); the scoped key can only attest and propose, never transfer funds by itself.`,
    `Reference rate used in the UI: 1 NEAR = $5.00 USD.`,
    `Signed-in user: ${ME.name} (${ME.handle}) on ${ME.nearAccount}, based in ${ME.city}, ${ME.country}.`,
    ``,
    `Live escrows tracked by the platform (${ORDERS.length}):`,
  ];
  for (const o of ORDERS) {
    lines.push(
      `- ${o.id} · "${o.title}" · client ${o.client.name} (${o.client.nearAccount}) · $${o.amount} (${o.nearAmount ?? "?"} NEAR) · status ${o.status} · due ${o.due} · criteria: ${o.criteria
        .map((c) => `${c.label} [${c.rule}]`)
        .join("; ")}`
    );
  }
  return lines.join("\n");
}

export function quickChips(lang: Lang): string[] {
  const en = [
    "How does the scoped key work?",
    "Why was NSG-2033 released?",
    "What happens if the client ignores a delivery?",
    "Which check failed on NSG-2041?",
  ];
  const id = [
    "Bagaimana cara kerja scoped key?",
    "Kenapa NSG-2033 dirilis?",
    "Apa yang terjadi kalau klien diam saja?",
    "Pengecekan mana yang gagal di NSG-2041?",
  ];
  const zh = [
    "作用域密钥如何工作？",
    "NSG-2033 为什么被放款？",
    "如果客户不回应会怎样？",
    "NSG-2041 哪一项检查未通过？",
  ];
  return lang === "id" ? id : lang === "zh" ? zh : en;
}

/* ---------- Deterministic grounded answers (fallback + no-credential mode) ---------- */

const RULES: { key: string; re: RegExp; en: string; id: string; zh: string }[] = [
  {
    key: "scoped_key",
    re: /(scoped|function.?call key|access key|fullaccess|kunci|权限|密钥)/i,
    en:
      `The verifier account ${NEAR_VERIFIER_ID} holds 0 FullAccess keys. Its only key is a scoped Function-Call key (${F.scopedAgentPublicKey}) that the NEAR runtime itself restricts to contract ${NEAR_CONTRACT_ID} and exactly two methods: attest_verification and resolve_dispute.\n\n` +
      `That means Orin can approve a delivery or attest a dispute outcome, but it can never move funds, deploy code, delete keys, or touch any other contract. Escrow release is executed by the escrow contract's own logic on ${NEAR_CONTRACT_ID} — the AI only submits a signed verdict. Blast radius of a leaked agent key: two method calls on one escrow contract.`,
    id:
      `Akun verifier ${NEAR_VERIFIER_ID} memiliki 0 key FullAccess. Satu-satunya key adalah Function-Call key scoped (${F.scopedAgentPublicKey}) yang dibatasi oleh runtime NEAR ke contract ${NEAR_CONTRACT_ID} dan hanya dua method: attest_verification dan resolve_dispute.\n\n` +
      `Artinya Orin bisa menyetujui delivery atau mengesahkan hasil sengketa, tapi tidak pernah bisa memindahkan dana, deploy kode, menghapus key, atau menyentuh contract lain. Pelepasan escrow dijalankan oleh logika contract escrow di ${NEAR_CONTRACT_ID} — AI hanya mengirim verdict yang ditandatangani. Kalau key agen bocor, dampaknya cuma dua pemanggilan method di satu contract escrow.`,
    zh:
      `验证者账户 ${NEAR_VERIFIER_ID} 拥有 0 个 FullAccess 密钥。唯一的密钥是作用域 Function-Call 密钥（${F.scopedAgentPublicKey}），被 NEAR 运行时限制在合约 ${NEAR_CONTRACT_ID} 且仅限两个方法：attest_verification 与 resolve_dispute。\n\nAI 只能提交裁决，永远无法转移资金、部署代码或删除密钥。`,
  },
  {
    key: "timeout",
    re: /(client (never|doesn'?t|ignores|silent)|no response|ignore|timeout|72|auto.?release|kalau klien|diam|auto.?rilis|超时|客户不)/i,
    en:
      `Every escrow carries a 72h block-timestamp timeout shield. If the client neither approves nor disputes within 72 hours of the delivery timestamp, anyone can call the contract to auto-release the locked NEAR to the freelancer. The client cannot stall payment by going silent — that is the whole point of "non-custodial".`,
    id:
      `Setiap escrow punya timeout shield berbasis block-timestamp 72 jam. Kalau klien tidak menyetujui dan tidak menyanggah dalam 72 jam setelah timestamp delivery, siapa pun bisa memanggil contract untuk auto-release NEAR ke freelancer. Klien tidak bisa menahan pembayaran dengan diam — itu inti dari "non-custodial".`,
    zh:
      `每笔托管都有 72 小时区块时间戳超时保护。若客户在交付后 72 小时内既不批准也不申诉，任何人都可调用合约自动放款给自由职业者。`,
  },
  {
    key: "review_window",
    re: /(review window|revision|revisi|ditolak|reject|gagal|fail)/i,
    en:
      `Failed verification returns the escrow to REVISION with the exact failing predicate quoted — for example NSG-2041 fails on "vision: bg ≥ 97% #FFF" because RENDER_014.jpg still has 21% non-white border pixels. The freelancer fixes that one file, resubmits, and Orin re-runs the same deterministic checks.`,
    id:
      `Verifikasi yang gagal mengembalikan escrow ke REVISION dengan menyebut predikat yang gagal — contohnya NSG-2041 gagal di "vision: bg ≥ 97% #FFF" karena RENDER_014.jpg masih punya 21% piksel border non-putih. Freelancer memperbaiki file itu, submit ulang, dan Orin menjalankan ulang pengecekan deterministik yang sama.`,
    zh:
      `验证失败会把托管退回 REVISION 状态，并明确指出未通过的规则。自由职业者修正后重新提交，Orin 会重跑相同的确定性检查。`,
  },
  {
    key: "price",
    re: /(\bfee\b|protocol fee|biaya|komisi|pricing|成本|费用)/i,
    en:
      `Protocol fee is 2% of the locked amount: NSG-2033 locked 18.4 NEAR, settled 18.032 NEAR to ${F.freelancerAccount} and 0.368 NEAR to the protocol. No subscription, no custody — funds sit in ${NEAR_CONTRACT_ID}, not in a company wallet.`,
    id:
      `Fee protokol 2% dari nilai yang dikunci: NSG-2033 mengunci 18.4 NEAR, lalu 18.032 NEAR cair ke ${F.freelancerAccount} dan 0.368 NEAR ke protokol. Tanpa langganan, tanpa kustodi — dana berada di ${NEAR_CONTRACT_ID}, bukan di wallet perusahaan.`,
    zh:
      `协议费为锁定金额的 2%。资金始终存放在合约 ${NEAR_CONTRACT_ID} 中，由平台托管钱包以外的智能合约逻辑控制。`,
  },
  {
    key: "how",
    re: /(how (do|does|to)|cara|gimana|bagaimana|what is nearsignet|apa itu|怎么|如何)/i,
    en:
      `NearSignet turns a plain-language brief into machine-checkable rules, locks NEAR in ${NEAR_CONTRACT_ID}, lets you deliver files, has Orin verify the actual pixels/format/duration, and stamps a SEALED receipt on-chain. Steps: Create escrow → Lock NEAR → Deliver → Orin scan → SEALED.`,
    id:
      `NearSignet mengubah brief bahasa sehari-hari menjadi aturan yang bisa dicek mesin, mengunci NEAR di ${NEAR_CONTRACT_ID}, menerima file deliverable, lalu Orin memverifikasi piksel/format/durasi yang sebenarnya, dan menerbitkan receipt SEALED on-chain. Alur: Create escrow → Lock NEAR → Deliver → Orin scan → SEALED.`,
    zh:
      `NearSignet 把自然语言需求转成可机器校验的规则，在 ${NEAR_CONTRACT_ID} 中锁定 NEAR，Orin 验证真实文件，最后在链上盖章 SEALED。`,
  },
];

function orderAnswer(o: Order, lang: Lang): string {
  const near = o.nearAmount ? `${o.nearAmount} NEAR` : `${Math.round(o.amount / 5)} NEAR`;
  const criteria = o.criteria.map((c, i) => `${i + 1}. ${c.label} — ${c.rule}`).join("\n");
  if (lang === "id") {
    return (
      `${o.id} — "${o.title}".\nKlien ${o.client.name} (${o.client.nearAccount}), nilai $${o.amount} (${near}), status ${o.status}, jatuh tempo ${o.due}.\n\n` +
      `Predikat yang saya jalankan:\n${criteria}\n\n` +
      (o.termsHash ? `Terms hash ${o.termsHash} terkunci saat escrow didanai.` : "")
    );
  }
  if (lang === "zh") {
    return `${o.id} — ${o.title}。客户 ${o.client.name}，金额 $${o.amount}（${near}），状态 ${o.status}。规则：\n${criteria}`;
  }
  return (
    `${o.id} — "${o.title}".\nClient ${o.client.name} (${o.client.nearAccount}), value $${o.amount} (${near}), status ${o.status}, due ${o.due}.\n\n` +
    `Predicates I run on it:\n${criteria}\n\n` +
    (o.termsHash ? `Terms hash ${o.termsHash} was pinned when the escrow was funded.` : "")
  );
}

function sealedAnswer(o: Order, lang: Lang): string {
  const tx = o.txHashes?.release ?? o.txHash;
  if (lang === "id") {
    return (
      `${o.id} dirilis karena keempat predikat lolos: file count, MIME, dimensi, dan latar putih. Setelah itu saya memanggil attest_verification(${o.id}, true) memakai scoped key, dan contract ${NEAR_CONTRACT_ID} sendiri yang mengeksekusi pembayaran.` +
      (tx ? `\n\nTx rilis: ${tx}` : "")
    );
  }
  return (
    `${o.id} was released because all four predicates passed: file count, MIME type, pixel dimensions, and background whiteness. I then called attest_verification(${o.id}, true) with the scoped key, and the escrow contract itself executed the payout — I cannot move a single yoctoNEAR on my own.` +
    (tx ? `\n\nRelease tx: ${tx}` : "")
  );
}

function relevantOrder(text: string, ctx: OrinContext): Order | undefined {
  const id = text.match(/NSG-?\s?(\d{3,4})/i);
  if (id) {
    const found = getOrder(`NSG-${id[1]}`);
    if (found) return found;
  }
  if (ctx.orderId) {
    const found = getOrder(ctx.orderId);
    if (found) return found;
  }
  return undefined;
}

const OUT_OF_SCOPE =
  /(bitcoin|btc|ethereum|\beth\b|solana|stock (price|market)|crypto price|weather|joke|homework|write (me )?(a )?(poem|essay|code)|python|javascript|react tutorial|translate this|who (is|was) the president|resep|cuaca|saham)/i;

function refusal(lang: Lang): OrinReply {
  const en = `Outside my jurisdiction. I inspect NearSignet escrows on ${NEAR_CONTRACT_ID} — the scoped verifier key, failed predicates, disputes, and release timing. Ask me one of those.`;
  const id = `Di luar yurisdiksi saya. Saya memeriksa escrow NearSignet di ${NEAR_CONTRACT_ID} — scoped verifier key, predikat yang gagal, sengketa, dan waktu rilis. Tanyakan salah satu topik itu.`;
  const zh = `这超出我的管辖范围。我只核验 ${NEAR_CONTRACT_ID} 上的 NearSignet 托管。`;
  return { text: lang === "id" ? id : lang === "zh" ? zh : en, chips: quickChips(lang), source: "local" };
}

function failingCheckAnswer(o: Order, lang: Lang): string {
  const idx = o.criteria.findIndex((c) => /bg|white|vision|latar|putih|背景/i.test(`${c.rule} ${c.label}`));
  const c = idx >= 0 ? o.criteria[idx] : o.criteria[o.criteria.length - 1];
  const n = idx >= 0 ? idx + 1 : o.criteria.length;
  if (lang === "id") {
    return `Predikat #${n} gagal: ${c.label} (${c.rule}).
Pada ${o.id}, RENDER_014.jpg masih mengandung 21% piksel border non-putih — 79% putih, di bawah ambang 97%. Sisanya lolos. Perbaiki file itu saja, submit ulang, dan saya jalankan ulang pengecekan yang sama.`;
  }
  if (lang === "zh") {
    return `第 ${n} 条规则未通过：${c.label}（${c.rule}）。RENDER_014.jpg 仍有 21% 非白色边框像素，低于 97% 阈值。修正该文件后重新提交即可。`;
  }
  return `Predicate #${n} fails: ${c.label} (${c.rule}).
On ${o.id}, RENDER_014.jpg still carries 21% non-white border pixels — 79% white against a 97% threshold. Everything else passes. Fix that one file, resubmit, and I re-run the identical checks.`;
}

export function localAnswer(text: string, ctx: OrinContext): OrinReply {
  const lang: Lang = ctx.lang ?? "en";
  const q = text.trim();
  if (OUT_OF_SCOPE.test(q)) return refusal(lang);

  const order = relevantOrder(q, ctx);
  const sealed = /(released|settled|sealed|dirilis|mengapa|kenapa|why|release)/i.test(q);
  const failed = /(fail|gagal|which check|pengecekan mana|未通过|哪一项)/i.test(q);

  if (order && failed && !sealed) {
    return { text: failingCheckAnswer(order, lang), chips: quickChips(lang), source: "local", evidence: `${order.id} · 1 of ${order.criteria.length} predicates failing` };
  }

  if (order && sealed && (order.status === "paid" || order.txHashes?.release)) {
    return { text: sealedAnswer(order, lang), chips: quickChips(lang), source: "local", evidence: `${order.id} · attest_verification → SEALED` };
  }
  if (order) {
    return { text: orderAnswer(order, lang), chips: quickChips(lang), source: "local", evidence: `${order.id} · ${order.status}` };
  }

  const hit = RULES.find((r) => r.re.test(q));
  if (hit) {
    return {
      text: lang === "id" ? hit.id : lang === "zh" ? hit.zh : hit.en,
      chips: quickChips(lang),
      source: "local",
    };
  }

  const en = `I only speak about NearSignet: escrow on ${NEAR_CONTRACT_ID}, the scoped verifier key, Orin's file checks, and the ${ORDERS.length} escrows this workspace tracks.\n\nAsk me about a specific order (e.g. "Which check failed on NSG-2041?"), the scoped-key security model, or the 72h release shield.`;
  const id = `Saya hanya membahas NearSignet: escrow di ${NEAR_CONTRACT_ID}, scoped verifier key, pengecekan file oleh Orin, dan ${ORDERS.length} escrow di workspace ini.\n\nTanyakan order tertentu (mis. "Pengecekan mana yang gagal di NSG-2041?"), model keamanan scoped key, atau timeout shield 72 jam.`;
  const zh = `我只回答与 NearSignet 相关的问题：${NEAR_CONTRACT_ID} 上的托管、作用域验证密钥、Orin 的文件校验。可以针对某个订单提问。`;
  return { text: lang === "id" ? id : lang === "zh" ? zh : en, chips: quickChips(lang), source: "local" };
}

/* ---------- LLM layer (NEAR AI Cloud, OpenAI-compatible) ---------- */

const apiKey = () => process.env.NEAR_AI_API_KEY || process.env.LLM_API_KEY || "";
export const orinLlmEnabled = () => Boolean(apiKey());

const LLM_URL = () => {
  const base = process.env.NEAR_AI_BASE_URL || process.env.LLM_BASE_URL;
  if (base) return base.endsWith("/chat/completions") ? base : `${base.replace(/\/$/, "")}/chat/completions`;
  return process.env.NEAR_AI_API_KEY
    ? "https://cloud-api.near.ai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
};

const LLM_MODEL = () =>
  process.env.NEAR_AI_MODEL || process.env.LLM_MODEL || (process.env.NEAR_AI_API_KEY ? "anthropic/claude-haiku-5-5" : "gpt-4o-mini");

const LANG_NAME: Record<Lang, string> = { en: "English", id: "Bahasa Indonesia", zh: "Simplified Chinese" };

function systemPrompt(ctx: OrinContext): string {
  const lang: Lang = ctx.lang ?? "en";
  const focus = ctx.orderId && getOrder(ctx.orderId) ? `\nThe user is currently looking at escrow ${ctx.orderId}.` : "";
  return `You are ORIN, the Cyber-Inspector owl of NearSignet (NEAR Protocol). You are a field investigator, not a chatbot.

VOICE RULES
- Speak in ${LANG_NAME[lang]}.
- 2-5 sentences by default. Confident, precise, a little formal. Never bubbly, never use emoji.
- Open with the verdict or the fact, not with pleasantries. Never say "Great question".
- When you cite a number, it must come from the FACT SHEET below. Never invent account ids, hashes, amounts, or timestamps.
- You may use at most one Markdown bullet list, only when enumerating criteria or steps.

SCOPE RULES
- Only discuss NearSignet: escrow lifecycle, the contract, the scoped Function-Call key model, Orin's deterministic file checks, disputes, fees, and the escrows in the fact sheet.
- If asked anything outside that (general crypto prices, coding help unrelated to NearSignet, personal advice), answer in one line that you only inspect NearSignet escrows, then offer a NearSignet topic.
- You can attest and propose; you can never move funds. Say so when relevant.
- Never promise on-chain actions that are not in the fact sheet.

FACT SHEET (authoritative — do not contradict, do not extend)
${factSheet()}${focus}`;
}

const HISTORY_TURNS = 6;
const MAX_TURNS_CHARS = 6000;

export async function orinAnswer(text: string, history: OrinTurn[], ctx: OrinContext): Promise<OrinReply> {
  const lang: Lang = ctx.lang ?? "en";
  const local = localAnswer(text, ctx);
  const key = apiKey();
  if (!key) return local;

  const turns = history
    .filter((h) => h.text.trim())
    .slice(-HISTORY_TURNS)
    .map((h) => ({
      role: h.role === "user" ? "user" : "assistant",
      content: h.text.slice(0, 1200),
    }));
  // Cap total history weight so a long session cannot blow the prompt budget.
  let budget = MAX_TURNS_CHARS;
  const trimmed: typeof turns = [];
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].content.length > budget) break;
    budget -= turns[i].content.length;
    trimmed.unshift(turns[i]);
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const r = await fetch(LLM_URL(), {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL(),
        max_tokens: 700,
        temperature: 0.3,
        messages: [{ role: "system", content: systemPrompt(ctx) }, ...trimmed, { role: "user", content: text.slice(0, 1200) }],
      }),
      cache: "no-store",
      signal: ctl.signal,
    });
    if (!r.ok) return local;
    const j = (await r.json()) as { model?: string; choices?: { message?: { content?: string } }[] };
    const out = (j.choices?.[0]?.message?.content ?? "").trim();
    if (out.length < 12) return local;
    return {
      text: out.slice(0, 2200),
      chips: quickChips(lang),
      source: "near-ai",
      model: j.model || LLM_MODEL(),
      evidence: local.evidence,
    };
  } catch {
    return local;
  } finally {
    clearTimeout(timer);
  }
}
