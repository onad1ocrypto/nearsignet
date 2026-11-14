import { NextResponse } from "next/server";
import {
  LIVE_TESTNET_ARTIFACTS,
  NEAR_CONTRACT_ID,
  NEAR_EXPLORER_URL,
  NEAR_NETWORK_ID,
  NEAR_RPC_URL,
  NEAR_VERIFIER_ID,
  nearCallView,
  nearViewAccessKeys,
  nearViewAccount,
} from "@/lib/near";

export const dynamic = "force-dynamic";

type RawEscrow = {
  order_id: string;
  client: string;
  freelancer: string;
  amount_yocto: string;
  criteria_count: number;
  status: string;
  verification?: { passed_count: number; total_count: number } | null;
  seal_id?: string | null;
};

export async function GET() {
  const [contractAccount, rawStats, rawEscrows, verifierKeysRaw] = await Promise.all([
    nearViewAccount(NEAR_CONTRACT_ID),
    nearCallView<{
      owner: string;
      verifier_agent: string;
      total_locked_yocto: string;
      total_sealed_count: number;
      total_orders: number;
    }>("get_stats", {}),
    nearCallView<RawEscrow[]>("list_escrows", { from_index: 0, limit: 25 }),
    nearViewAccessKeys(NEAR_CONTRACT_ID),
  ]);

  const stats = rawStats
    ? {
        ...rawStats,
        verifierAccount: rawStats.verifier_agent,
        totalEscrows: rawStats.total_orders,
        totalSealed: rawStats.total_sealed_count,
        totalVolumeYocto: rawStats.total_locked_yocto,
      }
    : null;

  const escrows = (rawEscrows || []).map((e) => ({
    id: e.order_id,
    client: e.client,
    freelancer: e.freelancer,
    amountYocto: e.amount_yocto,
    status: e.status,
    passedCount: e.verification?.passed_count ?? 0,
    totalCount: e.verification?.total_count ?? e.criteria_count ?? 0,
    sealId: e.seal_id ?? "",
  }));

  const verifierKeys = verifierKeysRaw
    .filter((k) => k.kind === "FunctionCall")
    .map((k) => ({
      publicKey: k.publicKey,
      permission: {
        receiverId: k.receiverId ?? NEAR_CONTRACT_ID,
        methodNames: k.methodNames ?? [],
        allowanceNear: k.allowanceNear ?? "0.25",
      },
    }));

  return NextResponse.json(
    {
      network: NEAR_NETWORK_ID,
      rpcUrl: NEAR_RPC_URL,
      contractId: NEAR_CONTRACT_ID,
      verifierId: NEAR_VERIFIER_ID,
      explorerUrl: `${NEAR_EXPLORER_URL}/address/${NEAR_CONTRACT_ID}`,
      liveOnChain: Boolean(contractAccount?.hasContract),
      contractAccount,
      stats,
      escrows,
      verifierKeys,
      deploymentArtifacts: LIVE_TESTNET_ARTIFACTS,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
