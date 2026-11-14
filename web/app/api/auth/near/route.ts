import { NextResponse } from "next/server";
import { isValidNearAccountId, NEAR_NETWORK_ID, nearViewAccount } from "@/lib/near";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { accountId?: string };
  const accountId = String(body.accountId ?? "").trim().toLowerCase();

  if (!isValidNearAccountId(accountId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid NEAR account format (example: raka-studio.testnet or alice.near)" },
      { status: 400 }
    );
  }

  // Query live NEAR RPC to verify account existence and balance
  const acct = await nearViewAccount(accountId);
  const nearIdentity = {
    accountId,
    network: NEAR_NETWORK_ID,
    balanceNear: acct ? acct.amountNear : "0.00",
    verifiedOnChain: Boolean(acct),
  };

  const token = signSession(nearIdentity);
  const res = NextResponse.json({
    ok: true,
    session: { mode: "near" as const, near: nearIdentity },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
