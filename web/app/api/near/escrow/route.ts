import { NextResponse } from "next/server";
import {
  NEAR_CONTRACT_ID,
  NEAR_EXPLORER_URL,
  NEAR_FREELANCER_DEFAULT,
  NEAR_VERIFIER_ID,
  freelancerRelayerConfigured,
  isValidNearAccountId,
  nearCallView,
  nearRelayerCall,
  nearScopedVerifierCall,
  nearToYocto,
  recycleSandboxNear,
  relayerConfigured,
  sha256Tag,
  demoDepositNear,
  verifierConfigured,
} from "@/lib/near";

export const dynamic = "force-dynamic";

interface ChainEscrowRecord {
  order_id: string;
  client: string;
  freelancer: string;
  amount_yocto: string;
  criteria_count: number;
  review_deadline_ns: string;
  status: string;
  seal_id: string | null;
}

/**
 * Unified NEAR Escrow On-Chain Endpoint (`/api/near/escrow`)
 * - Executes REAL signed transactions on NEAR Testnet (`nearsignet-protocol.testnet`).
 * - Verification (`submit_verification`) & Mediation Proposals (`propose_mediation`)
 *   are signed EXCLUSIVELY by the Scoped Function-Call Access Key on `verifier.nearsignet-protocol.testnet`
 *   (which has ZERO `FullAccess` keys on the blockchain).
 * - When a browser wallet (`Meteor` / `Nightly`) is connected, `fund`, `release`, and
 *   `execute_mediation` are signed client-side in the user's wallet while AI attestations
 *   still go through this Scoped-Key endpoint!
 */
/**
 * GET /api/near/escrow?orderId=NSG-2041-AB12
 * Read-only pre-flight: does this escrow actually exist on-chain, who owns it,
 * and what is its status? Used by the UI before asking a wallet to sign, because
 * wallets display nothing at all for a transaction that will fail an `assert`.
 */
export async function GET(req: Request) {
  const orderId = new URL(req.url).searchParams.get("orderId") ?? "";
  if (!orderId || orderId.length > 64) {
    return NextResponse.json({ ok: false, error: "orderId required" }, { status: 400 });
  }
  try {
    const escrow = await nearCallView<ChainEscrowRecord | null>("get_escrow", { order_id: orderId }, NEAR_CONTRACT_ID);
    return NextResponse.json(
      { ok: true, contractId: NEAR_CONTRACT_ID, orderId, escrow: escrow ?? null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, orderId, escrow: null, error: e instanceof Error ? e.message : "RPC error" },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as {
    action?: "fund" | "verify" | "release" | "timeout_claim" | "mediate_propose" | "mediate_settle";
    orderId?: string;
    onchainOrderId?: string;
    freelancer?: string;
    freelancerId?: string;
    amountUsd?: number;
    nearAmount?: number;
    criteria?: unknown[];
    passed?: number;
    passedCount?: number;
    total?: number;
    totalCount?: number;
    evidenceHash?: string;
    termsHash?: string;
    freelancerPct?: number;
    refundBps?: number;
    decision?: string;
  };

  const action = b.action || "fund";
  const rawId = String(b.onchainOrderId || b.orderId || "NSG-0000").slice(0, 60);
  const amountUsd = Number(b.amountUsd || 150);
  const displayNear = Number(b.nearAmount || demoDepositNear(amountUsd));
  // Testnet stake per sandbox run (0.12 NEAR >= 0.01 min deposit, recycled on release for infinite judge runs)
  const sandboxStakeYocto = nearToYocto("0.12");
  const termsHash = String(b.termsHash || sha256Tag({ orderId: rawId, criteria: b.criteria || [] }));
  const totalCount = Math.max(
    1,
    Number(b.totalCount ?? b.total ?? (Array.isArray(b.criteria) && b.criteria.length ? b.criteria.length : 3))
  );
  const passedCount = Math.min(totalCount, Math.max(0, Number(b.passedCount ?? b.passed ?? totalCount)));

  const relayerClient = process.env.NEAR_SIGNER_ACCOUNT_ID || "";
  const relayerFreelancer = process.env.NEAR_FREELANCER_ACCOUNT_ID || NEAR_FREELANCER_DEFAULT;
  const requestedFreelancer = String(b.freelancerId || b.freelancer || relayerFreelancer).trim().toLowerCase();
  const safeFreelancer =
    isValidNearAccountId(requestedFreelancer) && requestedFreelancer !== relayerClient
      ? requestedFreelancer
      : relayerFreelancer;

  try {
    // 1. FUND ESCROW (Judge Sandbox Relayer)
    if (action === "fund" && relayerConfigured()) {
      const existing = await nearCallView<ChainEscrowRecord>("get_escrow", { order_id: rawId });
      if (existing) {
        return NextResponse.json({
          ok: true,
          mode: "live",
          simulated: false,
          onchainOrderId: rawId,
          contractId: NEAR_CONTRACT_ID,
          nearAmount: displayNear,
          termsHash: existing.order_id,
          txHash: "",
          explorerUrl: `${NEAR_EXPLORER_URL}/address/${NEAR_CONTRACT_ID}`,
        });
      }
      const out = await nearRelayerCall({
        methodName: "create_and_fund_escrow",
        args: {
          order_id: rawId,
          freelancer: safeFreelancer,
          terms_hash: termsHash,
          criteria_count: totalCount,
          usd_cents: Math.round(amountUsd * 100),
          review_window_ns: "60000000000", // 60s window on Testnet so timeout auto-release can also be tested live
        },
        attachedDepositYocto: sandboxStakeYocto,
      });
      return NextResponse.json({
        ok: true,
        mode: "live",
        simulated: false,
        onchainOrderId: rawId,
        contractId: NEAR_CONTRACT_ID,
        nearAmount: displayNear,
        termsHash,
        txHash: out.txHash,
        explorerUrl: out.explorerUrl,
      });
    }

    // 2. SCOPED-KEY AI VERIFICATION (Both Real Wallet orders AND Sandbox orders!)
    if (action === "verify" && verifierConfigured()) {
      let existing = await nearCallView<ChainEscrowRecord>("get_escrow", { order_id: rawId });
      let fundTxHash: string | undefined;

      // If user opened a preset "in_escrow" order (e.g. NSG-2041) in Sandbox mode, anchor it on-chain first!
      if (!existing && relayerConfigured()) {
        const fundOut = await nearRelayerCall({
          methodName: "create_and_fund_escrow",
          args: {
            order_id: rawId,
            freelancer: relayerFreelancer,
            terms_hash: termsHash,
            criteria_count: totalCount,
            usd_cents: Math.round(amountUsd * 100),
            review_window_ns: "60000000000",
          },
          attachedDepositYocto: sandboxStakeYocto,
        });
        fundTxHash = fundOut.txHash;
        existing = await nearCallView<ChainEscrowRecord>("get_escrow", { order_id: rawId });
      }

      if (existing) {
        const effectiveTotal = existing.criteria_count || totalCount;
        const effectivePassed =
          passedCount >= totalCount ? effectiveTotal : Math.min(effectiveTotal - 1, passedCount);

        const out = await nearScopedVerifierCall({
          methodName: "submit_verification",
          args: {
            order_id: rawId,
            passed_count: Math.max(0, effectivePassed),
            total_count: effectiveTotal,
            evidence_hash: String(b.evidenceHash || sha256Tag(`${rawId}:${effectivePassed}`)),
          },
        });
        return NextResponse.json({
          ok: true,
          mode: "live",
          simulated: false,
          onchainOrderId: rawId,
          contractId: NEAR_CONTRACT_ID,
          verifierId: NEAR_VERIFIER_ID,
          fundTxHash,
          txHash: out.txHash,
          explorerUrl: out.explorerUrl,
        });
      }
    }

    // 3. APPROVE & RELEASE / TIMEOUT CLAIM (Judge Sandbox Relayer)
    if ((action === "release" || action === "timeout_claim") && relayerConfigured()) {
      const existing = await nearCallView<ChainEscrowRecord>("get_escrow", { order_id: rawId });
      if (!existing) {
        // Anchor + verify first if someone jumped straight to a "review" preset (e.g. NSG-2039)
        await nearRelayerCall({
          methodName: "create_and_fund_escrow",
          args: {
            order_id: rawId,
            freelancer: relayerFreelancer,
            terms_hash: termsHash,
            criteria_count: totalCount,
            usd_cents: Math.round(amountUsd * 100),
            review_window_ns: "60000000000",
          },
          attachedDepositYocto: sandboxStakeYocto,
        });
        if (verifierConfigured()) {
          await nearScopedVerifierCall({
            methodName: "submit_verification",
            args: {
              order_id: rawId,
              passed_count: totalCount,
              total_count: totalCount,
              evidence_hash: sha256Tag(`${rawId}:verified`),
            },
          });
        }
      }

      let out: { txHash: string; explorerUrl: string };
      const refreshed = await nearCallView<ChainEscrowRecord>("get_escrow", { order_id: rawId });
      const nowNs = BigInt(Date.now()) * 1_000_000n;
      const canClaimTimeout =
        action === "timeout_claim" &&
        freelancerRelayerConfigured() &&
        refreshed?.review_deadline_ns &&
        refreshed.review_deadline_ns !== "0" &&
        nowNs >= BigInt(refreshed.review_deadline_ns);

      if (canClaimTimeout) {
        out = await nearRelayerCall({
          signerId: process.env.NEAR_FREELANCER_ACCOUNT_ID!,
          privateKey: process.env.NEAR_FREELANCER_PRIVATE_KEY!,
          methodName: "claim_after_timeout",
          args: { order_id: rawId },
          gas: "100000000000000",
        });
      } else {
        out = await nearRelayerCall({
          methodName: "approve_and_release",
          args: { order_id: rawId },
          gas: "100000000000000",
        });
      }

      const settled = await nearCallView<ChainEscrowRecord>("get_escrow", { order_id: rawId });
      // Replenish sandbox client pool in background
      void recycleSandboxNear("0.11");

      return NextResponse.json({
        ok: true,
        mode: "live",
        simulated: false,
        onchainOrderId: rawId,
        contractId: NEAR_CONTRACT_ID,
        sealId: settled?.seal_id || `SEAL-${rawId}-${out.txHash.slice(0, 6).toUpperCase()}`,
        txHash: out.txHash,
        explorerUrl: out.explorerUrl,
      });
    }

    // 4. SCOPED-KEY MEDIATION PROPOSAL + SETTLEMENT
    if ((action === "mediate_propose" || action === "mediate_settle") && verifierConfigured()) {
      const freelancerPct = typeof b.freelancerPct === "number" ? b.freelancerPct : 70;
      const refundBps =
        typeof b.refundBps === "number"
          ? b.refundBps
          : Math.max(0, Math.min(10000, Math.round((100 - freelancerPct) * 100)));

      let existing = await nearCallView<ChainEscrowRecord>("get_escrow", { order_id: rawId });
      if (!existing && relayerConfigured()) {
        await nearRelayerCall({
          methodName: "create_and_fund_escrow",
          args: {
            order_id: rawId,
            freelancer: relayerFreelancer,
            terms_hash: termsHash,
            criteria_count: totalCount,
            usd_cents: Math.round(amountUsd * 100),
            review_window_ns: "60000000000",
          },
          attachedDepositYocto: sandboxStakeYocto,
        });
        existing = await nearCallView<ChainEscrowRecord>("get_escrow", { order_id: rawId });
      }

      if (existing) {
        const propOut = await nearScopedVerifierCall({
          methodName: "propose_mediation",
          args: {
            order_id: rawId,
            refund_bps: refundBps,
            decision: refundBps === 0 ? "release" : refundBps === 10000 ? "refund_full" : "refund_partial",
            reason_hash: sha256Tag(`${rawId}:mediation:${refundBps}`),
          },
        });

        if (action === "mediate_propose" || !relayerConfigured()) {
          return NextResponse.json({
            ok: true,
            mode: "live",
            simulated: false,
            onchainOrderId: rawId,
            refundBps,
            proposeTxHash: propOut.txHash,
            txHash: propOut.txHash,
            explorerUrl: propOut.explorerUrl,
          });
        }

        const execOut = await nearRelayerCall({
          methodName: "execute_mediation",
          args: { order_id: rawId },
          gas: "120000000000000",
        });
        void recycleSandboxNear("0.06");

        return NextResponse.json({
          ok: true,
          mode: "live",
          simulated: false,
          onchainOrderId: rawId,
          contractId: NEAR_CONTRACT_ID,
          refundBps,
          proposeTxHash: propOut.txHash,
          txHash: execOut.txHash,
          explorerUrl: execOut.explorerUrl,
        });
      }
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "NEAR Testnet execution failed" },
      { status: 502 }
    );
  }

  // Fallback ONLY for local offline environments without private keys
  const pseudoHash = sha256Tag(`${action}:${rawId}:${Date.now()}`).replace("sha256:", "");
  return NextResponse.json({
    ok: true,
    mode: "offline-local",
    simulated: true,
    onchainOrderId: rawId,
    contractId: NEAR_CONTRACT_ID,
    verifierId: NEAR_VERIFIER_ID,
    nearAmount: displayNear,
    termsHash,
    sealId: `SEAL-${rawId}-${pseudoHash.slice(0, 6).toUpperCase()}`,
    refundBps: typeof b.refundBps === "number" ? b.refundBps : 0,
    txHash: "",
    explorerUrl: `${NEAR_EXPLORER_URL}/address/${NEAR_CONTRACT_ID}`,
  });
}
