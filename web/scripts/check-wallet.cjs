#!/usr/bin/env node
/* =========================================================
   NearSignet — wallet signing invariants (static assertions).
   Guards the regression that broke payments: the wallet was asked to
   sign in with `methodNames: []`, so wallets accepted the connection but
   could not sign any later transaction.

   1. Every contract method the dApp signs is present in WALLET_METHOD_NAMES.
   2. connectNearBrowserWallet never asks for an unscoped (empty) key.
   3. signNearWalletCall re-hydrates a stale session before throwing.
   ========================================================= */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const walletTs = read("lib/wallet.ts");
const orderPage = read("app/(app)/orders/[id]/page.tsx");

const checks = [];
const ok = (name, fn) => {
  fn();
  checks.push(`  ✓ ${name}`);
};

const declared = [...walletTs.matchAll(/"([a-z_]+)"/g)]
  .map((m) => m[1])
  .filter((x) => /_/.test(x))
  .slice(0, 8);

const used = new Set(
  [...orderPage.matchAll(/methodName:\s*"([a-z_]+)"/g)].map((m) => m[1]).filter(Boolean)
);

ok("WALLET_METHOD_NAMES is non-empty and scoped", () => {
  assert.ok(declared.length >= 3, `expected >=3 scoped methods, got ${declared.length}`);
  assert.ok(!declared.includes(""), "must not contain an empty method name");
});

ok("every method the app signs is inside the requested key scope", () => {
  assert.ok(used.size >= 2, `expected >=2 signed methods, found ${[...used].join(",") || "none"}`);
  const missing = [...used].filter((m) => !declared.includes(m));
  assert.deepEqual(missing, [], `methods signed but not scoped: ${missing.join(", ")}`);
});

ok("connectNearBrowserWallet never requests an unscoped key", () => {
  assert.doesNotMatch(walletTs, /signIn\(\{[\s\S]{0,200}?methodNames:\s*\[\s*\]/, "methodNames: [] cannot sign later transactions");
  assert.match(walletTs, /methodNames:\s*\[\.\.\.WALLET_METHOD_NAMES\]/);
});

ok("signNearWalletCall re-hydrates a lost session before failing", () => {
  assert.match(walletTs, /ensureWalletSession/);
  assert.match(walletTs, /Reconnect your NEAR wallet/);
});

ok("order page reports wallet failure reasons in plain language", () => {
  for (const code of ["WALLET_SESSION_MISSING", "REJECTED_IN_WALLET", "KEY_SCOPE_MISMATCH", "INSUFFICIENT_BALANCE"]) {
    assert.ok(orderPage.includes(code), `missing failure narrative: ${code}`);
  }
});

ok("wallet session is remembered across navigations", () => {
  assert.match(walletTs, /nearsignet\.walletId/);
  assert.match(walletTs, /walletSessionHint/);
});

// --- wallet roster: only alive + testnet-capable wallets may ship -------------
ok("wallet roster is exactly Meteor + Nightly (HERE/Sender shut down, Intear/HOT cannot sign testnet)", () => {
  assert.match(walletTs, /export type SupportedWalletId = "meteor-wallet" \| "nightly";/);
  for (const dead of ["here-wallet", "sender", "intear-wallet", "hot-wallet"]) {
    assert.ok(
      !walletTs.includes(`"${dead}"`),
      `dead wallet ${dead} must not appear as a wallet id`
    );
    assert.ok(
      !walletTs.includes(`@near-wallet-selector/${dead}`),
      `dead wallet module ${dead} must not be imported`
    );
  }
  assert.match(walletTs, /modules: \[setupMeteorWallet\(\), setupNightly\(\)\]/);
});

console.log(checks.join("\n"));
console.log(`\n✓ Wallet signing invariants verified (${checks.length}/${checks.length} assertions passed).\n`);
