/* =========================================================
   NearSignet — real account ownership proof (NEP-413 signMessage).

   Why this exists: the wallet session used to be a *claim* (click Meteor, type an
   account id), so anybody could browse the app as sasam.testnet and take work that
   was never theirs. A NEP-413 message signature is the only thing a wallet can
   produce that nobody else can forge for that account, so every login now has to
   come with one and the server verifies it against the account's on-chain key.

   Wire format (both sides must match byte for byte):
     sha256( borsh(u32 2^31+413) | borsh(string message) | borsh(string recipient)
             | borsh([u8;32] nonce) | borsh(Option<string> callbackUrl) )
   ========================================================= */

export const NEP413_PREFIX = 2 ** 31 + 413;

/** Deterministic text the wallet shows and the server re-hashes. */
export function loginMessage(accountId: string, issuedAt: number): string {
  return [
    `NearSignet wants you to sign in with your NEAR account:`,
    accountId,
    ``,
    `This proves the account is yours. No transaction, no gas, no funds move.`,
    `Issued: ${new Date(issuedAt).toISOString()}`,
  ].join("\n");
}

const text = (s: string) => new TextEncoder().encode(s);

const u32le = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
};

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function borshString(s: string): Uint8Array {
  const bytes = text(s);
  return concat([u32le(bytes.length), bytes]);
}

/** The exact byte payload a wallet signs, minus the sha256 (used by wallet.signMessage). */
export function nep413Payload(
  message: string,
  recipient: string,
  nonce: Uint8Array,
  callbackUrl?: string
): Uint8Array {
  if (nonce.length !== 32) throw new Error("NEP-413 nonce must be exactly 32 bytes");
  return concat([
    u32le(NEP413_PREFIX),
    borshString(message),
    borshString(recipient),
    nonce,
    callbackUrl ? concat([new Uint8Array([1]), borshString(callbackUrl)]) : new Uint8Array([0]),
  ]);
}

export function randomNonce(): Uint8Array {
  const n = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(n);
  else for (let i = 0; i < 32; i++) n[i] = Math.floor(Math.random() * 256);
  return n;
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return typeof btoa !== "undefined" ? btoa(s) : Buffer.from(bytes).toString("base64");
}

export function fromBase64(b64: string): Uint8Array {
  if (typeof atob !== "undefined") {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

export interface SignMessageResult {
  accountId: string;
  publicKey: string;
  signature: string;
  state?: string;
}

export interface LoginProof {
  accountId: string;
  message: string;
  recipient: string;
  nonce: string; // base64
  publicKey: string;
  signature: string; // base64
}

export function buildLoginProof(
  accountId: string,
  recipient: string,
  signed: SignMessageResult,
  message: string,
  nonce: Uint8Array
): LoginProof {
  return {
    accountId: signed.accountId || accountId,
    message,
    recipient,
    nonce: toBase64(nonce),
    publicKey: signed.publicKey,
    signature: signed.signature,
  };
}
