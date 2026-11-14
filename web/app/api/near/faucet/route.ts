import { NextResponse } from "next/server";
import {
  isValidNearAccountId,
  NEAR_EXPLORER_URL,
  NEAR_NETWORK_ID,
  NEAR_RPC_URL,
  nearToYocto,
  nearViewAccount,
  relayerConfigured,
} from "@/lib/near";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function replenishRelayerIfLow(relayerId: string): Promise<void> {
  try {
    const info = await nearViewAccount(relayerId);
    if (info && Number(info.amountNear) >= 8) return;
    const nearAPI = await import("near-api-js");
    const kp = nearAPI.KeyPair.fromRandom("ed25519");
    const tempId = `nsg-pool-${Date.now().toString(36)}.testnet`;
    const r = await fetch("https://helper.testnet.near.org/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newAccountId: tempId,
        newAccountPublicKey: kp.getPublicKey().toString(),
      }),
    });
    if (!r.ok) return;
    const ks = new nearAPI.keyStores.InMemoryKeyStore();
    await ks.setKey("testnet", tempId, kp);
    const near = await nearAPI.connect({
      networkId: "testnet",
      nodeUrl: NEAR_RPC_URL,
      keyStore: ks,
    });
    const tempAcct = await near.account(tempId);
    await tempAcct.deleteAccount(relayerId);
  } catch {
    /* optional background top-up */
  }
}

export async function POST(req: Request) {
  if (NEAR_NETWORK_ID !== "testnet") {
    return NextResponse.json({ ok: false, error: "Faucet is only available on NEAR Testnet" }, { status: 400 });
  }
  if (!relayerConfigured()) {
    return NextResponse.json({ ok: false, error: "Testnet faucet relayer not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { accountId?: string };
  const raw = (body.accountId || "").trim().toLowerCase();

  const isImplicitHex = /^[0-9a-f]{64}$/.test(raw);
  const isNamedTestnet = raw.endsWith(".testnet") && isValidNearAccountId(raw);

  if (!isImplicitHex && !isNamedTestnet) {
    return NextResponse.json(
      {
        ok: false,
        error: "Masukkan alamat wallet Testnet yang valid (berakhiran .testnet atau 64 karakter hex dari Meteor Wallet).",
      },
      { status: 400 }
    );
  }

  const existing = await nearViewAccount(raw);
  if (!existing && !isImplicitHex) {
    return NextResponse.json(
      {
        ok: false,
        error: `Akun ${raw} belum terdaftar di NEAR Testnet. Buat akunnya terlebih dahulu di dalam Meteor Wallet (mode Testnet), lalu tempel alamatnya di sini.`,
      },
      { status: 404 }
    );
  }

  if (existing && Number(existing.amountNear) >= 2.5) {
    return NextResponse.json({
      ok: true,
      alreadyFunded: true,
      accountId: raw,
      balanceNear: existing.amountNear,
      message: `Wallet ${raw} sudah memiliki ${existing.amountNear} NEAR Testnet — siap langsung dikoneksikan!`,
    });
  }

  try {
    const nearAPI = await import("near-api-js");
    const signerId = process.env.NEAR_SIGNER_ACCOUNT_ID!;
    const signerKey = process.env.NEAR_SIGNER_PRIVATE_KEY!;
    const keyStore = new nearAPI.keyStores.InMemoryKeyStore();
    await keyStore.setKey(
      NEAR_NETWORK_ID,
      signerId,
      nearAPI.KeyPair.fromString(signerKey as `ed25519:${string}`)
    );
    const near = await nearAPI.connect({
      networkId: NEAR_NETWORK_ID,
      keyStore,
      nodeUrl: NEAR_RPC_URL,
    });
    const signer = await near.account(signerId);
    const amountNear = "1.5";
    const outcome = await signer.sendMoney(raw, BigInt(nearToYocto(amountNear)));
    const txHash = outcome.transaction.hash;

    void replenishRelayerIfLow(signerId);

    return NextResponse.json({
      ok: true,
      accountId: raw,
      amountNear,
      txHash,
      explorerUrl: `${NEAR_EXPLORER_URL}/txns/${txHash}`,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Gagal mengirim Testnet NEAR",
      },
      { status: 500 }
    );
  }
}
