import { NextRequest, NextResponse } from "next/server";
import { ME_PROFILE_FALLBACK, sanitizeProfile } from "@/lib/profile";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { getMyPublication, publishProfile, storeEnabled } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const accountId = s?.near?.accountId || "raka-studio.testnet";
  const pub = await getMyPublication(accountId);
  return NextResponse.json({ storeEnabled: storeEnabled(), ...pub });
}

export async function POST(req: NextRequest) {
  const s = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const accountId = s?.near?.accountId || "raka-studio.testnet";
  const body = await req.json().catch(() => ({}));
  const clean = sanitizeProfile(body, ME_PROFILE_FALLBACK);
  const res = await publishProfile(accountId, clean);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
