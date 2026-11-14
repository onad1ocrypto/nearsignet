/* =========================================================
   Server-side HMAC-signed HttpOnly session cookies for NearSignet.
   Stores verified NEAR Testnet/Mainnet account identity without
   requiring any external database or ever touching private keys.
   ========================================================= */

import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "nearsignet_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface NearIdentity {
  accountId: string;
  network: string;
  balanceNear: string;
  verifiedOnChain: boolean;
}

export interface SessionPayload {
  mode: "near";
  near: NearIdentity;
  iat: number;
}

const secret = () => process.env.AUTH_SECRET || "nearsignet-dev-hmac-secret";

const sign = (body: string) =>
  createHmac("sha256", secret()).update(body).digest("base64url");

function verifySignature(token: string | undefined): unknown | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function signSession(near: NearIdentity): string {
  const payload: SessionPayload = { mode: "near", near, iat: Date.now() };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySession(token: string | undefined): SessionPayload | null {
  const p = verifySignature(token) as SessionPayload | null;
  if (!p || p.mode !== "near" || !p.near?.accountId) return null;
  return p;
}
