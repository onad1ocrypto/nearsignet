#!/usr/bin/env node
/* =========================================================
   NearSignet — Orin Chat grounding assertions.
   Verifies the offline (no-credential) path of the Orin persona:
   1. Answers are anchored to the real contract / verifier account ids.
   2. Out-of-scope questions are refused instead of answered.
   3. A specific escrow question cites that escrow and its failing predicate.
   4. Every reply ships follow-up chips and never leaks a private key.
   Runs against the compiled lib via a tiny TS-to-JS shim (tsx-free).
   ========================================================= */
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".orin-test-build");

function compile() {
  fs.rmSync(OUT, { recursive: true, force: true });
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tsc", "lib/orin.ts", "--outDir", OUT, "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node", "--skipLibCheck", "--esModuleInterop"],
    { cwd: ROOT, stdio: "pipe" }
  );
}

function run() {
  const mod = require(path.join(OUT, "orin.js"));
  let pass = 0;
  const checks = [];
  const ok = (name, fn) => {
    try {
      fn();
      pass++;
      checks.push(`  ✓ ${name}`);
    } catch (e) {
      checks.push(`  ✗ ${name}\n      ${e.message}`);
      throw e;
    }
  };

  const ctx = { lang: "en" };

  ok("scoped-key answer cites the real contract + verifier account", () => {
    const r = mod.localAnswer("How does the scoped key work?", ctx);
    assert.match(r.text, /verifier\.nearsignet-protocol\.testnet/);
    assert.match(r.text, /nearsignet-protocol\.testnet/);
    assert.match(r.text, /attest_verification/);
    assert.match(r.text, /0 FullAccess/);
  });

  ok("out-of-scope questions are refused, not answered", () => {
    for (const q of ["what is the price of bitcoin", "write me a poem", "resep nasi goreng"]) {
      const r = mod.localAnswer(q, ctx);
      assert.match(r.text, /jurisdiction|Outside|超出/, `should refuse: ${q}`);
      assert.doesNotMatch(r.text, /2% of the locked amount/, `should not answer fees: ${q}`);
    }
  });

  ok("escrow question cites that escrow's criteria", () => {
    const r = mod.localAnswer("Tell me about NSG-2052", ctx);
    assert.match(r.text, /NSG-2052/);
    assert.match(r.text, /9:16|1080|duration/i);
  });

  ok("failed-check question names the failing predicate + file", () => {
    const r = mod.localAnswer("Which check failed on NSG-2041?", ctx);
    assert.match(r.text, /RENDER_014\.jpg/);
    assert.match(r.text, /21%/);
    assert.match(r.text, /97%/);
    assert.ok(r.evidence && /NSG-2041/.test(r.evidence));
  });

  ok("sealed escrow answer cites the release tx + real predicate count", () => {
    const r = mod.localAnswer("Why was NSG-2033 released?", ctx);
    assert.match(r.text, /attest_verification/);
    assert.match(r.text, /6x8XGr4pb8AzDFFFuo7DVYGzfoGts5GxTsVc7qA13x5a/);
    assert.match(r.text, /All 2 predicates/, "NSG-2033 has exactly 2 criteria");
    assert.doesNotMatch(r.text, /four predicates/);
  });

  ok("fact sheet carries the attested on-chain run + status legend", () => {
    const sheet = mod.factSheet();
    assert.match(sheet, /7pL3mN9kQ2wX5vB8cR1tY4uI7oP0aS3dF6gH9jK2lZ5x/);
    assert.match(sheet, /18\.032 NEAR paid/);
    assert.match(sheet, /Status legend/);
    assert.match(sheet, /paid = RELEASED/);
  });

  ok("every reply carries follow-up chips", () => {
    const r = mod.localAnswer("hello", ctx);
    assert.ok(r.chips.length >= 3, `expected >=3 chips, got ${r.chips.length}`);
  });

  ok("Indonesian locale answers in Indonesian", () => {
    const r = mod.localAnswer("Bagaimana cara kerja scoped key?", { lang: "id" });
    assert.match(r.text, /Akun verifier|Artinya/);
  });

  ok("fact sheet exposes no private keys", () => {
    const sheet = mod.factSheet();
    assert.doesNotMatch(sheet, /PRIVATE_KEY|private_key|BEGIN [A-Z ]*KEY|secret/i);
    assert.match(sheet, /nearsignet-protocol\.testnet/);
  });

  console.log(checks.join("\n"));
  console.log(`\n✓ Orin chat grounding verified (${pass}/${checks.length} assertions passed).\n`);
  fs.rmSync(OUT, { recursive: true, force: true });
}

try {
  compile();
  run();
} catch (e) {
  console.error("✗ Orin chat verification failed:", e.message);
  process.exit(1);
}
