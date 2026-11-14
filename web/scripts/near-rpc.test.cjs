const assert = require("node:assert/strict");

const CONTRACT_ID = process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID || "nearsignet-protocol.testnet";
const VERIFIER_ID = process.env.NEXT_PUBLIC_NEAR_VERIFIER_ID || `verifier.${CONTRACT_ID}`;

const RPC_URLS = [
  process.env.NEAR_RPC_URL || process.env.NEXT_PUBLIC_NEAR_RPC_URL,
  "https://rpc.testnet.fastnear.com",
  "https://testnet.rpc.near.org",
  "https://free.rpc.fastnear.com",
].filter(Boolean);

async function nearRpc(method, params) {
  let lastErr;
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "test", method, params }),
      });
      const json = await res.json();
      if (json.error) throw new Error(JSON.stringify(json.error));
      return json.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function viewCall(accountId, methodName, args = {}) {
  const res = await nearRpc("query", {
    request_type: "call_function",
    finality: "final",
    account_id: accountId,
    method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(res.result).toString("utf8"));
}

(async () => {
  console.log(`Testing live NEAR Testnet contract ${CONTRACT_ID}...`);

  const stats = await viewCall(CONTRACT_ID, "get_stats");
  assert.equal(stats.verifier_agent, VERIFIER_ID);
  assert.ok(stats.total_orders >= 1, `Expected at least 1 anchored escrow on ${CONTRACT_ID}`);
  assert.ok(stats.total_sealed_count >= 1, `Expected at least 1 SEALED escrow on ${CONTRACT_ID}`);

  const order = await viewCall(CONTRACT_ID, "get_escrow", { order_id: "NSG-2033" });
  assert.ok(order, `Expected NSG-2033 on ${CONTRACT_ID}`);
  assert.equal(order.status, "SEALED");
  assert.equal(order.verification.passed_count, 2);
  assert.ok(order.seal_id.startsWith("SEAL-NSG-2033-"));

  // Verify that verifier.<contract> has ZERO FullAccess keys and ONLY a Scoped FunctionCall key!
  const keys = await nearRpc("query", {
    request_type: "view_access_key_list",
    finality: "final",
    account_id: VERIFIER_ID,
  });
  const fullAccess = keys.keys.filter((k) => k.access_key.permission === "FullAccess");
  assert.equal(fullAccess.length, 0, `Expected 0 FullAccess keys on ${VERIFIER_ID}`);

  const scoped = keys.keys.find(
    (k) =>
      k.access_key.permission !== "FullAccess" &&
      k.access_key.permission.FunctionCall.receiver_id === CONTRACT_ID
  );
  assert.ok(scoped, `Expected Scoped FunctionCall Access Key on ${VERIFIER_ID}`);
  assert.deepEqual(
    scoped.access_key.permission.FunctionCall.method_names,
    ["submit_verification", "propose_mediation"]
  );

  console.log("✓ Live NEAR Testnet RPC + Zero-FullAccess Scoped Function-Call Key assertions passed!");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
