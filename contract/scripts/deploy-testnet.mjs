/**
 * Reproducible NEAR Testnet Deployment Script for NearSignet Escrow.
 *
 * Zero hardcoded secrets: creates fresh Testnet accounts via helper.testnet.near.org
 * or uses NEAR_CONTRACT_ID + NEAR_DEPLOYER_PRIVATE_KEY from environment variables.
 * Never targets mainnet (Q-000 safety rule).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, nearToYocto } from "near-api-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RPC_URL = process.env.NEAR_RPC_URL || "https://rpc.testnet.near.org";
const HELPER_URL = "https://helper.testnet.near.org/account";

if (RPC_URL.includes("mainnet")) {
  throw new Error("Refusing to deploy to mainnet — Testnet only.");
}

async function createTestnetAccount(accountId) {
  const kp = KeyPair.fromRandom("ed25519");
  const res = await fetch(HELPER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: kp.getPublicKey().toString() }),
  });
  if (!res.ok) throw new Error(`Testnet helper failed (${res.status}): ${await res.text()}`);
  return kp;
}

const provider = new JsonRpcProvider({ url: RPC_URL });
const contractId = process.env.NEAR_CONTRACT_ID || `nearsignet-${Date.now().toString(36)}.testnet`;
const kp = process.env.NEAR_DEPLOYER_PRIVATE_KEY
  ? KeyPair.fromString(process.env.NEAR_DEPLOYER_PRIVATE_KEY)
  : await createTestnetAccount(contractId);

console.log(`Deploying WASM to ${contractId}...`);
const account = new Account(contractId, provider, new KeyPairSigner(kp));
const wasm = fs.readFileSync(path.join(__dirname, "../artifacts/nearsignet_escrow.wasm"));

const deployTx = await account.deployContract(wasm);
console.log("Deployed WASM tx:", deployTx.transaction.hash);

const verifierId = `verifier.${contractId}`;
const verifierMaster = KeyPair.fromRandom("ed25519");
const verifierScoped = KeyPair.fromRandom("ed25519");

await account.createAccount(verifierId, verifierMaster.getPublicKey(), nearToYocto("1"));
const verifierAccount = new Account(verifierId, provider, new KeyPairSigner(verifierMaster));

const scopedTx = await verifierAccount.signAndSendTransaction({
  receiverId: verifierId,
  actions: [
    actions.addFunctionCallAccessKey(
      verifierScoped.getPublicKey(),
      contractId,
      ["submit_verification", "propose_mediation"],
      nearToYocto("0.25")
    ),
  ],
});
console.log("Scoped Function-Call Key tx:", scopedTx.transaction.hash);
console.log("Scoped Public Key:", verifierScoped.getPublicKey().toString());

const initTx = await account.callFunction({
  contractId,
  methodName: "init",
  args: { verifier_account: verifierId },
  gas: BigInt("50000000000000"),
});
console.log("Initialized contract tx:", initTx.transaction?.hash ?? "ok");
