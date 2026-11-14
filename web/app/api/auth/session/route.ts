import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const payload = verifySession(token);
  if (payload) {
    return NextResponse.json({ mode: "near", near: payload.near });
  }
  return NextResponse.json({ mode: "guest" });
}
