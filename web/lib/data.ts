/* =========================================================
   NearSignet — Seeded Cross-Border Escrow Orders & Rule Parser
   Order NSG-2033 links directly to the real live escrow settled on
   `nearsignet.testnet` (NEAR Testnet).
   ========================================================= */

export type Direction = "from_client" | "to_client" | "by_me";
export type Status =
  | "request"          // client requested work, awaiting freelancer acceptance
  | "awaiting_payment" // terms hashed, awaiting NEAR escrow deposit
  | "in_escrow"        // NEAR locked in nearsignet.testnet, freelancer working
  | "verifying"        // deliverable uploaded, scoped AI verifier inspecting
  | "revision"         // machine check flagged an unmet rule
  | "review"           // all criteria verified, 72h on-chain review timer running
  | "paid"             // released on NEAR — SEALED!
  | "declined";

export type CriterionIcon = "file" | "image" | "ruler" | "palette" | "clock" | "text";
export interface Criterion { label: string; rule: string; icon: CriterionIcon }

export interface Person {
  name: string;
  email?: string;
  handle?: string;
  nearAccount?: string;
  initials: string;
  city: string;
  country: string;
  color: string;
}

export interface Order {
  id: string;
  direction: Direction;
  title: string;
  client: Person;
  amount: number;      // USD reference value
  nearAmount?: number | string;  // Native NEAR locked in escrow
  currency?: string;
  due: string;
  created?: string;
  createdAt?: string;
  status: Status;
  brief: string;
  criteria: Criterion[];
  accent?: string;
  product?: ProductKind;
  kind?: ProductKind;
  termsHash?: string;
  txHash?: string;
  txHashes?: { fund?: string; verify?: string; release?: string };
  sealId?: string;
}

export type ProductKind = "bottle" | "mug" | "shoe" | "bag" | "candle" | "watch" | "plant" | "cap" | "reel";

export const ME: Person = {
  name: "Raka Pratama",
  handle: "raka-studio",
  nearAccount: "raka-studio.testnet",
  initials: "RP",
  city: "Yogyakarta",
  country: "ID",
  color: "var(--mint-l)",
};

export const ORDERS: Order[] = [
  {
    id: "NSG-2041",
    direction: "from_client",
    title: "3D Sneaker Render Pack · 20 angles",
    client: { name: "Liam Carter", nearAccount: "liam-client.testnet", initials: "LC", city: "Toronto", country: "CA", color: "var(--sky-l)" },
    amount: 150, nearAmount: 30, currency: "USD", due: "2026-11-16", created: "2026-11-04",
    status: "in_escrow",
    brief: "Hey Raka! Need 20 clean studio renders of our trail sneaker for our storefront launch. Pure white background, at least 2000px on the long edge, JPG format. Budget is $150 (30 NEAR locked in escrow).",
    criteria: [
      { label: "Exactly 20 files", rule: "count(files) == 20", icon: "file" },
      { label: "JPG format", rule: "mime == image/jpeg", icon: "image" },
      { label: "Min. 2000px long edge", rule: "max(w,h) ≥ 2000", icon: "ruler" },
      { label: "Pure white background", rule: "vision: bg ≥ 97% #FFF", icon: "palette" },
    ],
    accent: "var(--mint)", product: "shoe",
    termsHash: "sha256:9c11d04f8a2e7b31",
  },
  {
    id: "NSG-2052",
    direction: "from_client",
    title: "Wallet Launch Vertical Cut · 9:16, <60s",
    client: { name: "Hana Sato", nearAccount: "hana-tokyo.testnet", initials: "HS", city: "Tokyo", country: "JP", color: "var(--lav-l)" },
    amount: 220, nearAmount: 44, currency: "USD", due: "2026-11-20", created: "2026-11-08",
    status: "in_escrow",
    brief:
      "We recorded raw screen captures for our NEAR mobile wallet teaser and need a crisp vertical reel: 1 video, 9:16 aspect, under 60 seconds, MP4/WebM, mixed audio track — plus our signet emblem visible in the opening 3 seconds.",
    criteria: [
      { label: "Exactly 1 video", rule: "count(videos) == 1", icon: "file" },
      { label: "MP4 or WebM", rule: "mime ∈ {mp4, webm}", icon: "image" },
      { label: "Under 60 s", rule: "duration ≤ 60", icon: "clock" },
      { label: "9:16 vertical", rule: "aspect == 9:16", icon: "ruler" },
      { label: "Audio mixed (≥ -30 dBFS)", rule: "audio ≥ -30 dBFS", icon: "text" },
      { label: "Emblem in first 3 s", rule: "vision: logo visible in the first 3 seconds", icon: "palette" },
    ],
    accent: "var(--sky)", product: "reel",
    termsHash: "sha256:7d3a91bc04e2f812",
  },
  {
    id: "NSG-2047",
    direction: "from_client",
    title: "Brand Icon System for DeFi Vault",
    client: { name: "Elena Rostova", nearAccount: "elena-zurich.testnet", initials: "ER", city: "Zurich", country: "CH", color: "var(--lemon-l)" },
    amount: 320, nearAmount: 64, currency: "USD", due: "2026-11-18", created: "2026-11-10",
    status: "request",
    brief: "Hi Raka! Building a non-custodial vault protocol. Looking for 3 icon concepts, exported in SVG + PNG, low-saturation slate & mint palette, delivered by Nov 18. Budget $320.",
    criteria: [
      { label: "3 icon concepts", rule: "count(concepts) == 3", icon: "file" },
      { label: "SVG + PNG for each", rule: "formats ⊇ {svg, png}", icon: "image" },
      { label: "Muted mint palette", rule: "vision: avg saturation < 45%", icon: "palette" },
      { label: "Delivered by 18 Nov", rule: "submitted_at ≤ due", icon: "clock" },
    ],
    accent: "var(--lemon)", product: "watch",
    termsHash: "sha256:3e92ab10f7c488d1",
  },
  {
    id: "NSG-2039",
    direction: "to_client",
    title: "App Store Feature Cards · 6 screens",
    client: { name: "Mateo Silva", nearAccount: "mateo-sp.testnet", initials: "MS", city: "São Paulo", country: "BR", color: "var(--mint-l)" },
    amount: 90, nearAmount: 18, currency: "USD", due: "2026-11-13", created: "2026-11-05",
    status: "review",
    brief: "6-screen feature showcase carousel for our cross-chain swap app. 1080×1350px, crisp PNG exports.",
    criteria: [
      { label: "6 screens", rule: "count(files) == 6", icon: "file" },
      { label: "1080 × 1350 px", rule: "w == 1080 && h == 1350", icon: "ruler" },
      { label: "PNG format", rule: "mime == image/png", icon: "image" },
    ],
    accent: "var(--lav)", product: "mug",
    termsHash: "sha256:6a03e812c44f09ab",
  },
  {
    id: "NSG-2051",
    direction: "to_client",
    title: "SDK Quickstart Docs · 4 guides",
    client: { name: "Nadia Al-Mansoor", nearAccount: "nadia-dubai.testnet", initials: "NA", city: "Dubai", country: "AE", color: "var(--peach-l)" },
    amount: 240, nearAmount: 48, currency: "USD", due: "2026-11-22", created: "2026-11-09",
    status: "awaiting_payment",
    brief: "Write English developer guides for 4 pages (Install, Auth, Escrow, Webhooks) for our payment SDK. 300–500 words each, clear technical tone, include keywords 'testnet' and 'NEAR'.",
    criteria: [
      { label: "4 guides delivered", rule: "count(docs) == 4", icon: "file" },
      { label: "300–500 words each", rule: "300 ≤ words ≤ 500", icon: "text" },
      { label: "Keywords included", rule: "contains('testnet','NEAR')", icon: "text" },
    ],
    accent: "var(--peach)", product: "plant",
    termsHash: "sha256:1f55c92b7e04d33a",
  },
  {
    id: "NSG-2033",
    direction: "from_client",
    title: "Storefront Header + Verified Emblem",
    client: { name: "Liam Carter", nearAccount: "liam-client.testnet", initials: "LC", city: "London", country: "GB", color: "var(--mint-l)" },
    amount: 75, nearAmount: 1.5, currency: "USD", due: "2026-11-12", created: "2026-11-02",
    status: "paid",
    brief: "Marketplace header 3360×840 and a 500×500 square avatar emblem. Emerald & obsidian palette.",
    criteria: [
      { label: "Header 3360 × 840", rule: "w == 3360 && h == 840", icon: "ruler" },
      { label: "Emblem 500 × 500", rule: "w == h == 500", icon: "ruler" },
    ],
    accent: "var(--mint)", product: "bag",
    termsHash: "sha256:4b89f02dc91e8a77",
    txHash: "GM3AHKng3oHVbF3djXaYZouKWwtBKZU1mYGxB7onknVF",
    sealId: "SEAL-NSG-2033-034003",
  },
  {
    id: "NSG-2045",
    direction: "to_client",
    title: "Hackathon Booth Print Sheet · A4",
    client: { name: "Diego Morales", nearAccount: "diego-mx.testnet", initials: "DM", city: "Mexico City", country: "MX", color: "var(--pink-l)" },
    amount: 180, nearAmount: 36, currency: "USD", due: "2026-11-15", created: "2026-11-06",
    status: "revision",
    brief: "Two-page A4 booth handout, print-ready PDF with 3mm bleed, bilingual Spanish + English.",
    criteria: [
      { label: "2 pages, A4", rule: "pages == 2 && size == A4", icon: "file" },
      { label: "3mm bleed", rule: "pdf.bleed == 3mm", icon: "ruler" },
      { label: "Bilingual ES + EN", rule: "lang ⊇ {es, en}", icon: "text" },
    ],
    accent: "var(--pink)", product: "cap",
    termsHash: "sha256:5c88e01fa23d7719",
  },
  {
    id: "NSG-2029",
    direction: "to_client",
    title: "Seed Round Deck Polish · 12 slides",
    client: { name: "Min-jun Park", nearAccount: "minjun-kr.testnet", initials: "MP", city: "Seoul", country: "KR", color: "var(--sky-l)" },
    amount: 210, nearAmount: 42, currency: "USD", due: "2026-11-08", created: "2026-11-01",
    status: "paid",
    brief: "Polish a 12-slide protocol seed deck. Unified diagrams, custom icons, export to PDF + PPTX.",
    criteria: [
      { label: "12 slides", rule: "count(slides) == 12", icon: "file" },
      { label: "PDF + PPTX", rule: "formats ⊇ {pdf, pptx}", icon: "image" },
    ],
    accent: "var(--sky)", product: "candle",
    termsHash: "sha256:8e20f17bc90a3412",
    txHash: "D3h4bQb6JNcHV1P7KBTimFrgVRiuHZtXEHYhjo9ogBjH",
    sealId: "SEAL-NSG-2029-881204",
  },
  {
    id: "NSG-2050",
    direction: "from_client",
    title: "NFT Mascot Trait Pack · 8 stickers",
    client: { name: "Freja Lind", nearAccount: "freja-se.testnet", initials: "FL", city: "Stockholm", country: "SE", color: "var(--lemon-l)" },
    amount: 400, nearAmount: 80, currency: "USD", due: "2026-11-26", created: "2026-11-11",
    status: "request",
    brief: "8 die-cut character trait stickers for an on-chain badge series. 300 DPI, transparent PNG.",
    criteria: [
      { label: "8 illustrations", rule: "count(files) == 8", icon: "file" },
      { label: "300 DPI", rule: "dpi ≥ 300", icon: "ruler" },
      { label: "Transparent PNG", rule: "png && alpha", icon: "image" },
    ],
    accent: "var(--lemon)", product: "bottle",
    termsHash: "sha256:2a71d990e4b15508",
  },
];

export const getOrder = (id: string) => ORDERS.find((o) => o.id === id);

export const STATUS_STYLE: Record<Status, { bg: string; fg: string }> = {
  request: { bg: "var(--pink-l)", fg: "#9D174D" },
  awaiting_payment: { bg: "var(--lemon-l)", fg: "#854D0E" },
  in_escrow: { bg: "var(--sky-l)", fg: "#075985" },
  verifying: { bg: "var(--lav-l)", fg: "#5B21B6" },
  revision: { bg: "var(--peach-l)", fg: "#9A3412" },
  review: { bg: "var(--lav-l)", fg: "#5B21B6" },
  paid: { bg: "var(--mint-l)", fg: "#065F46" },
  declined: { bg: "#E5E7EB", fg: "#4B5563" },
};

export const NEEDS_ME: Status[] = ["request", "in_escrow", "revision"];
export const STATS = { inEscrow: 690, monthPaid: 2975 };

type L = "en" | "zh" | "id";
const TPL: Record<L, Record<string, (...a: string[]) => string>> = {
  en: { count: (n, u) => `Exactly ${n} ${u}`, fmt: (f) => `${f} format`, size: (w, h) => `${w} × ${h} px`, min: (p) => `Min. ${p}px long edge`,
        white: () => "Pure white background", palette: () => "Color palette as described", words: (a, b) => `${a}–${b} words`, by: (d) => `Delivered by ${d}`, match: () => "Matches the brief",
        len: (n) => `Under ${n} seconds`, ratio: (r) => `${r} aspect`, audio: (d) => `Audio mixed (≥ ${d} dBFS)`, mb: (n) => `Max ${n} MB per file` },
  zh: { count: (n, u) => `数量：${n} ${u}`, fmt: (f) => `${f} 格式`, size: (w, h) => `尺寸 ${w} × ${h} px`, min: (p) => `长边至少 ${p}px`,
        white: () => "纯白背景", palette: () => "配色符合描述", words: (a, b) => `${a}–${b} 字`, by: (d) => `${d}前交付`, match: () => "符合需求描述",
        len: (n) => `${n} 秒以内`, ratio: (r) => `${r} 比例`, audio: (d) => `含音轨（≥ ${d} dBFS）`, mb: (n) => `单文件 ≤ ${n} MB` },
  id: { count: (n, u) => `Tepat ${n} ${u}`, fmt: (f) => `Format ${f}`, size: (w, h) => `Ukuran ${w} × ${h} px`, min: (p) => `Sisi panjang min. ${p}px`,
        white: () => "Latar putih bersih", palette: () => "Warna sesuai deskripsi", words: (a, b) => `${a}–${b} kata`, by: (d) => `Dikirim sebelum ${d}`, match: () => "Sesuai brief",
        len: (n) => `Di bawah ${n} detik`, ratio: (r) => `Rasio ${r}`, audio: (d) => `Ada audio (≥ ${d} dBFS)`, mb: (n) => `Maks ${n} MB per file` },
};

export function draftCriteria(brief: string, lang: L = "en"): { criteria: Criterion[]; amount?: number; title: string; suggestedTitle: string; suggestedAmount: number } {
  const T = TPL[lang];
  const b = brief.toLowerCase();
  const out: Criterion[] = [];
  const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  const NOUNS = "photos?|images?|pictures?|renders?|screens?|files?|slides?|pages?|articles?|guides?|posts?|blogs?|illustrations?|concepts?|logos?|icons?|banners?|stickers?|videos?|reels?|clips?|footages?|tracks?|songs?|voice[- ]?overs?|foto|gambar|halaman|ilustrasi|konsep|artikel|video|音频|曲|张|个|页|篇";
  const count =
    b.match(new RegExp(`(?<![a-z])(\\d{1,2})\\s*(?:[a-z]+\\s+)?(${NOUNS})(?![a-z])`)) ||
    b.match(new RegExp(`(?<![a-z])([a-z]+)\\s+(?:[a-z]+\\s+)?(${NOUNS})(?![a-z])`));
  if (count) {
    const n = /^\d+$/.test(count[1]) ? count[1] : String(NUM[count[1]] ?? "");
    const noun = count[2];
    if (n) {
      const k = noun.toLowerCase();
      const collection = /video|reel|clip|footage/.test(k)
        ? "videos"
        : /track|song|voice|audio|音频|曲/.test(k)
          ? "audio"
          : /slide|页/.test(k)
            ? "slides"
            : /page|article|guide|post|blog|doc|篇/.test(k)
              ? "docs"
              : /photo|image|picture|render|screen|foto|gambar|张/.test(k)
                ? "images"
                : "files";
      const unit = n === "1" && /s$/.test(noun) ? noun.slice(0, -1) : noun;
      out.push({ label: T.count(n, unit), rule: `count(${collection}) == ${n}`, icon: "file" });
    }
  }
  const fmt = b.match(/\b(jpg|jpeg|png|svg|pdf|pptx|mp4|webm|docx)\b/g);
  if (fmt) out.push({ label: T.fmt([...new Set(fmt)].map((f) => f.toUpperCase()).join(" + ")), rule: `mime ∈ {${[...new Set(fmt)].join(", ")}}`, icon: "image" });
  const px = b.match(/(\d{3,4})\s*(?:x|×)\s*(\d{3,4})/);
  const minpx = b.match(/(?:at least|min(?:imum|imal)?\.?|至少)\s*(\d{3,4})\s*px/) || b.match(/(\d{3,4})\s*px/);
  if (px) out.push({ label: T.size(px[1], px[2]), rule: `w == ${px[1]} && h == ${px[2]}`, icon: "ruler" });
  else if (minpx) out.push({ label: T.min(minpx[1]), rule: `max(w,h) ≥ ${minpx[1]}`, icon: "ruler" });
  const secs = b.match(/(\d{1,3})\s*(?:s\b|sec\b|secs\b|seconds?\b|detik\b|秒)/) || (/\b(?:under|below|di bawah)\s+(?:a|one)\s+minute/.test(b) ? ["60", "60"] : null);
  if (secs) out.push({ label: T.len(secs[1]), rule: `duration ≤ ${secs[1]}`, icon: "clock" });
  const ratio = b.match(/(?:^|[^\d])(\d{1,2})\s*:\s*(\d{1,2})(?![\d])/);
  if (ratio) out.push({ label: T.ratio(`${ratio[1]}:${ratio[2]}`, ), rule: `aspect == ${ratio[1]}:${ratio[2]}`, icon: "ruler" });
  if (/\baudio\b|voice[- ]?over|voiceover|sound ?mix|music|backsound|musik|\u97f3轨|\u914d\u4e50/.test(b))
    out.push({ label: T.audio("-30"), rule: "audio ≥ -30 dBFS", icon: "text" });
  const cap = b.match(/(?:max(?:imum)?|maks(?:imal)?|under|below|di bawah|\u2264|<=)\s*(\d+(?:\.\d+)?)\s*(mb|gb)\b/);
  if (cap) out.push({ label: T.mb(cap[1]), rule: `size ≤ ${cap[1]} ${cap[2].toUpperCase()}`, icon: "file" });
  if (/white background|white bg|latar putih|白底|纯白背景|白色背景/.test(b)) out.push({ label: T.white(), rule: "vision: bg ≥ 97% #FFF", icon: "palette" });
  else if (/pastel|mint|brand colou?rs|earthy|colou?rs?|warna brand|warna|品牌色|配色/.test(b)) out.push({ label: T.palette(), rule: "vision: palette match", icon: "palette" });
  const words = b.match(/(\d{2,4})\s*[–-]\s*(\d{2,4})\s*words/);
  if (words) out.push({ label: T.words(words[1], words[2]), rule: `${words[1]} ≤ words ≤ ${words[2]}`, icon: "text" });
  const day = b.match(/(?:by|sebelum)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|senin|selasa|rabu|kamis|jumat|sabtu|minggu|\d{1,2}\s+\w+)/) || b.match(/(周[一二三四五六日])前/);
  if (day) out.push({ label: T.by(day[1][0].toUpperCase() + day[1].slice(1)), rule: "submitted_at ≤ due", icon: "clock" });
  if (out.length < 2) out.push({ label: T.match(), rule: "vision + LLM review", icon: "text" });
  const money = brief.match(/\$\s?(\d+(?:\.\d+)?)/) || brief.match(/(\d+(?:\.\d+)?)\s?(?:usd|dollars)/i);
  const title = (brief.split(/[.!?:,！？。：，]/).find((s) => s.trim().length > 12 || /[\u4e00-\u9fff]{6,}/.test(s))?.trim() ?? "New escrow order").replace(/^(hi|hello|hey|halo|hai|你好)\s*\w*\s*/i, "");
  const shortTitle = title.length > 56 ? title.slice(0, 56).replace(/\s+\S*$/, "") + "…" : title;
  const parsedAmt = money ? parseFloat(money[1]) : undefined;
  return { criteria: out.slice(0, 6), amount: parsedAmt, title: shortTitle, suggestedTitle: shortTitle, suggestedAmount: parsedAmt ?? 300 };
}
