#!/usr/bin/env node
/* =========================================================
   NearSignet — wallet action serialisation test.

   Regression under guard: `signAndSendTransaction` used to receive near-api-js
   `Action` CLASS INSTANCES (transactions.functionCall(...)). Those serialise to
   `{}` over the wallet bridge, so the wallet received an empty payload and
   displayed no confirmation prompt at all — "connected but nothing happens".

   This test proves:
   1. buildFunctionCallAction produces the selector-native JSON shape.
   2. JSON.stringify survives the bridge with every field intact.
   3. The near-api-js instance shape is the one that loses data (documents why).
   ========================================================= */
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".wallet-test-build");

fs.rmSync(OUT, { recursive: true, force: true });
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["tsc", "lib/wallet.ts", "--outDir", OUT, "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node", "--skipLibCheck", "--esModuleInterop"],
  { cwd: ROOT, stdio: "pipe" }
);

const { buildFunctionCallAction } = require(path.join(OUT, "wallet.js"));

const checks = [];
const ok = (name, fn) => {
  fn();
  checks.push(`  ✓ ${name}`);
};

const gas = "100000000000000";
const deposit = "150000000000000000000000";

ok("action uses the selector-native FunctionCall shape", () => {
  const a = buildFunctionCallAction("approve_and_release", { order_id: "NSG-2041-AB12" }, gas, deposit);
  assert.equal(a.type, "FunctionCall");
  assert.equal(a.params.methodName, "approve_and_release");
  assert.deepEqual(a.params.args, { order_id: "NSG-2041-AB12" });
  assert.equal(a.params.gas, gas);
  assert.equal(a.params.deposit, deposit);
});

ok("action survives JSON serialisation across the wallet bridge", () => {
  const a = buildFunctionCallAction("create_and_fund_escrow", { order_id: "X", criteria_count: 4 }, gas, deposit);
  const round = JSON.parse(JSON.stringify(a));
  assert.deepEqual(round, a, "payload must not degrade to {} when posted to the wallet");
  assert.ok(Object.keys(round.params).length >= 4);
});

ok("gas and deposit are decimal strings, not BigInt/number", () => {
  const a = buildFunctionCallAction("execute_mediation", { order_id: "Y" }, gas, deposit);
  assert.equal(typeof a.params.gas, "string");
  assert.equal(typeof a.params.deposit, "string");
  assert.match(a.params.gas, /^\d+$/);
  assert.match(a.params.deposit, /^\d+$/);
});

ok("near-api-js Action instances are NOT used (they serialise to {})", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/wallet.ts"), "utf8");
  // ignore the explanatory comment line that documents the old bug
  const code = src.split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(code, /transactions\.functionCall\(/, "must not pass near-api-js Action classes to the wallet");
  assert.doesNotMatch(code, /await import\("near-api-js"\)/, "near-api-js actions are no longer needed at signing time");
  assert.match(src, /buildFunctionCallAction/, "must build the selector-native action");
});

ok("signing refuses an empty payload before touching the wallet", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/wallet.ts"), "utf8");
  assert.match(src, /refusing to send an empty payload/);
  assert.match(src, /does not expose signAndSendTransaction/);
});

console.log(checks.join("\n"));
console.log(`\n✓ Wallet action serialisation verified (${checks.length}/${checks.length} assertions passed).\n`);
fs.rmSync(OUT, { recursive: true, force: true });
