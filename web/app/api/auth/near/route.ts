import { NextResponse } from "next/server";
import { isValidNearAccountId, NEAR_NETWORK_ID, nearViewAccount } from "@/lib/near";
import { verifyLoginProof } from "@/lib/nearAuth.server";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/session";
import type { LoginProof } from "@/lib/nearAuth";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/near
 *
 * Two modes:
 *  - `{ accountId, proof }`  → STRICT: the session is only issued when the NEP-413
 *    signature verifies AND the signing key is a live access key of that account.
 *  - `{ accountId }` alone   → legacy claim. Accepted only when
 *    NEARSIGNET_REQUIRE_SIGNATURE is not "1", and the session is marked unverified
 *    so the UI (and any work hand-off) can refuse to trust it.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    accountId?: string;
    proof?: LoginProof;
  };
  const claimed = String(body.proof?.accountId ?? body.accountId ?? "").trim().toLowerCase();

  if (!isValidNearAccountId(claimed)) {
    return NextResponse.json(
      { ok: false, error: "Invalid NEAR account format (example: raka-studio.testnet or alice.near)" },
      { status: 400 }
    );
  }

  const strict = process.env.NEARSIGNET_REQUIRE_SIGNATURE === "1";
  let signatureVerified = false;

  if (body.proof) {
    const outcome = await verifyLoginProof({ ...body.proof, accountId: claimed });
    if (!outcome.ok) {
      return NextResponse.json(
        { ok: false, code: outcome.code, error: outcome.reason },
        { status: 401 }
      );
    }
    signatureVerified = true;
  } else if (strict) {
    return NextResponse.json(
      {
        ok: false,
        code: "SIGNATURE_REQUIRED",
        error:
          "Sign-in now requires a wallet signature so account ids cannot be claimed. Connect Meteor or Nightly and approve the sign-in message.",
      },
      { status: 401 }
    );
  }

  // Query live NEAR RPC to verify account existence and balance
  const acct = await nearViewAccount(claimed);
  const nearIdentity = {
    accountId: claimed,
    network: NEAR_NETWORK_ID,
    balanceNear: acct ? acct.amountNear : "0.00",
    verifiedOnChain: Boolean(acct),
    signatureVerified,
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
