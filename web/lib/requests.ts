/* =========================================================
   Incoming client requests (`/to/<handle>` -> Freelancer Inbox).
   ========================================================= */

import type { Criterion, Order, Person, ProductKind } from "./data";
import { lsGet, lsSet } from "./safeStorage";

export interface IncomingRequest {
  id: string;
  handle: string;
  name: string;
  email: string;
  nearAccount?: string;
  brief: string;
  title?: string;
  budget: number;
  criteria: Criterion[];
  createdAt: string;
  status: "new" | "accepted" | "declined";
}

const pendingKey = (handle: string) => `nearsignet.req.${handle || "guest"}`;
const ORDERS_KEY = "nearsignet.myOrders";
const HANDLES_KEY = "nearsignet.reqHandles";

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = lsGet(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown) {
  try {
    lsSet(key, JSON.stringify(value));
  } catch {}
}

export const newRequestId = () => `REQ-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

export function localRequests(handle: string): IncomingRequest[] {
  const all = readLS<IncomingRequest[]>(pendingKey(handle), []);
  return all.filter((r) => r && r.id);
}

export function saveLocalRequest(r: IncomingRequest) {
  const list = localRequests(r.handle).filter((x) => x.id !== r.id);
  writeLS(pendingKey(r.handle), [r, ...list].slice(0, 40));
  rememberHandle(r.handle);
}

export function updateLocalRequest(id: string, patch: Partial<IncomingRequest>) {
  for (const handle of knownHandles()) {
    const list = localRequests(handle);
    if (!list.some((r) => r.id === id)) continue;
    writeLS(pendingKey(handle), list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
}

function rememberHandle(handle: string) {
  const known = readLS<string[]>(HANDLES_KEY, []);
  if (!handle || known.includes(handle)) return;
  writeLS(HANDLES_KEY, [...known, handle].slice(-8));
}

export function knownHandles(): string[] {
  return readLS<string[]>(HANDLES_KEY, []);
}

export async function sendRequest(p: {
  handle: string;
  name: string;
  email: string;
  nearAccount?: string;
  brief: string;
  title?: string;
  budget: number;
  criteria: Criterion[];
}): Promise<{ id: string; stored: "server" | "local" }> {
  try {
    const r = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (r.ok) {
      const j = (await r.json()) as { id?: string; stored?: string };
      if (j?.id) {
        rememberHandle(p.handle);
        saveLocalRequest({ ...p, id: j.id, createdAt: new Date().toISOString(), status: "new" });
        return { id: j.id, stored: j.stored === "server" ? "server" : "local" };
      }
    }
  } catch {}
  const id = newRequestId();
  saveLocalRequest({ ...p, id, createdAt: new Date().toISOString(), status: "new" });
  return { id, stored: "local" };
}

const handleOk = (h: string) => /^[a-z0-9][a-z0-9-]{1,31}$/.test(h);

export async function myInboxHandles(fallback: string): Promise<string[]> {
  const set = new Set<string>();
  const push = (h?: string) => {
    const v = String(h ?? "").trim().toLowerCase();
    if (handleOk(v)) set.add(v);
  };
  push(fallback);
  knownHandles().forEach(push);
  return [...set];
}

export async function listIncoming(handle: string): Promise<IncomingRequest[]> {
  const handles = await myInboxHandles(handle);
  const local = handles.flatMap((h) => localRequests(h));
  const server: IncomingRequest[] = [];
  for (const h of handles) {
    try {
      const r = await fetch(`/api/requests?handle=${encodeURIComponent(h)}`, { cache: "no-store" });
      if (!r.ok) continue;
      const j = (await r.json()) as { requests?: IncomingRequest[] };
      if (Array.isArray(j.requests)) server.push(...j.requests);
    } catch {}
  }
  const byId = new Map<string, IncomingRequest>();
  for (const r of [...server, ...local]) byId.set(r.id, { ...byId.get(r.id), ...r });
  return [...byId.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function setRequestStatus(id: string, status: IncomingRequest["status"]): Promise<void> {
  updateLocalRequest(id, { status });
  try {
    await fetch("/api/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
  } catch {}
}

export async function loadIncomingById(id: string): Promise<IncomingRequest | null> {
  const locals = knownHandles().flatMap((h) => localRequests(h));
  const hit = locals.find((r) => r.id === id);
  if (hit) return hit;
  try {
    const r = await fetch(`/api/requests?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { request?: IncomingRequest };
      if (j?.request) return j.request;
    }
  } catch {}
  return null;
}

const PRODUCT_HINTS: [RegExp, ProductKind][] = [
  [/\b(reel|video|tiktok|vertical)\b/i, "reel"],
  [/\b(sneaker|shoe|3d|render)\b/i, "shoe"],
  [/\b(photo|foto|image|gambar|retouch|icon)\b/i, "watch"],
  [/\b(logo|brand)\b/i, "candle"],
  [/\b(banner|shop|store|emblem)\b/i, "bag"],
  [/\b(slide|deck|carousel|screen|presentation)\b/i, "mug"],
  [/\b(menu|poster|print)\b/i, "cap"],
  [/\b(illustration|ilustrasi|sticker|nft)\b/i, "bottle"],
  [/\b(copy|write|writing|article|guide|doc|sdk)\b/i, "plant"],
];

export const guessProduct = (text: string): ProductKind =>
  PRODUCT_HINTS.find(([re]) => re.test(text))?.[1] ?? "mug";

export const deriveTitle = (brief: string, title?: string) => {
  if (title && title.trim().length > 2) return title.trim().slice(0, 90);
  const words = brief.replace(/\s+/g, " ").trim().split(" ").slice(0, 7).join(" ");
  return (words.charAt(0).toUpperCase() + words.slice(1)).replace(/[.,;:]$/, "");
};

export function requestAsOrder(r: IncomingRequest): Order {
  const due = new Date(new Date(r.createdAt).getTime() + 14 * 86_400_000);
  const amount = Number(r.budget) || 0;
  const nearAmount = Math.max(0.01, Math.round((amount / 5) * 100) / 100);
  const client: Person = {
    name: r.name,
    nearAccount: r.nearAccount || "client.testnet",
    initials: initials(r.name),
    city: "",
    country: "",
    color: "var(--sky-l)",
  };
  return {
    id: r.id,
    direction: "from_client",
    title: deriveTitle(r.brief, r.title),
    client,
    amount,
    nearAmount,
    currency: "USD",
    due: due.toISOString().slice(0, 10),
    created: String(r.createdAt).slice(0, 10),
    status: "request",
    brief: r.brief,
    criteria: r.criteria,
    accent: "var(--mint)",
    product: guessProduct(`${r.title ?? ""} ${r.brief} ${r.criteria.map((c) => c.label).join(" ")}`),
    termsHash: `sha256:${r.id.toLowerCase().replace(/[^a-z0-9]/g, "")}8a4f2c`,
  };
}

export function saveMyOrder(o: Order) {
  const all = readLS<Order[]>(ORDERS_KEY, []).filter((x) => x.id !== o.id);
  writeLS(ORDERS_KEY, [o, ...all].slice(0, 60));
}

export function myOrder(id: string): Order | null {
  return readLS<Order[]>(ORDERS_KEY, []).find((o) => o.id === id) ?? null;
}

export function myOrders(): Order[] {
  return readLS<Order[]>(ORDERS_KEY, []);
}
export const loadMyOrders = myOrders;
