"use client";

import { Buffer } from "buffer";
import type { WalletSelector } from "@near-wallet-selector/core";
import { NEAR_CONTRACT_ID, NEAR_EXPLORER_URL, NEAR_NETWORK_ID } from "./near";

if (typeof globalThis !== "undefined" && !(globalThis as { Buffer?: typeof Buffer }).Buffer) {
  (globalThis as { Buffer?: typeof Buffer }).Buffer = Buffer;
}

export type SupportedWalletId = "meteor-wallet" | "intear-wallet" | "hot-wallet";

let selectorPromise: Promise<WalletSelector> | null = null;

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
    return {
      accountId: active.accountId,
      walletId: state.selectedWalletId || "meteor-wallet",
    };
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
    methodNames: [],
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
    const selector = await getNearSelector();
    if (!selector || !selector.isSignedIn()) return;
    const wallet = await selector.wallet();
    await wallet.signOut();
  } catch {
    /* ignore signout errors */
  }
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
  if (!selector || !selector.isSignedIn()) {
    throw new Error("No NEAR wallet connected");
  }
  const { transactions } = await import("near-api-js");
  const active = await getActiveWalletAccount();
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
