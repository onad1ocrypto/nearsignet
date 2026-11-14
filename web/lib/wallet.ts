"use client";

import {
  buildLoginProof,
  loginMessage,
  nep413Payload,
  randomNonce,
  type LoginProof,
  type SignMessageResult,
} from "./nearAuth";
import { Buffer } from "buffer";
import type { WalletSelector } from "@near-wallet-selector/core";
import { NEAR_CONTRACT_ID, NEAR_EXPLORER_URL, NEAR_NETWORK_ID } from "./near";

if (typeof globalThis !== "undefined" && !(globalThis as { Buffer?: typeof Buffer }).Buffer) {
  (globalThis as { Buffer?: typeof Buffer }).Buffer = Buffer;
}

/**
 * Only wallets that are BOTH alive and able to sign on NEAR testnet.
 *
 * Verified Nov 2026 against the official NEAR wallet hub
 * (wallet.near.org, repo NEAR-DevHub/wallet-landing-near): the list now holds
 * NEAR Mobile, Meteor, HOT, Ethereum wallets, Intear and Nightly.
 *  - HERE Wallet was merged into HOT and no longer exists as its own wallet
 *    (its web app 404s); dropped.
 *  - Sender shut down (hub PR #11: "removed Sender wallet as they shutdown"); dropped.
 *  - Intear kept out: its standalone testnet support is what made "Sign & Lock"
 *    look broken for the user.
 *  - HOT is mainnet-only for signing, so it must never be a testnet path here.
 */
export type SupportedWalletId = "meteor-wallet" | "nightly";

/**
 * Methods the dApp ever asks the browser wallet to sign. Requesting a SCOPED
 * Function-Call key for exactly these keeps the least-privilege story intact and —
 * critically — stops wallets that issue no key at all (methodNames: []) from
 * accepting the connection and then silently refusing every later transaction.
 */
export const WALLET_METHOD_NAMES = ["create_and_fund_escrow", "approve_and_release", "execute_mediation"] as const;

let selectorPromise: Promise<WalletSelector> | null = null;
let lastWalletId: SupportedWalletId | null = null;
export const KNOWN_WALLET_IDS: SupportedWalletId[] = ["meteor-wallet", "nightly"];

/**
 * Honest availability probe so the UI never invents a "Connect" button for a
 * wallet the browser cannot reach. Meteor signs through @meteorwallet/sdk
 * (works with the extension or the web wallet); Nightly needs its injected
 * provider.
 */
export function walletAvailability(
  id: SupportedWalletId
): { ok: boolean; hint: string; installUrl?: string } {
  if (typeof window === "undefined") return { ok: true, hint: "Detecting…" };
  if (id === "meteor-wallet") {
    const injected = Boolean(
      (window as unknown as Record<string, unknown>).meteorWalletNear ||
        (window as unknown as Record<string, unknown>).meteorWallet
    );
    return {
      ok: true,
      hint: injected ? "Extension detected" : "Extension or web",
      installUrl: injected ? undefined : "https://meteorwallet.app",
    };
  }
  const injected = Boolean((window as unknown as Record<string, unknown>).nightly);
  return {
    ok: injected,
    hint: injected ? "Extension detected" : "Extension not detected",
    installUrl: injected ? undefined : "https://wallet.nightly.app/download",
  };
}
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
      if (v && KNOWN_WALLET_IDS.includes(v as SupportedWalletId)) return v as SupportedWalletId;
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
        { setupNightly },
      ] = await Promise.all([
        import("@near-wallet-selector/core"),
        import("@near-wallet-selector/meteor-wallet"),
        import("@near-wallet-selector/nightly"),
      ]);
      return setupWalletSelector({
        network: NEAR_NETWORK_ID === "mainnet" ? "mainnet" : "testnet",
        modules: [setupMeteorWallet(), setupNightly()],
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
 * Meteor / Nightly expose an instant `signIn` when already authorised
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

/**
 * near-api-js Action instance for INJECTED wallets, which convert actions with
 * `najActionToInternal()` (see @near-wallet-selector/core). Lazily imported so the
 * class is never bundled for server render, and the getter `action.functionCall`
 * is what the converter actually reads.
 */
export function najFunctionCallAction(
  methodName: string,
  args: Record<string, unknown>,
  gas: string,
  deposit: string
) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { actionCreators } = require("@near-js/transactions") as {
    actionCreators: {
      functionCall: (
        methodName: string,
        args: Uint8Array | Record<string, unknown>,
        gas?: bigint,
        deposit?: bigint
      ) => unknown;
    };
  };
  const encoded = new TextEncoder().encode(JSON.stringify(args));
  return actionCreators.functionCall(methodName, encoded, BigInt(gas), BigInt(deposit));
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

  // 2. Resolve the wallet first: what it is decides which action shape it accepts.
  let wallet = await selector.wallet(active.walletId as SupportedWalletId);
  if (typeof (wallet as unknown as { signAndSendTransaction?: unknown }).signAndSendTransaction !== "function") {
    throw new Error("This wallet does not expose signAndSendTransaction. Pick Meteor Wallet or Nightly Wallet.");
  }

  /**
   * CRITICAL: Meteor and Nightly are *injected* wallets. The selector converts every
   * action with `najActionToInternal()`, which switches on near-api-js Action CLASS
   * getters (`action.functionCall`). The plain `{ type: "FunctionCall", params }`
   * object therefore throws "Unsupported NAJ action" inside the wallet — no prompt,
   * no transaction. Browser wallets get real NAJ Action instances; only
   * wallet-routed (redirect) wallets keep the JSON shape.
   */
  const walletType = (wallet as unknown as { type?: string }).type;
  const needsNajActions = walletType === "injected";

  // 3. Build the action in the shape this wallet can actually serialise.
  const jsonAction = buildFunctionCallAction(methodName, args, gas, depositYocto);
  if (!jsonAction.params.methodName || typeof jsonAction.params.args !== "object") {
    throw new Error("Malformed wallet action — refusing to send an empty payload");
  }
  const action = needsNajActions ? najFunctionCallAction(methodName, args, gas, depositYocto) : jsonAction;

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

/**
 * Sign a NEP-413 login message with the connected wallet.
 *
 * This is an ownership proof, not a transaction: nothing is broadcast, no gas and
 * no deposit. It is the only thing that stops someone from claiming an account id
 * they do not control (e.g. browsing as sasam.testnet and grabbing its work).
 */
export async function signLoginProof(recipientId: string): Promise<{
  accountId: string;
  message: string;
  proof: LoginProof;
}> {
  const selector = await getNearSelector();
  if (!selector) throw new Error("Browser wallet unavailable — open this page in a normal browser tab");

  const active =
    (selector.isSignedIn() ? await getActiveWalletAccount() : null) ?? (await ensureWalletSession(selector));
  if (!active?.accountId) throw new Error("Connect Meteor or Nightly first, then sign in.");

  const wallet = await selector.wallet(active.walletId as SupportedWalletId);
  const signMessage = (wallet as unknown as { signMessage?: (p: unknown) => Promise<SignMessageResult> }).signMessage;
  if (typeof signMessage !== "function") {
    throw new Error(`${active.walletId} cannot sign a login message. Use Meteor Wallet or Nightly Wallet.`);
  }

  const issuedAt = Date.now();
  const message = loginMessage(active.accountId, issuedAt);
  const nonce = randomNonce();
  const payload = nep413Payload(message, recipientId, nonce);

  const signed = await signMessage.call(wallet, {
    message,
    recipient: recipientId,
    nonce,
    callbackUrl: typeof window !== "undefined" ? window.location.origin : undefined,
  });

  return {
    accountId: active.accountId,
    message,
    proof: buildLoginProof(active.accountId, recipientId, signed, message, nonce),
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
