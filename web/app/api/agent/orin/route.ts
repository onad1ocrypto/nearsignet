import { NextResponse } from "next/server";
import { orinAnswer, type OrinTurn } from "@/lib/orin";
import type { Lang } from "@/lib/dict";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* --- Lightweight in-memory rate limit (per warm lambda instance) --- */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;
const buckets = new Map<string, { count: number; reset: number }>();

function limited(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now > b.reset) {
    buckets.set(ip, { count: 1, reset: now + WINDOW_MS });
    if (buckets.size > 500) for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
    return false;
  }
  b.count += 1;
  return b.count > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anon";
  if (limited(ip)) {
    return NextResponse.json(
      { error: "rate_limited", message: "Orin is inspecting too many requests. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const b = (await req.json().catch(() => ({}))) as {
    message?: string;
    history?: { role?: string; text?: string }[];
    orderId?: string;
    pathname?: string;
    lang?: string;
  };

  const message = String(b.message ?? "").trim().slice(0, 1200);
  if (message.length < 2) {
    return NextResponse.json({ error: "message too short" }, { status: 400 });
  }

  const history: OrinTurn[] = Array.isArray(b.history)
    ? b.history
        .slice(-8)
        .map((h) => ({
          role: h.role === "user" ? ("user" as const) : ("orin" as const),
          text: String(h.text ?? "").slice(0, 1200),
        }))
        .filter((h) => h.text.trim().length > 0)
    : [];

  const lang: Lang = b.lang === "zh" || b.lang === "id" ? b.lang : "en";
  const reply = await orinAnswer(message, history, {
    lang,
    orderId: b.orderId ? String(b.orderId).slice(0, 24) : undefined,
    pathname: b.pathname ? String(b.pathname).slice(0, 120) : undefined,
  });

  return NextResponse.json(reply, { headers: { "Cache-Control": "no-store" } });
}
