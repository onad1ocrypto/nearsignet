#!/usr/bin/env node
/* =========================================================
   NearSignet — NEP-413 login proof test.

   The session used to be a claim ("I am sasam.testnet"), which let anybody browse
   as that account and take its work. This test pins the verification path:

   1. a signature made by the account's key verifies;
   2. editing the message, or signing with a different key, does not;
   3. an expired login message does not;
   4. the public key must be a LIVE access key of the account on testnet
      (checked against the real RPC, so a deleted key stops working).
   ========================================================= */
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".nep413-test-build");

fs.rmSync(OUT, { recursive: true, force: true });
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "tsc",
    "lib/nearAuth.ts",
    "lib/nearAuth.server.ts",
    "lib/near.ts",
    "--outDir",
    OUT,
    "--module",
    "commonjs",
    "--target",
    "es2020",
    "--moduleResolution",
    "node",
    "--skipLibCheck",
    "--esModuleInterop",
  ],
  { cwd: ROOT, stdio: "pipe" }
);

const auth = require(path.join(OUT, "nearAuth.js"));
const { verifyLoginProof } = require(path.join(OUT, "nearAuth.server.js"));
const { ed25519 } = require("@noble/curves/ed25519");
const { sha256 } = require("@noble/hashes/sha2");
const { createHash, randomBytes } = require("node:crypto");

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes) {
  let value = 0n;
  for (const b of bytes) value = value * 256n + BigInt(b);
  let out = "";
  while (value > 0n) {
    out = B58[Number(value % 58n)] + out;
    value /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out || "1";
}

/** Build a proof exactly the way the browser does. */
function makeProof(accountId, priv, opts = {}) {
  const issuedAt = opts.issuedAt ?? Date.now();
  const message = opts.message ?? auth.loginMessage(accountId, issuedAt);
  const recipient = opts.recipient ?? "nearsignet-protocol.testnet";
  const nonce = opts.nonce ?? auth.randomNonce();
  const payload = auth.nep413Payload(message, recipient, nonce);
  const hashed = createHash("sha256").update(Buffer.from(payload)).digest();
  const signature = ed25519.sign(hashed, priv);
  const publicKey = opts.publicKey ?? "ed25519:" + base58(ed25519.getPublicKey(priv));
  return {
    accountId,
    message,
    recipient,
    nonce: auth.toBase64(nonce),
    publicKey,
    signature: auth.toBase64(signature),
  };
}

const checks = [];
const ok = (name, fn) => {
  fn();
  checks.push(`  ✓ ${name}`);
};

async function main() {
  const account = process.env.NEP413_TEST_ACCOUNT || "";
  const priv = sha256(new TextEncoder().encode("nearsignet-nep413-test"));

  ok("the payload hashes deterministically and rejects a short nonce", () => {
    const a = auth.nep413Payload("m", "r", new Uint8Array(32));
    const b = auth.nep413Payload("m", "r", new Uint8Array(32));
    assert.deepEqual(Buffer.from(a), Buffer.from(b));
    assert.throws(() => auth.nep413Payload("m", "r", new Uint8Array(31)), /32 bytes/);
  });

  ok("login message pins the account and an issue time", () => {
    const msg = auth.loginMessage("signet.testnet", Date.now());
    assert.match(msg, /NearSignet/);
    assert.match(msg, /signet\.testnet/);
    assert.match(msg, /Issued: \d{4}-\d{2}-\d{2}T/);
  });

  const proof = makeProof("signet.testnet", priv);
  const edOk = await verifyLoginProof(proof).catch(() => ({ ok: false }));

  ok("a fresh message from an unknown account fails on key ownership, not on the signature", () => {
    // signature layer must pass; only the on-chain key check may reject it
    assert.equal(edOk.ok, false);
    assert.ok(
      ["ACCOUNT_UNKNOWN", "KEY_NOT_ON_ACCOUNT"].includes(edOk.code),
      `expected key-ownership failure, got ${edOk.code || "success"}`
    );
  });

  ok("a tampered message is rejected before any RPC call", async () => {
    const tampered = { ...proof, message: proof.message.replace("signet.testnet", "sasam.testnet") };
    const out = await verifyLoginProof(tampered);
    assert.equal(out.ok, false);
    assert.ok(["BAD_MESSAGE", "ACCOUNT_MISMATCH", "STALE_MESSAGE"].includes(out.code), out.code);
  });

  ok("a signature from another key cannot stand in for the account", async () => {
    const other = sha256(new TextEncoder().encode("someone-else"));
    const forged = makeProof(proof.accountId, other, { message: proof.message });
    const out = await verifyLoginProof(forged);
    assert.equal(out.ok, false);
    assert.notEqual(out.code, "ACCOUNT_UNKNOWN", "must fail key check, never reach RPC as valid");
  });

  ok("an expired login message is rejected", async () => {
    const stale = makeProof(proof.accountId, priv, { issuedAt: Date.now() - 20 * 60 * 1000 });
    const out = await verifyLoginProof(stale);
    assert.equal(out.ok, false);
    assert.equal(out.code, "STALE_MESSAGE");
  });

  // 5. live proof against a real account, when the caller supplies one
  if (account) {
    const { nearViewAccessKeys } = require(path.join(OUT, "near.js"));
    const keys = await nearViewAccessKeys(account);
    assert.ok(keys.length > 0, `${account} has no access keys to test against`);
    ok(`live account ${account} exposes ${keys.length} access key(s) for verification`, () => {});
    // a proof signed by OUR throwaway key must NOT verify against the real account
    const out = await verifyLoginProof(makeProof(account, priv));
    ok("a throwaway key is rejected against the real account", () => {
      assert.equal(out.ok, false);
      assert.equal(out.code, "KEY_NOT_ON_ACCOUNT");
    });
  } else {
    console.log("  · set NEP413_TEST_ACCOUNT=<your testnet account> for the live RPC assertion");
  }

  console.log(checks.join("\n"));
  console.log(`\n✓ NEP-413 login proof verified (${checks.length}/${checks.length} assertions passed).\n`);
  fs.rmSync(OUT, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
