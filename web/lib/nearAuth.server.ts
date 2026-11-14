/* =========================================================
   Server-side verification of a NEP-413 login proof.

   A signature is only worth something if the key that made it belongs to the
   account right now, so verification is two steps:
     1. the signature must validate against the public key the wallet reported
     2. that public key must exist in the account's on-chain access-key set
   (step 2 also means a leaked signature from a key the owner has since deleted
   stops working).
   ========================================================= */

import { createHash } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { nearViewAccessKeys } from "./near";
import { fromBase64, loginMessage, nep413Payload, type LoginProof } from "./nearAuth";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type VerifyOutcome =
  | { ok: true; accountId: string; publicKey: string }
  | { ok: false; code: string; reason: string };

/**
 * The wallet may report `ed25519:<base58>`; older/other wallets use base58 without
 * the prefix. Normalise to the 32 raw bytes + curve name.
 */
function parsePublicKey(publicKey: string): { curve: "ed25519" | "secp256k1"; bytes: Uint8Array } | null {
  const [maybeCurve, maybeKey] = publicKey.includes(":") ? publicKey.split(":") : ["ed25519", publicKey];
  const curve = (maybeCurve || "ed25519").toLowerCase();
  if (curve !== "ed25519" && curve !== "secp256k1") return null;
  const encoded = maybeKey || "";
  // NEAR public keys are base58; a base64 fallback keeps us tolerant of wallet quirks.
  const bytes = /^[1-9A-HJ-NP-Za-km-z]{32,}$/.test(encoded) ? base58Decode(encoded) : fromBase64(encoded);
  return { curve, bytes };
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(input: string): Uint8Array {
  let value = 0n;
  for (const ch of input) {
    const idx = B58.indexOf(ch);
    if (idx < 0) throw new Error("invalid base58");
    value = value * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value % 256n));
    value /= 256n;
  }
  for (const ch of input) {
    if (ch !== "1") break;
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}

export async function verifyLoginProof(proof: LoginProof): Promise<VerifyOutcome> {
  const accountId = String(proof?.accountId || "").trim().toLowerCase();
  if (!accountId) return { ok: false, code: "NO_ACCOUNT", reason: "accountId missing" };

  // 1. The message must be one we would have written, for this account, recently.
  const issued = /Issued: (.+)$/m.exec(proof.message || "")?.[1];
  const issuedAt = issued ? Date.parse(issued) : NaN;
  if (!Number.isFinite(issuedAt)) return { ok: false, code: "BAD_MESSAGE", reason: "message has no issue time" };
  if (Math.abs(Date.now() - issuedAt) > MAX_CLOCK_SKEW_MS) {
    return { ok: false, code: "STALE_MESSAGE", reason: "login message expired — sign again" };
  }
  if ((proof.message || "").toLowerCase().indexOf(accountId) === -1) {
    return { ok: false, code: "ACCOUNT_MISMATCH", reason: "signed message does not name this account" };
  }
  if (loginMessage(accountId, issuedAt) !== proof.message) {
    return { ok: false, code: "BAD_MESSAGE", reason: "message is not a NearSignet login message" };
  }

  // 2. Signature over the exact NEP-413 hash.
  const key = parsePublicKey(proof.publicKey || "");
  if (!key) return { ok: false, code: "BAD_KEY", reason: "unreadable public key" };
  if (key.curve !== "ed25519") {
    return { ok: false, code: "UNSUPPORTED_KEY", reason: "only ed25519 wallet keys can sign in here" };
  }
  if (key.bytes.length !== 32) return { ok: false, code: "BAD_KEY", reason: "public key must be 32 bytes" };

  const payload = nep413Payload(proof.message, proof.recipient, fromBase64(proof.nonce));
  const hashed = createHash("sha256").update(Buffer.from(payload)).digest();
  const signature = fromBase64(proof.signature || "");
  if (signature.length !== 64) return { ok: false, code: "BAD_SIGNATURE", reason: "signature must be 64 bytes" };

  let valid = false;
  try {
    valid = ed25519.verify(signature, hashed, key.bytes);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, code: "BAD_SIGNATURE", reason: "signature does not match the key" };

  // 3. That key must be one of the account's live access keys on testnet.
  const keys = await nearViewAccessKeys(accountId).catch(() => []);
  if (!keys.length) {
    return { ok: false, code: "ACCOUNT_UNKNOWN", reason: `no on-chain access keys found for ${accountId}` };
  }
  const normalised = normaliseKey(proof.publicKey);
  const onChain = keys.some((k) => normaliseKey(k.publicKey) === normalised);
  if (!onChain) {
    return {
      ok: false,
      code: "KEY_NOT_ON_ACCOUNT",
      reason: `${proof.publicKey.slice(0, 16)}… is not a current access key of ${accountId}`,
    };
  }

  return { ok: true, accountId, publicKey: proof.publicKey };
}

function normaliseKey(k: string): string {
  const raw = k.includes(":") ? k.split(":")[1] : k;
  try {
    return Buffer.from(base58Decode(raw)).toString("hex");
  } catch {
    return raw;
  }
}
