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
  const active = (selector.isSignedIn() ? await getActiveWalletAccount() : null) ?? (await ensureWalletSession(selector));
  if (!active?.accountId) {
    throw new Error(
      "Wallet session lost. Reconnect your NEAR wallet from the Wallet menu, then retry the payment."
    );
  }
  const { transactions } = await import("near-api-js");
  const wallet = await selector.wallet();
  const action = transactions.functionCall(methodName, args, BigInt(gas), BigInt(depositYocto));

  const outcome = await (wallet.signAndSendTransaction as (params: {
    signerId?: string;
    receiverId?: string;
    actions: unknown[];
    callbackUrl?: string;
  }) => Promise<unknown>)({
    signerId: active?.accountId,
    receiverId: NEAR_CONTRACT_ID,
    actions: [action],
    callbackUrl: callbackUrl || (typeof window !== "undefined" ? window.location.href : undefined),
  });

  const txHash =
    (outcome as { transaction?: { hash?: string } } | undefined)?.transaction?.hash ||
    (outcome as { transaction_outcome?: { id?: string } } | undefined)?.transaction_outcome?.id ||
    (outcome as { hash?: string } | undefined)?.hash ||
    "";

  return {
    txHash,
    explorerUrl: txHash ? `${NEAR_EXPLORER_URL}/txns/${txHash}` : `${NEAR_EXPLORER_URL}/address/${NEAR_CONTRACT_ID}`,
    signerId: active?.accountId || "wallet.testnet",
  };
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
