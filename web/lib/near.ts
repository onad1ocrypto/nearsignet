/* =========================================================
   NearSignet — Core NEAR Protocol RPC, Contract & Intents Layer
   Connects directly to NEAR Testnet (`https://rpc.testnet.near.org`)
   and the deployed `nearsignet-protocol.testnet` smart contract.
   ========================================================= */

import { createHash } from "node:crypto";

export const NEAR_NETWORK_ID =
  process.env.NEXT_PUBLIC_NEAR_NETWORK_ID || process.env.NEXT_PUBLIC_NEAR_NETWORK || "testnet";
/* `rpc.testnet.near.org` returned -429 DEPRECATED in Nov 2026, so the default is the
   FastNEAR public endpoint (same JSON-RPC contract) with automatic failover below. */
export const NEAR_RPC_URL =
  process.env.NEAR_RPC_URL ||
  process.env.NEXT_PUBLIC_NEAR_RPC_URL ||
  (NEAR_NETWORK_ID === "mainnet" ? "https://free.rpc.fastnear.com" : "https://rpc.testnet.fastnear.com");

export const NEAR_RPC_FALLBACKS: string[] = (
  NEAR_NETWORK_ID === "mainnet"
    ? [NEAR_RPC_URL, "https://rpc.mainnet.fastnear.com", "https://free.rpc.fastnear.com"]
    : [NEAR_RPC_URL, "https://testnet.rpc.near.org", "https://free.rpc.fastnear.com"]
).filter((u, i, a) => a.indexOf(u) === i);
export const NEAR_CONTRACT_ID =
  process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID || "nearsignet-protocol.testnet";
export const NEAR_VERIFIER_ID =
  process.env.NEXT_PUBLIC_NEAR_VERIFIER_ID || `verifier.${NEAR_CONTRACT_ID}`;
/**
 * Display label for the platform's freelancer side. The on-chain account is the
 * relayer's own testnet sub-account, so we never show it as a third party's name.
 */
export const NEAR_FREELANCER_LABEL = "NearSignet Freelancer · relayer";
export const NEAR_FREELANCER_DEFAULT =
  process.env.NEXT_PUBLIC_NEAR_FREELANCER_ID || `raka.${NEAR_CONTRACT_ID}`;
export const NEAR_CLIENT_DEFAULT =
  process.env.NEXT_PUBLIC_NEAR_CLIENT_ID || `liam.${NEAR_CONTRACT_ID}`;
export const NEAR_EXPLORER_URL =
  NEAR_NETWORK_ID === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";
export const METEOR_WALLET_URL = "https://wallet.meteorwallet.app";

/** Real verified NEAR Testnet deployment hashes recorded on `nearsignet-protocol.testnet`. */
export const LIVE_TESTNET_ARTIFACTS = {
  contractAccount: "nearsignet-protocol.testnet",
  verifierAccount: "verifier.nearsignet-protocol.testnet",
  freelancerAccount: "raka.nearsignet-protocol.testnet",
  clientAccount: "liam.nearsignet-protocol.testnet",
  scopedAgentPublicKey: "ed25519:D31UDCjgL8S7o8QJUXTYQ2KR1N5CVyvwYhh9MjjUAKEP",
  txHashes: {
    deployContract: "DfkegmyKGXutnFByGXThmJSsdemovXTZA1C33M2oofG5",
    createVerifierSubaccount: "AGsw2jpbzpsxEsENMdPGLE5q2QLyEycTiHYPMh4PD3Uw",
    addScopedFunctionCallKey: "7NYp3vQ7qthVy9YHsr75wut3m3zvAUTVyLzDyjkWm3tm",
    initContract: "5VpVFYx1eoPaup6F542eNy7vi6gvqaGsZf1Vobw4ZkQE",
    sampleFund2033: "EquEciRe5UtZgmCXyksqmnyL3br4rNeK1YUE31fYWkAX",
    sampleVerify2033: "48zAoThDXD31LpRYYFdXY62HVJ39sNgTJGxg3QUJQttn",
    sampleSeal2033: "6x8XGr4pb8AzDFFFuo7DVYGzfoGts5GxTsVc7qA13x5a",
  },
} as const;

export const NEAR_ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function isValidNearAccountId(id: string): boolean {
  const s = (id || "").trim().toLowerCase();
  if (s.length < 2 || s.length > 64) return false;
  if (/^[0-9a-f]{64}$/.test(s)) return true;
  return NEAR_ACCOUNT_RE.test(s);
}

export function sha256Tag(payload: unknown): string {
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
  return `sha256:${createHash("sha256").update(raw).digest("hex").slice(0, 16)}`;
}

export function usdToNear(usd: number, rate = 5.0): number {
  return Math.max(0.01, Math.round((usd / rate) * 100) / 100);
}

/**
 * Testnet realities: the NEAR faucet hands out ~1.5 NEAR, so an escrow demo must
 * fit inside that pocket. Deposits are therefore capped well below the faucet
 * amount and floored at the contract minimum (0.01 NEAR).
 */
export const MY_NEAR_ALLOWANCE = 1.5;
export const ESCROW_DEPOSIT_MIN = 0.05;
export const ESCROW_DEPOSIT_MAX = 0.1; // faucet gives 1.5 NEAR → never lock more than a tenth

/** Small, faucet-friendly escrow deposit for a given USD demo amount. */
export function demoDepositNear(usd: number): number {
  const raw = Math.round((usd / 1000) * 100) / 100;
  const clamped = Math.min(ESCROW_DEPOSIT_MAX, Math.max(ESCROW_DEPOSIT_MIN, raw));
  return Math.round(clamped * 100) / 100;
}

/**
 * Who is looking at this escrow? The payer (client) locks the money and approves
 * the release; the freelancer does the work. On a funded escrow the payer provably
 * differs from the freelancer, so a guest is treated as the worker — otherwise the
 * demo would offer "Deliver work" to the person who just locked the funds.
 */
export function viewerRole(
  escrow: { client?: string } | null | undefined,
  mySessionAccount: string | undefined,
  freelancer: string | undefined
): "client" | "freelancer" {
  const acct = String(escrow?.client || "").toLowerCase();
  const mine = String(mySessionAccount || "").toLowerCase();
  const work = String(freelancer || "").toLowerCase();
  if (acct && mine && acct === mine) return "client";
  if (acct && work && acct !== work) return "freelancer";
  return "client";
}

/** Deposit actually attached when a wallet signs create_and_fund_escrow. */
export function lockDepositNear(nearAmount: number | string | undefined): number {
  const n = Number(nearAmount);
  if (!Number.isFinite(n) || n <= 0) return 0.1;
  const clamped = Math.min(ESCROW_DEPOSIT_MAX, Math.max(ESCROW_DEPOSIT_MIN, n));
  return Math.round(clamped * 100) / 100;
}

export function nearToYocto(nearAmt: number | string): string {
  const [whole = "0", frac = ""] = String(nearAmt).split(".");
  const padded = (frac + "0".repeat(24)).slice(0, 24);
  const raw = (BigInt(whole || "0") * 10n ** 24n + BigInt(padded)).toString();
  return raw;
}

export function yoctoToNear(yocto: string, digits = 2): string {
  try {
    const v = BigInt(yocto || "0");
    const whole = v / 10n ** 24n;
    const rem = v % 10n ** 24n;
    const frac = rem.toString().padStart(24, "0").slice(0, digits);
    return digits > 0 ? `${whole.toString()}.${frac}` : whole.toString();
  } catch {
    return "0.00";
  }
}

async function nearRpcOnce<T>(url: string, method: string, params: Record<string, unknown>, timeoutMs: number): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "nearsignet", method, params }),
      cache: "no-store",
      signal: ctl.signal,
    });
    const json = (await res.json()) as { result?: T; error?: { message?: string; data?: unknown } };
    if (!res.ok || json.error || !json.result) {
      throw new Error(json.error?.message || `NEAR RPC ${method} failed (${res.status})`);
    }
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resilient JSON-RPC with provider failover. The public `rpc.testnet.near.org`
 * endpoint now answers -429 "DEPRECATED", which silently broke account balance
 * lookups (and therefore login + fee checks) — so every RPC call walks the
 * NEAR_RPC_FALLBACKS chain instead of trusting a single host.
 */
async function nearRpc<T>(method: string, params: Record<string, unknown>, timeoutMs = 8000): Promise<T> {
  let lastErr: unknown = null;
  for (const url of NEAR_RPC_FALLBACKS) {
    try {
      return await nearRpcOnce<T>(url, method, params, timeoutMs);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`NEAR RPC ${method} failed on all providers`);
}

export interface NearAccountView {
  accountId: string;
  amountYocto: string;
  amountNear: string;
  codeHash: string;
  hasContract: boolean;
  storageUsage: number;
}

export async function nearViewAccount(accountId: string): Promise<NearAccountView | null> {
  const clean = accountId.trim().toLowerCase();
  if (!isValidNearAccountId(clean)) return null;
  try {
    const r = await nearRpc<{
      amount: string;
      code_hash: string;
      storage_usage: number;
    }>("query", {
      request_type: "view_account",
      finality: "final",
      account_id: clean,
    });
    return {
      accountId: clean,
      amountYocto: r.amount,
      amountNear: yoctoToNear(r.amount, 2),
      codeHash: r.code_hash,
      hasContract: r.code_hash !== "11111111111111111111111111111111",
      storageUsage: r.storage_usage,
    };
  } catch {
    return null;
  }
}

export interface AccessKeySummary {
  publicKey: string;
  kind: "FullAccess" | "FunctionCall";
  receiverId?: string;
  methodNames?: string[];
  allowanceNear?: string;
}

export async function nearViewAccessKeys(accountId = NEAR_VERIFIER_ID): Promise<AccessKeySummary[]> {
  try {
    const r = await nearRpc<{
      keys: {
        public_key: string;
        access_key: {
          permission:
            | "FullAccess"
            | {
                FunctionCall: {
                  allowance: string | null;
                  receiver_id: string;
                  method_names: string[];
                };
              };
        };
      }[];
    }>("query", {
      request_type: "view_access_key_list",
      finality: "final",
      account_id: accountId,
    });
    return (r.keys || []).map((k) => {
      if (k.access_key.permission === "FullAccess") {
        return { publicKey: k.public_key, kind: "FullAccess" as const };
      }
      const fc = k.access_key.permission.FunctionCall;
      return {
        publicKey: k.public_key,
        kind: "FunctionCall" as const,
        receiverId: fc.receiver_id,
        methodNames: fc.method_names,
        allowanceNear: fc.allowance ? yoctoToNear(fc.allowance, 2) : "unlimited",
      };
    });
  } catch {
    return [];
  }
}

export async function nearCallView<T>(
  methodName: string,
  args: Record<string, unknown> = {},
  contractId = NEAR_CONTRACT_ID
): Promise<T | null> {
  try {
    const argsBase64 = Buffer.from(JSON.stringify(args), "utf8").toString("base64");
    const r = await nearRpc<{ result: number[]; block_height: number }>("query", {
      request_type: "call_function",
      finality: "final",
      account_id: contractId,
      method_name: methodName,
      args_base64: argsBase64,
    });
    const decoded = Buffer.from(r.result).toString("utf8");
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

export const relayerConfigured = () =>
  Boolean(process.env.NEAR_SIGNER_ACCOUNT_ID && process.env.NEAR_SIGNER_PRIVATE_KEY);

export const verifierConfigured = () =>
  Boolean(process.env.NEAR_VERIFIER_SCOPED_KEY);

export const freelancerRelayerConfigured = () =>
  Boolean(process.env.NEAR_FREELANCER_ACCOUNT_ID && process.env.NEAR_FREELANCER_PRIVATE_KEY);

export async function nearRelayerCall({
  signerId,
  privateKey,
  methodName,
  args,
  attachedDepositYocto = "0",
  gas = "80000000000000",
}: {
  signerId?: string;
  privateKey?: string;
  methodName: string;
  args: Record<string, unknown>;
  attachedDepositYocto?: string;
  gas?: string;
}): Promise<{ txHash: string; explorerUrl: string }> {
  const nearAPI = await import("near-api-js");
  const accountId = signerId || process.env.NEAR_SIGNER_ACCOUNT_ID || "";
  const secret = privateKey || process.env.NEAR_SIGNER_PRIVATE_KEY || "";
  if (!accountId || !secret) throw new Error("NEAR relayer credentials not configured");

  const keyStore = new nearAPI.keyStores.InMemoryKeyStore();
  await keyStore.setKey(NEAR_NETWORK_ID, accountId, nearAPI.KeyPair.fromString(secret as `ed25519:${string}`));
  const near = await nearAPI.connect({ networkId: NEAR_NETWORK_ID, keyStore, nodeUrl: NEAR_RPC_URL });
  const account = await near.account(accountId);

  const outcome = await account.functionCall({
    contractId: NEAR_CONTRACT_ID,
    methodName,
    args,
    gas: BigInt(gas),
    attachedDeposit: BigInt(attachedDepositYocto),
  });
  const txHash = outcome.transaction.hash;
  return { txHash, explorerUrl: `${NEAR_EXPLORER_URL}/txns/${txHash}` };
}

/**
 * Signs `submit_verification` or `propose_mediation` LIVE ON-CHAIN using ONLY the
 * Scoped Function-Call Access Key on `verifier.<contract>` (0 FullAccess keys!).
 */
export async function nearScopedVerifierCall({
  methodName,
  args,
  gas = "60000000000000",
}: {
  methodName: "submit_verification" | "propose_mediation";
  args: Record<string, unknown>;
  gas?: string;
}): Promise<{ txHash: string; explorerUrl: string }> {
  const secret = process.env.NEAR_VERIFIER_SCOPED_KEY || "";
  if (!secret) throw new Error("NEAR_VERIFIER_SCOPED_KEY not configured");
  return nearRelayerCall({
    signerId: NEAR_VERIFIER_ID,
    privateKey: secret,
    methodName,
    args,
    attachedDepositYocto: "0",
    gas,
  });
}

/**
 * Recycles sandbox payout from demo freelancer back to demo client relayer so the
 * Judge Sandbox Testnet pool never depletes across hundreds of live judge runs.
 */
export async function recycleSandboxNear(amountNear = "0.09"): Promise<void> {
  if (!freelancerRelayerConfigured() || !relayerConfigured()) return;
  try {
    const nearAPI = await import("near-api-js");
    const fromId = process.env.NEAR_FREELANCER_ACCOUNT_ID!;
    const fromKey = process.env.NEAR_FREELANCER_PRIVATE_KEY!;
    const toId = process.env.NEAR_SIGNER_ACCOUNT_ID!;
    const keyStore = new nearAPI.keyStores.InMemoryKeyStore();
    await keyStore.setKey(NEAR_NETWORK_ID, fromId, nearAPI.KeyPair.fromString(fromKey as `ed25519:${string}`));
    const near = await nearAPI.connect({ networkId: NEAR_NETWORK_ID, keyStore, nodeUrl: NEAR_RPC_URL });
    const acct = await near.account(fromId);
    await acct.sendMoney(toId, BigInt(nearToYocto(amountNear)));
  } catch {
    /* non-critical background recycle */
  }
}

export interface IntentsQuoteResult {
  originChain: string;
  originToken: string;
  originAmount: string;
  destinationAmountNear: string;
  destinationContract: string;
  estimatedSeconds: number;
  route: string;
  source: "intents-1click" | "reference-quote";
}

const ORIGIN_DECIMALS: Record<string, { assetId: string; chain: string; symbol: string; priceUsd: number; decimals: number }> = {
  "usdc-base": {
    assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
    chain: "Base",
    symbol: "USDC",
    priceUsd: 1.0,
    decimals: 6,
  },
  "usdc-arb": {
    assetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
    chain: "Arbitrum",
    symbol: "USDC",
    priceUsd: 1.0,
    decimals: 6,
  },
  "usdc-sol": {
    assetId: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near",
    chain: "Solana",
    symbol: "USDC",
    priceUsd: 1.0,
    decimals: 6,
  },
  "usdt-arb": {
    assetId: "nep141:arb-0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9.omft.near",
    chain: "Arbitrum",
    symbol: "USDT",
    priceUsd: 1.0,
    decimals: 6,
  },
  "eth-base": {
    assetId: "nep141:base.omft.near",
    chain: "Base",
    symbol: "ETH",
    priceUsd: 3000,
    decimals: 18,
  },
  "near-native": {
    assetId: "nep141:wrap.near",
    chain: "NEAR",
    symbol: "NEAR",
    priceUsd: 5,
    decimals: 24,
  },
};

export async function getCrossChainIntentsQuote(originKey: string, usdAmount: number, recipientAccount = "raka-studio.near"): Promise<IntentsQuoteResult> {
  const meta = ORIGIN_DECIMALS[originKey] || ORIGIN_DECIMALS["usdc-base"];
  const nearAmt = usdToNear(usdAmount);
  const tokenAmt = usdAmount / meta.priceUsd;
  const formattedOrigin = `${tokenAmt.toFixed(meta.priceUsd >= 100 ? 4 : 2)} ${meta.symbol}`;
  if (meta.symbol === "NEAR") {
    return {
      originChain: "NEAR",
      originToken: "NEAR",
      originAmount: `${nearAmt.toFixed(2)} NEAR`,
      destinationAmountNear: `${nearAmt.toFixed(2)} NEAR`,
      destinationContract: NEAR_CONTRACT_ID,
      estimatedSeconds: 2,
      route: `Native NEAR Wallet → ${NEAR_CONTRACT_ID} (1.2s finality)`,
      source: "reference-quote",
    };
  }
  const originUnits = Math.round(tokenAmt * 10 ** Math.min(meta.decimals, 8)).toString();

  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4500);
    const deadline = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const res = await fetch("https://1click.chaindefuser.com/v0/quote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.NEAR_INTENTS_JWT ? { Authorization: `Bearer ${process.env.NEAR_INTENTS_JWT}` } : {}),
      },
      body: JSON.stringify({
        dry: true,
        swapType: "EXACT_INPUT",
        slippageTolerance: 100,
        originAsset: meta.assetId,
        depositType: "ORIGIN_CHAIN",
        destinationAsset: "nep141:wrap.near",
        amount: originUnits,
        refundTo: "0x0000000000000000000000000000000000000001",
        refundType: "ORIGIN_CHAIN",
        recipient: recipientAccount.endsWith(".testnet") ? "nearsignet.near" : recipientAccount,
        recipientType: "DESTINATION_CHAIN",
        deadline,
      }),
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (res.ok) {
      const j = (await res.json()) as { quote?: { amountOutFormatted?: string; timeEstimate?: number } };
      if (j.quote?.amountOutFormatted) {
        return {
          originChain: meta.chain,
          originToken: meta.symbol,
          originAmount: `${usdAmount.toFixed(2)} ${meta.symbol}`,
          destinationAmountNear: `${Number(j.quote.amountOutFormatted).toFixed(2)} NEAR`,
          destinationContract: NEAR_CONTRACT_ID,
          estimatedSeconds: j.quote.timeEstimate || 14,
          route: `${meta.symbol} (${meta.chain}) → NEAR Intents Solver → ${NEAR_CONTRACT_ID}`,
          source: "intents-1click",
        };
      }
    }
  } catch {
    /* Mainnet 1-Click solver unreachable -> deterministic reference quote */
  }

  return {
    originChain: meta.chain,
    originToken: meta.symbol,
    originAmount: formattedOrigin,
    destinationAmountNear: `${nearAmt.toFixed(2)} NEAR`,
    destinationContract: NEAR_CONTRACT_ID,
    estimatedSeconds: 12,
    route: `${meta.symbol} (${meta.chain}) → NEAR Intents 1-Click (dry quote) → ${NEAR_CONTRACT_ID}`,
    source: "reference-quote",
  };
}

export const nearExplorerAccount = (accountId: string) =>
  `https://testnet.nearblocks.io/address/${encodeURIComponent(accountId)}`;
export const nearExplorerTx = (txHash: string) =>
  `https://testnet.nearblocks.io/txns/${encodeURIComponent(txHash)}`;
