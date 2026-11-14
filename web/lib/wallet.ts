"use client";

import { Buffer } from "buffer";
import type { WalletSelector } from "@near-wallet-selector/core";
import { NEAR_CONTRACT_ID, NEAR_EXPLORER_URL, NEAR_NETWORK_ID } from "./near";

if (typeof globalThis !== "undefined" && !(globalThis as { Buffer?: typeof Buffer }).Buffer) {
  (globalThis as { Buffer?: typeof Buffer }).Buffer = Buffer;
}

export type SupportedWalletId = "meteor-wallet" | "intear-wallet" | "hot-wallet";

/**
 * Methods the dApp ever asks the browser wallet to sign. Requesting a SCOPED
 * Function-Call key for exactly these keeps the least-privilege story intact and —
 * critically — stops wallets that issue no key at all (methodNames: []) from
 * accepting the connection and then silently refusing every later transaction.
 */
export const WALLET_METHOD_NAMES = ["create_and_fund_escrow", "approve_and_release", "execute_mediation"] as const;

let selectorPromise: Promise<WalletSelector> | null = null;
let lastWalletId: SupportedWalletId | null = null;
const LAST_WALLET_KEY = "nearsignet.walletId";

function rememberWallet(id: string | null | undefined) {
  if (!id) return;
  lastWalletId = id as SupportedWalletId;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(LAST_WALLET_KEY, id);
  } catch {}
}

function rememberedWallet(): SupportedWalletId | null {
  if (lastWalletId) return lastWalletId;
  try {
    if (typeof localStorage !== "undefined") {
      const v = localStorage.getItem(LAST_WALLET_KEY);
      if (v === "meteor-wallet" || v === "intear-wallet" || v === "hot-wallet") return v;
    }
  } catch {}
  return null;
}

export function walletSessionHint(): SupportedWalletId | null {
  return rememberedWallet();
}

export async function getNearSelector(): Promise<WalletSelector | null> {
  if (typeof window === "undefined") return null;
  if (!selectorPromise) {
    selectorPromise = (async () => {
      const [
        { setupWalletSelector },
        { setupMeteorWallet },
        { setupIntearWallet },
        { setupHotWallet },
      ] = await Promise.all([
        import("@near-wallet-selector/core"),
        import("@near-wallet-selector/meteor-wallet"),
        import("@near-wallet-selector/intear-wallet"),
        import("@near-wallet-selector/hot-wallet"),
      ]);
      return setupWalletSelector({
        network: NEAR_NETWORK_ID === "mainnet" ? "mainnet" : "testnet",
        modules: [
          setupMeteorWallet(),
          setupIntearWallet(),
          setupHotWallet(),
        ],
      });
    })();
  }
  return selectorPromise;
}

export async function getActiveWalletAccount(): Promise<{ accountId: string; walletId: string } | null> {
  try {
    const selector = await getNearSelector();
    if (!selector) return null;
    const state = selector.store.getState();
    const active = state.accounts.find((a) => a.active) || state.accounts[0];
    if (!active?.accountId) return null;
    const walletId = state.selectedWalletId || rememberedWallet() || "meteor-wallet";
    rememberWallet(walletId);
    return { accountId: active.accountId, walletId };
  } catch {
    return null;
  }
}

export async function connectNearBrowserWallet(
  walletId: SupportedWalletId = "meteor-wallet",
  successUrl?: string
): Promise<{ accountId?: string; redirected?: boolean }> {
  const selector = await getNearSelector();
  if (!selector) throw new Error("Browser wallet unavailable during SSR");
  rememberWallet(walletId);
  const wallet = await selector.wallet(walletId);
  const cbUrl = successUrl || (typeof window !== "undefined" ? window.location.href : undefined);
  await (wallet as unknown as {
    signIn: (params: {
      contractId: string;
      methodNames?: string[];
      successUrl?: string;
      failureUrl?: string;
    }) => Promise<unknown>;
  }).signIn({
    contractId: NEAR_CONTRACT_ID,
    methodNames: [...WALLET_METHOD_NAMES],
    successUrl: cbUrl,
    failureUrl: cbUrl,
  });
  const after = await getActiveWalletAccount();
  if (after?.accountId) {
    return { accountId: after.accountId };
  }
  return { redirected: true };
}

export async function disconnectNearBrowserWallet(): Promise<void> {
  try {
    lastWalletId = null;
    if (typeof localStorage !== "undefined") localStorage.removeItem(LAST_WALLET_KEY);
    const selector = await getNearSelector();
    if (!selector || !selector.isSignedIn()) return;
    const wallet = await selector.wallet();
    await wallet.signOut();
  } catch {
    /* ignore signout errors */
  }
}

/**
 * Re-attach the wallet selector to a session that exists in the wallet extension
 * but not yet in this page instance (e.g. after navigating to another route).
 * Meteor / Intear / HOT all expose an instant `signIn` when already authorised
 * for the same contract, so this never shows a second approval prompt.
 */
async function ensureWalletSession(
  selector: WalletSelector
): Promise<{ accountId: string; walletId: string } | null> {
  const current = await getActiveWalletAccount();
  if (current?.accountId) return current;
  try {
    const wallet = await selector.wallet(rememberedWallet() ?? undefined);
    await (wallet as unknown as { signIn: (params: Record<string, unknown>) => Promise<unknown> }).signIn({
      contractId: NEAR_CONTRACT_ID,
      methodNames: [...WALLET_METHOD_NAMES],
      successUrl: typeof window !== "undefined" ? window.location.href : undefined,
      failureUrl: typeof window !== "undefined" ? window.location.href : undefined,
    });
  } catch {
    /* wallet refused to re-attach — fall through and report it */
  }
  return await getActiveWalletAccount();
}

/**
 * Sign + broadcast a FunctionCall through the user's browser wallet.
 *
 * CRITICAL: near-wallet-selector expects its OWN JSON action shape —
 *   { type: "FunctionCall", params: { methodName, args, gas, deposit } }
 * with gas/deposit as decimal strings. Handing it near-api-js Action classes
 * (transactions.functionCall(...)) serialises to `{}`, so wallets received an
 * empty payload and never showed a confirmation prompt — that was the
 * "connected but nothing happens" bug.
 */
export function buildFunctionCallAction(
  methodName: string,
  args: Record<string, unknown>,
  gas: string,
  deposit: string
) {
  return {
    type: "FunctionCall" as const,
    params: {
      methodName,
      args,
      gas: BigInt(gas).toString(),
      deposit: BigInt(deposit).toString(),
    },
  };
}

export async function signNearWalletCall({
  methodName,
  args,
  depositYocto = "0",
  gas = "80000000000000",
  callbackUrl,
}: {
  methodName: string;
  args: Record<string, unknown>;
  depositYocto?: string;
  gas?: string;
  callbackUrl?: string;
}): Promise<{ txHash: string; explorerUrl: string; signerId: string }> {
  const selector = await getNearSelector();
  if (!selector) {
    throw new Error("Browser wallet unavailable — open this page in a normal browser tab");
  }

  // 1. Re-hydrate a stale session instead of dead-ending with "No NEAR wallet connected".
  let active =
    (selector.isSignedIn() ? await getActiveWalletAccount() : null) ?? (await ensureWalletSession(selector));
  if (!active?.accountId) {
    throw new Error(
      "Wallet session lost. Reconnect your NEAR wallet from the Wallet menu, then retry the payment."
    );
  }

  // 2. Build the selector-native action and prove it serialises non-empty.
  const action = buildFunctionCallAction(methodName, args, gas, depositYocto);
  if (!action.params.methodName || typeof action.params.args !== "object") {
    throw new Error("Malformed wallet action — refusing to send an empty payload");
  }

  let wallet = await selector.wallet(active.walletId as SupportedWalletId);
  if (typeof (wallet as unknown as { signAndSendTransaction?: unknown }).signAndSendTransaction !== "function") {
    throw new Error("This wallet does not expose signAndSendTransaction. Pick Meteor, Intear or HOT Wallet.");
  }

  const params = {
    signerId: active.accountId,
    receiverId: NEAR_CONTRACT_ID,
    actions: [action],
    callbackUrl: callbackUrl || (typeof window !== "undefined" ? window.location.href : undefined),
  };

  let outcome: unknown;
  try {
    outcome = await (wallet.signAndSendTransaction as unknown as (p: typeof params) => Promise<unknown>)(params);
  } catch (e) {
    // One retry after re-hydrating the session (covers a silently dropped session).
    const refreshed = await ensureWalletSession(selector);
    if (!refreshed?.accountId) throw e;
    active = refreshed;
    wallet = await selector.wallet(refreshed.walletId as SupportedWalletId);
    outcome = await (wallet.signAndSendTransaction as unknown as (p: typeof params) => Promise<unknown>)({
      ...params,
      signerId: refreshed.accountId,
    });
  }

  const txHash =
    (outcome as { transaction?: { hash?: string } } | undefined)?.transaction?.hash ||
    (outcome as { transaction_outcome?: { id?: string } } | undefined)?.transaction_outcome?.id ||
    (outcome as { hash?: string } | undefined)?.hash ||
    "";

  if (!txHash) {
    throw new Error(
      "Wallet accepted the request but returned no transaction hash. Check the wallet activity tab before retrying — nothing was double-charged."
    );
  }

  return { txHash, explorerUrl: `${NEAR_EXPLORER_URL}/txns/${txHash}`, signerId: active.accountId };
}

/** Diagnostics used by the order page banner: does the active wallet advertise tx signing? */
export async function walletCapabilities(): Promise<{ walletId: string | null; canSign: boolean; hasSession: boolean }> {
  try {
    const selector = await getNearSelector();
    if (!selector) return { walletId: null, canSign: false, hasSession: false };
    const active = await getActiveWalletAccount();
    if (!active) return { walletId: rememberedWallet(), canSign: false, hasSession: false };
    const wallet = await selector.wallet(active.walletId as SupportedWalletId).catch(() => null);
    const features = (wallet as unknown as { metadata?: { features?: Record<string, unknown> } } | null)?.metadata?.features ?? {};
    return {
      walletId: active.walletId,
      hasSession: true,
      canSign: "signAndSendTransaction" in features ? features.signAndSendTransaction !== false : true,
    };
  } catch {
    return { walletId: null, canSign: false, hasSession: false };
  }
}
