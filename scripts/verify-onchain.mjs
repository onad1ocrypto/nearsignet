#!/usr/bin/env node
/**
 * verify-onchain.mjs — no install, no build, no secrets.
 *
 *   node scripts/verify-onchain.mjs
 *
 * Prints one PASS/FAIL line per claim made in README §3, straight from the chain:
 *  1. the contract account exists and holds WASM
 *  2. the verifier account has exactly one key, scoped to two methods, and 0 FullAccess
 *  3. an escrow settled through the whole flow is SEALED, with a seal id and a verdict
 *  4. the six historical transactions named in the README are all successful
 * Exit code 0 = every line passed.
 */
const RPC = process.env.NEAR_RPC_URL || "https://rpc.testnet.fastnear.com";
const CONTRACT = "nearsignet-protocol.testnet";
const VERIFIER = "verifier.nearsignet-protocol.testnet";
const SETTLED_ORDER = process.env.NSG_SETTLED_ORDER || "NSG-2033";
const TXS = [
  ["contract deploy", "DfkegmyKGXutnFByGXThmJSsdemovXTZA1C33M2oofG5"],
  ["init", "5VpVFYx1eoPaup6F542eNy7vi6gvqaGsZf1Vobw4ZkQE"],
  ["AddKey (scoped verifier)", "7NYp3vQ7qthVy9YHsr75wut3m3zvAUTVyLzDyjkWm3tm"],
  ["create_and_fund_escrow", "EquEciRe5UtZgmCXyksqmnyL3br4rNeK1YUE31fYWkAX"],
  ["submit_verification", "48zAoThDXD31LpRYYFdXY62HVJ39sNgTJGxg3QUJQttn"],
  ["approve_and_release", "6x8XGr4pb8AzDFFFuo7DVYGzfoGts5GxTsVc7qA13x5a"],
];

const post = async (method, params) => {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "verify", method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message || JSON.stringify(j.error)}`);
  return j.result;
};

const results = [];
const check = (label, ok, detail) => {
  results.push({ label, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -- ${detail}` : ""}`);
};

console.log(`NearSignet on-chain verification - RPC ${RPC}\n`);

try {
  const acct = await post("query", { request_type: "view_account", finality: "final", account_id: CONTRACT });
  const code = await post("query", { request_type: "view_code", finality: "final", account_id: CONTRACT });
  const near = (Number(acct.amount) / 1e24).toFixed(2);
  check("contract account exists and holds WASM", Boolean(code.code_base64 || code.hash), `${near} NEAR, code hash ${String(code.hash).slice(0, 10)}...`);
} catch (e) {
  check("contract account exists and holds WASM", false, e.message);
}

try {
  const keys = await post("query", { request_type: "view_access_key_list", finality: "final", account_id: VERIFIER });
  const perms = keys.keys.map((k) => k.access_key.permission);
  const fc = perms.filter((p) => typeof p === "object" && p.FunctionCall).map((p) => p.FunctionCall);
  const fullAccess = perms.filter((p) => p === "FullAccess" || (p && p.FullAccess)).length;
  const methods = fc.flatMap((p) => p.method_names || []).sort();
  const scopedOk = fc.length === 1 && fullAccess === 0 && JSON.stringify(methods) === JSON.stringify(["propose_mediation", "submit_verification"]);
  check("verifier key is scoped and has 0 FullAccess", scopedOk, `methods ${methods.join(", ") || "(none)"} | FullAccess ${fullAccess}`);
} catch (e) {
  check("verifier key is scoped and has 0 FullAccess", false, e.message);
}

try {
  const out = await post("query", {
    request_type: "call_function",
    finality: "final",
    account_id: CONTRACT,
    method_name: "get_escrow",
    args_base64: Buffer.from(JSON.stringify({ order_id: SETTLED_ORDER })).toString("base64"),
  });
  const rec = JSON.parse(Buffer.from(out.result).toString());
  const v = rec.verification || {};
  const ok = rec.status === "SEALED" && Boolean(rec.seal_id) && v.all_passed === true;
  check(`escrow ${SETTLED_ORDER} is SEALED with a seal id`, ok, `${rec.status} | ${rec.seal_id} | ${v.passed_count}/${v.total_count} by ${v.verifier_account}`);
} catch (e) {
  check(`escrow ${SETTLED_ORDER} is SEALED with a seal id`, false, e.message);
}

for (const [label, hash] of TXS) {
  try {
    const tx = await post("tx", { tx_hash: hash, sender_account_id: CONTRACT, wait_until: "FINAL" });
    const success = tx.status?.SuccessValue !== undefined || Boolean(tx.status?.SuccessReceiptId);
    check(`tx ${label}`, success, `${hash.slice(0, 10)}... ${success ? "success" : JSON.stringify(tx.status)}`);
  } catch (e) {
    check(`tx ${label}`, false, e.message.slice(0, 120));
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed${failed ? ` | ${failed} FAILED` : " | every README claim reproduced"}`);
process.exit(failed ? 1 : 0);
