/* =========================================================
   NearSignet — Seeded Cross-Border Escrow Orders & Rule Parser
   Order NSG-2033 links directly to the real live escrow settled on
   `nearsignet-protocol.testnet` (NEAR Testnet).
   ========================================================= */

import { demoDepositNear } from "./near";

export type Direction = "from_client" | "to_client" | "by_me";
export type Status =
  | "request"          // client requested work, awaiting freelancer acceptance
  | "awaiting_payment" // terms hashed, awaiting NEAR escrow deposit
  | "in_escrow"        // NEAR locked in nearsignet-protocol.testnet, freelancer working
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
  name: "Sasam",
  handle: "sasam-studio",
  nearAccount: "raka.nearsignet-protocol.testnet",
  initials: "RP",
  city: "Yogyakarta",
  country: "ID",
  color: "var(--mint-l)",
};

/**
 * Extra ready-made jobs so a demo never runs out: one per lifecycle stage
 * (request → awaiting_payment → in_escrow → verifying → revision → review → paid).
 * They are plain data; funding any of them on-chain still mints a fresh
 * `New On-Chain Run` id, which is the whole point of the sandbox.
 */
const DEMO_CLIENTS = [
  { name: "Nadia Rahman", nearAccount: "nadia-kl.testnet", initials: "NR", city: "Kuala Lumpur", country: "MY", color: "var(--mint-l)" },
  { name: "Marco Bianchi", nearAccount: "marco-mil.testnet", initials: "MB", city: "Milan", country: "IT", color: "var(--lav-l)" },
  { name: "Yuki Tanaka", nearAccount: "yuki-osa.testnet", initials: "YT", city: "Osaka", country: "JP", color: "var(--sky-l)" },
  { name: "Ayu Prameswari", nearAccount: "ayu-jkt.testnet", initials: "AP", city: "Jakarta", country: "ID", color: "var(--mint)" },
  { name: "Ola Berg", nearAccount: "ola-osl.testnet", initials: "OB", city: "Oslo", country: "NO", color: "var(--sky)" },
] as const;

const DEMO_JOBS: { title: string; amount: number; status: Status; brief: string; criteria: Criterion[]; accent: string; product: ProductKind }[] = [
  { title: "DeFi Dashboard UI Kit · 24 screens", amount: 480, status: "review",
    brief: "Dark-mode dashboard kit for a NEAR lending protocol: 24 screens, Figma + React export, mint/slate tokens.",
    criteria: [
      { label: "Exactly 24 screens", rule: "count(frames) == 24", icon: "file" },
      { label: "Figma + React export", rule: "files ∋ {fig, tsx}", icon: "file" },
      { label: "Colour tokens applied", rule: "vision: palette ⊆ {mint, slate}", icon: "palette" },
    ], accent: "var(--mint)", product: "bottle" },
  { title: "Product Explainer Film · 45s", amount: 620, status: "verifying",
    brief: "45-second explainer for a cross-border payout product. 16:9, English VO, burned-in captions, brand sting at 0-3s.",
    criteria: [
      { label: "Exactly 1 video", rule: "count(videos) == 1", icon: "file" },
      { label: "45s ±3s", rule: "duration ∈ [42, 48]", icon: "clock" },
      { label: "16:9 horizontal", rule: "aspect == 16:9", icon: "ruler" },
      { label: "Captions burned in", rule: "vision: captions present", icon: "text" },
    ], accent: "var(--sky)", product: "reel" },
  { title: "Brand Icon System · 36 glyphs", amount: 260, status: "revision",
    brief: "36 monoline icons on a 24px grid, SVG only, 2px stroke, joined by a shared corner radius.",
    criteria: [
      { label: "Exactly 36 SVGs", rule: "count(files) == 36", icon: "file" },
      { label: "24px grid", rule: "grid == 24", icon: "ruler" },
      { label: "2px stroke", rule: "stroke == 2", icon: "palette" },
    ], accent: "var(--lav)", product: "candle" },
  { title: "Technical Whitepaper · 18 pages", amount: 340, status: "in_escrow",
    brief: "18-page protocol whitepaper with escrow settlement diagrams, LaTeX or InDesign source, PDF/A export.",
    criteria: [
      { label: "18 pages ±1", rule: "pages ∈ [17,19]", icon: "file" },
      { label: "PDF/A export", rule: "mime == application/pdf", icon: "image" },
      { label: "Diagrams included", rule: "count(diagrams) ≥ 6", icon: "image" },
    ], accent: "var(--mint)", product: "watch" },
  { title: "Landing Page Build · 6 sections", amount: 300, status: "awaiting_payment",
    brief: "Responsive landing page: hero, features, pricing, FAQ, testimonial, footer. Deployed preview required.",
    criteria: [
      { label: "6 sections present", rule: "count(sections) == 6", icon: "file" },
      { label: "Mobile ≤ 390px", rule: "viewport: 390 no overflow", icon: "ruler" },
      { label: "Lighthouse ≥ 90", rule: "perf ≥ 90", icon: "clock" },
    ], accent: "var(--sky)", product: "bag" },
  { title: "Podcast Cover Art · 3 concepts", amount: 180, status: "request",
    brief: "Three cover-art concepts for a NEAR builder podcast, 3000×3000, layered source files.",
    criteria: [
      { label: "3 concepts", rule: "count(images) == 3", icon: "file" },
      { label: "3000×3000", rule: "w == h == 3000", icon: "ruler" },
      { label: "Layered source", rule: "files ∋ {psd, fig}", icon: "file" },
    ], accent: "var(--mint)", product: "mug" },
  { title: "Motion Logo Sting · 3s loop", amount: 210, status: "paid",
    brief: "3-second logo sting, seamless loop, alpha channel, 60fps.",
    criteria: [
      { label: "Seamless loop", rule: "loop == true", icon: "clock" },
      { label: "Alpha channel", rule: "alpha == true", icon: "image" },
      { label: "60 fps", rule: "fps == 60", icon: "clock" },
    ], accent: "var(--lav)", product: "cap" },
  { title: "Tokenomics One-Pager · EN + ID", amount: 150, status: "in_escrow",
    brief: "One-pager explaining emission schedule, in English and Indonesian, print-ready and web-ready.",
    criteria: [
      { label: "Two languages", rule: "count(langs) == 2", icon: "text" },
      { label: "Print + web export", rule: "files ∋ {pdf, png}", icon: "file" },
      { label: "Charts readable at 100%", rule: "vision: labels legible", icon: "palette" },
    ], accent: "var(--mint)", product: "plant" },
];

const demoFromJob = (job: (typeof DEMO_JOBS)[number], i: number): Order => {
  const client = DEMO_CLIENTS[i % DEMO_CLIENTS.length];
  const due = new Date(Date.now() + (4 + i * 3) * 86_400_000).toISOString().slice(0, 10);
  return {
    id: `NSG-30${String(10 + i).slice(-2)}`,
    direction: "from_client",
    title: job.title,
    client: { ...client },
    amount: job.amount,
    nearAmount: demoDepositNear(job.amount),
    currency: "USD",
    due,
    created: new Date(Date.now() - (i + 1) * 86_400_000).toISOString().slice(0, 10),
    status: job.status,
    brief: job.brief,
    criteria: job.criteria,
    accent: job.accent,
    product: job.product,
    termsHash: `sha256:${(0x9e3779b1 * (i + 7)).toString(16).padStart(8, "0")}${(0x85ebca6b * (i + 3)).toString(16).padStart(8, "0")}`,
  };
};

export const ORDERS: Order[] = [
  {
    id: "NSG-2041",
    direction: "from_client",
    title: "3D Sneaker Render Pack · 20 angles",
    client: { name: "Liam Carter", nearAccount: "liam-client.testnet", initials: "LC", city: "Toronto", country: "CA", color: "var(--sky-l)" },
    amount: 150, nearAmount: demoDepositNear(150), currency: "USD", due: "2026-11-16", created: "2026-11-04",
    status: "in_escrow",
    brief: "Hey Sasam! Need 20 clean studio renders of our trail sneaker for our storefront launch. Pure white background, at least 2000px on the long edge, JPG format. Budget is $150 (30 NEAR locked in escrow).",
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
    amount: 220, nearAmount: demoDepositNear(220), currency: "USD", due: "2026-11-20", created: "2026-11-08",
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
    amount: 320, nearAmount: demoDepositNear(320), currency: "USD", due: "2026-11-18", created: "2026-11-10",
    status: "request",
    brief: "Hi Sasam! Building a non-custodial vault protocol. Looking for 3 icon concepts, exported in SVG + PNG, low-saturation slate & mint palette, delivered by Nov 18. Budget $320.",
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
    amount: 90, nearAmount: demoDepositNear(90), currency: "USD", due: "2026-11-13", created: "2026-11-05",
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
    amount: 240, nearAmount: demoDepositNear(240), currency: "USD", due: "2026-11-22", created: "2026-11-09",
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
    client: { name: "Liam Carter", nearAccount: "liam.nearsignet-protocol.testnet", initials: "LC", city: "London", country: "GB", color: "var(--mint-l)" },
    amount: 75, nearAmount: demoDepositNear(75), currency: "USD", due: "2026-11-12", created: "2026-11-02",
    status: "paid",
    brief: "Marketplace header 3360×840 and a 500×500 square avatar emblem. Emerald & obsidian palette.",
    criteria: [
      { label: "Header 3360 × 840", rule: "w == 3360 && h == 840", icon: "ruler" },
      { label: "Emblem 500 × 500", rule: "w == h == 500", icon: "ruler" },
    ],
    accent: "var(--mint)", product: "bag",
    termsHash: "sha256:9f44d8e2c1a730b5",
    txHash: "6x8XGr4pb8AzDFFFuo7DVYGzfoGts5GxTsVc7qA13x5a",
    txHashes: {
      fund: "EquEciRe5UtZgmCXyksqmnyL3br4rNeK1YUE31fYWkAX",
      verify: "48zAoThDXD31LpRYYFdXY62HVJ39sNgTJGxg3QUJQttn",
      release: "6x8XGr4pb8AzDFFFuo7DVYGzfoGts5GxTsVc7qA13x5a",
    },
    sealId: "SEAL-NSG-2033-597675",
  },
  {
    id: "NSG-2045",
    direction: "to_client",
    title: "Hackathon Booth Print Sheet · A4",
    client: { name: "Diego Morales", nearAccount: "diego-mx.testnet", initials: "DM", city: "Mexico City", country: "MX", color: "var(--pink-l)" },
    amount: 180, nearAmount: demoDepositNear(180), currency: "USD", due: "2026-11-15", created: "2026-11-06",
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
    amount: 210, nearAmount: demoDepositNear(210), currency: "USD", due: "2026-11-08", created: "2026-11-01",
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
    amount: 400, nearAmount: demoDepositNear(400), currency: "USD", due: "2026-11-26", created: "2026-11-11",
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
  ...DEMO_JOBS.map(demoFromJob),
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
