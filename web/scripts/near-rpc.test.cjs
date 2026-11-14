const assert = require("node:assert/strict");

async function nearRpc(method, params) {
  const res = await fetch("https://rpc.testnet.near.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "test", method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
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
  console.log("Testing live NEAR Testnet contract nearsignet.testnet...");

  const stats = await viewCall("nearsignet.testnet", "get_stats");
  assert.equal(stats.verifier_agent, "verifier.nearsignet.testnet");
  assert.ok(stats.total_orders >= 1, "Expected at least 1 anchored escrow on nearsignet.testnet");
  assert.ok(stats.total_sealed_count >= 1, "Expected at least 1 SEALED escrow on nearsignet.testnet");

  const order = await viewCall("nearsignet.testnet", "get_escrow", { order_id: "NSG-2033" });
  assert.ok(order, "Expected NSG-2033 on nearsignet.testnet");
  assert.equal(order.status, "SEALED");
  assert.equal(order.verification.passed_count, 2);
  assert.equal(order.seal_id, "SEAL-NSG-2033-034003");

  const keys = await nearRpc("query", {
    request_type: "view_access_key_list",
    finality: "final",
    account_id: "nearsignet.testnet",
  });
  const scoped = keys.keys.find(
    (k) =>
      k.access_key.permission !== "FullAccess" &&
      k.access_key.permission.FunctionCall.receiver_id === "nearsignet.testnet"
  );
  assert.ok(scoped, "Expected Scoped FunctionCall Access Key on verifier.nearsignet.testnet");
  assert.deepEqual(
    scoped.access_key.permission.FunctionCall.method_names,
    ["submit_verification", "propose_mediation"]
  );

  console.log("✓ Live NEAR Testnet RPC + Scoped Function-Call Access Key assertions passed!");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
