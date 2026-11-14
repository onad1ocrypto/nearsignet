import { NextResponse } from "next/server";
import { getPublishedProfile } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ handle: string }> }
) {
  const { handle } = await ctx.params;
  const profile = await getPublishedProfile(handle);
  if (!profile) return NextResponse.json({ profile: null }, { status: 404 });
  return NextResponse.json({ profile });
}
