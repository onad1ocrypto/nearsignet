import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface StoredReq {
  id: string;
  handle: string;
  name: string;
  email: string;
  nearAccount?: string;
  freelancerAccount?: string;
  brief: string;
  title?: string;
  budget: number;
  criteria: { label: string; rule: string; icon: string }[];
  createdAt: string;
  status: "new" | "accepted" | "declined";
}

const memReqs = new Map<string, StoredReq>();

const clean = (s: unknown, max: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const handle = clean(b.handle, 32).toLowerCase() || "sasam-studio";
  const name = clean(b.name, 80);
  const email = clean(b.email, 120);
  const nearAccount = clean(b.nearAccount, 64).toLowerCase() || undefined;
  const freelancerAccount = clean(b.freelancerAccount, 64).toLowerCase() || undefined;
  const brief = String(b.brief ?? "").trim().slice(0, 1200);
  const title = clean(b.title, 90) || undefined;
  const budget = Math.max(1, Math.min(100_000, Number(b.budget || 100)));
  const criteria = Array.isArray(b.criteria)
    ? (b.criteria as Record<string, unknown>[]).slice(0, 8).map((c) => ({
        label: clean(c?.label, 90) || "Deliverable check",
        rule: clean(c?.rule, 90) || "manual_review()",
        icon: clean(c?.icon, 16) || "file",
      }))
    : [];

  if (!name || !brief) {
    return NextResponse.json({ error: "missing name or brief" }, { status: 400 });
  }

  const id = `REQ-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const item: StoredReq = {
    id,
    handle,
    name,
    email,
    nearAccount,
    freelancerAccount,
    brief,
    title,
    budget,
    criteria,
    createdAt: new Date().toISOString(),
    status: "new",
  };
  memReqs.set(id, item);
  return NextResponse.json({ ok: true, id, stored: "server" });
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get("id");
  if (id) {
    const found = memReqs.get(id.toUpperCase());
    if (!found) return NextResponse.json({ request: null }, { status: 404 });
    return NextResponse.json({ request: found });
  }
  const handle = (u.searchParams.get("handle") || "").trim().toLowerCase();
  const requests = [...memReqs.values()]
    .filter((r) => !handle || r.handle === handle)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 40);
  return NextResponse.json({ requests });
}

export async function PATCH(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { id?: string; status?: StoredReq["status"] };
  const id = String(b.id || "").toUpperCase();
  const cur = memReqs.get(id);
  if (cur && (b.status === "accepted" || b.status === "declined" || b.status === "new")) {
    memReqs.set(id, { ...cur, status: b.status });
  }
  return NextResponse.json({ ok: true });
}
