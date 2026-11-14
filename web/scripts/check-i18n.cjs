const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const webRoot = path.resolve(__dirname, "..");
const dictSrc = fs.readFileSync(path.join(webRoot, "lib/dict.ts"), "utf8");
const enPart = dictSrc.split("const zh")[0];

const keySet = new Set();
for (const m of enPart.matchAll(/"([^"]+)":\s*"/g)) {
  keySet.add(m[1]);
}

function walk(dir) {
  let out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".next") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

const missing = [];
for (const file of walk(webRoot)) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/\bt\(\s*["']([^"'`$]+)["']/g)) {
    if (!keySet.has(m[1])) {
      missing.push(`${path.relative(webRoot, file)} -> ${m[1]}`);
    }
  }
}

// Also verify all dynamic template expansions explicitly
const requiredDynamic = [
  "lp.m1", "lp.m2", "lp.m3", "lp.m4", "lp.m5", "lp.m6",
  "lp.s1.t", "lp.s2.t", "lp.s3.t", "lp.s4.t",
  "lp.s1.b", "lp.s2.b", "lp.s3.b", "lp.s4.b",
  "si.b1", "si.b2", "si.b3",
  "me.f.x", "me.f.linkedin", "me.f.instagram", "me.f.website",
  "theme.obsidian", "theme.titanium", "theme.daylight",
  "status.request", "status.awaiting_payment", "status.in_escrow",
  "status.verifying", "status.revision", "status.review", "status.paid", "status.declined",
];
for (const k of requiredDynamic) {
  if (!keySet.has(k)) missing.push(`dynamic -> ${k}`);
}

assert.equal(missing.length, 0, `Missing dictionary keys:\n${missing.join("\n")}`);
console.log(`✓ All i18n dictionary keys verified (${keySet.size} keys, 0 missing).`);
