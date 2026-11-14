// SPDX-License-Identifier: MIT
import { NearBindgen, near, call, view, initialize, UnorderedMap, NearPromise, assert } from "near-sdk-js";

export type EscrowStatus =
  | "IN_ESCROW"
  | "REVISION_NEEDED"
  | "IN_REVIEW"
  | "DISPUTED"
  | "SEALED"
  | "REFUNDED";

export interface VerificationProof {
  passed_count: number;
  total_count: number;
  all_passed: boolean;
  evidence_hash: string;
  verifier_account: string;
  verified_at_ns: string;
}

export interface MediationProposal {
  refund_bps: number; // 0..10000 (basis points returned to client)
  decision: string;   // "release" | "refund_partial" | "refund_full" | "escalate"
  reason_hash: string;
  proposed_by: string;
  proposed_at_ns: string;
}

export interface EscrowRecord {
  order_id: string;
  client: string;
  freelancer: string;
  amount_yocto: string;
  usd_cents: number;
  terms_hash: string;
  criteria_count: number;
  review_window_ns: string;
  created_at_ns: string;
  review_deadline_ns: string;
  status: EscrowStatus;
  verification: VerificationProof | null;
  mediation: MediationProposal | null;
  sealed_at_ns: string | null;
  seal_id: string | null;
}

const DEFAULT_REVIEW_WINDOW_NS = BigInt(72) * BigInt(3600) * BigInt(1_000_000_000); // 72 hours in nanoseconds
const MIN_DEPOSIT_YOCTO = BigInt("10000000000000000000000"); // 0.01 NEAR minimum

@NearBindgen({ requireInit: false })
export class NearSignetEscrow {
  owner: string = "";
  verifier_agent: string = "";
  total_locked_yocto: string = "0";
  total_sealed_count: number = 0;
  escrows: UnorderedMap<EscrowRecord> = new UnorderedMap<EscrowRecord>("e");

  @initialize({ privateFunction: true })
  init({ owner, verifier_agent }: { owner: string; verifier_agent: string }): void {
    assert(Boolean(owner), "owner account is required");
    assert(Boolean(verifier_agent), "verifier_agent account is required");
    this.owner = owner;
    this.verifier_agent = verifier_agent;
  }

  private ensureConfigured(): void {
    if (!this.owner) {
      this.owner = near.currentAccountId();
    }
    if (!this.verifier_agent) {
      this.verifier_agent = `verifier.${near.currentAccountId()}`;
    }
  }

  /**
   * Scoped AI Security Control:
   * Updates the designated AI verifier account. In production / Testnet deployment,
   * this account uses a NEAR Function-Call Access Key restricted strictly to
   * `submit_verification` and `propose_mediation` with 0 NEAR transfer permission.
   */
  @call({})
  set_verifier_agent({ verifier_agent }: { verifier_agent: string }): void {
    this.ensureConfigured();
    assert(near.predecessorAccountId() === this.owner, "Only contract owner can rotate verifier_agent");
    assert(Boolean(verifier_agent) && verifier_agent.length >= 2, "Invalid verifier_agent account");
    this.verifier_agent = verifier_agent;
    near.log(`EVENT_JSON:{"standard":"nearsignet","version":"1.0.0","event":"verifier_rotated","data":{"verifier_agent":"${verifier_agent}"}}`);
  }

  /**
   * Client locks native NEAR into non-custodial escrow anchored to `terms_hash`
   * (SHA-256 of the machine-checkable acceptance rules drafted by the Contract Agent).
   */
  @call({ payableFunction: true })
  create_and_fund_escrow({
    order_id,
    freelancer,
    terms_hash,
    criteria_count,
    usd_cents = 0,
    review_window_ns,
  }: {
    order_id: string;
    freelancer: string;
    terms_hash: string;
    criteria_count: number;
    usd_cents?: number;
    review_window_ns?: string;
  }): EscrowRecord {
    this.ensureConfigured();
    const client = near.predecessorAccountId();
    const deposit = near.attachedDeposit();

    assert(Boolean(order_id) && order_id.length <= 64, "order_id must be 1..64 chars");
    assert(this.escrows.get(order_id) === null, "order_id already exists in escrow");
    assert(Boolean(freelancer) && freelancer !== client, "freelancer must differ from client");
    assert(Boolean(terms_hash) && terms_hash.length >= 8, "terms_hash is required");
    assert(criteria_count >= 1 && criteria_count <= 20, "criteria_count must be 1..20");
    assert(deposit >= MIN_DEPOSIT_YOCTO, "Attached deposit must be at least 0.01 NEAR");

    const now = near.blockTimestamp();
    const windowNs = review_window_ns ? BigInt(review_window_ns) : DEFAULT_REVIEW_WINDOW_NS;
    assert(windowNs >= BigInt(60_000_000_000), "review_window_ns must be >= 60 seconds");

    const record: EscrowRecord = {
      order_id,
      client,
      freelancer,
      amount_yocto: deposit.toString(),
      usd_cents: Number(usd_cents || 0),
      terms_hash,
      criteria_count: Number(criteria_count),
      review_window_ns: windowNs.toString(),
      created_at_ns: now.toString(),
      review_deadline_ns: "0",
      status: "IN_ESCROW",
      verification: null,
      mediation: null,
      sealed_at_ns: null,
      seal_id: null,
    };

    this.escrows.set(order_id, record);
    this.total_locked_yocto = (BigInt(this.total_locked_yocto) + deposit).toString();

    near.log(
      `EVENT_JSON:{"standard":"nearsignet","version":"1.0.0","event":"escrow_funded","data":{"order_id":"${order_id}","client":"${client}","freelancer":"${freelancer}","amount_yocto":"${deposit.toString()}","terms_hash":"${terms_hash}"}}`
    );
    return record;
  }

  /**
   * Callable ONLY by the scoped `verifier_agent` (or owner).
   * Records deterministic/LLM deliverable inspection results on-chain WITHOUT
   * moving a single yoctoNEAR. If all criteria pass, starts the 72h review clock.
   */
  @call({})
  submit_verification({
    order_id,
    passed_count,
    total_count,
    evidence_hash,
  }: {
    order_id: string;
    passed_count: number;
    total_count: number;
    evidence_hash: string;
  }): EscrowRecord {
    this.ensureConfigured();
    const caller = near.predecessorAccountId();
    assert(
      caller === this.verifier_agent || caller === this.owner,
      "AI Firewall: Only scoped verifier_agent can submit verification proofs"
    );

    const rec = this.escrows.get(order_id);
    assert(rec !== null, "Escrow order not found");
    assert(
      rec.status === "IN_ESCROW" || rec.status === "REVISION_NEEDED",
      `Cannot verify order in status ${rec.status}`
    );
    assert(total_count === rec.criteria_count, "total_count must match escrowed criteria_count");
    assert(passed_count >= 0 && passed_count <= total_count, "Invalid passed_count");

    const now = near.blockTimestamp();
    const allPassed = passed_count === total_count;
    rec.verification = {
      passed_count,
      total_count,
      all_passed: allPassed,
      evidence_hash,
      verifier_account: caller,
      verified_at_ns: now.toString(),
    };

    if (allPassed) {
      rec.status = "IN_REVIEW";
      rec.review_deadline_ns = (now + BigInt(rec.review_window_ns)).toString();
    } else {
      rec.status = "REVISION_NEEDED";
      rec.review_deadline_ns = "0";
    }

    this.escrows.set(order_id, rec);
    near.log(
      `EVENT_JSON:{"standard":"nearsignet","version":"1.0.0","event":"delivery_verified","data":{"order_id":"${order_id}","all_passed":${allPassed},"passed_count":${passed_count},"evidence_hash":"${evidence_hash}"}}`
    );
    return rec;
  }

  /**
   * Client approves delivery -> releases 100% of locked NEAR to freelancer
   * and stamps an immutable SEALED receipt on-chain.
   * AI verifier_agent is strictly forbidden from calling this method.
   */
  @call({})
  approve_and_release({ order_id }: { order_id: string }): NearPromise {
    this.ensureConfigured();
    const caller = near.predecessorAccountId();
    const rec = this.escrows.get(order_id);
    assert(rec !== null, "Escrow order not found");
    assert(caller !== this.verifier_agent, "AI Firewall: verifier_agent cannot release funds");
    assert(caller === rec.client, "Only the funding client can approve early release");
    assert(
      rec.status === "IN_REVIEW" || rec.status === "IN_ESCROW",
      `Order cannot be released from status ${rec.status}`
    );

    return this.finalizeSeal(rec, "client_approved");
  }

  /**
   * Trustless 72-Hour Silence Protection:
   * Once all criteria pass (`IN_REVIEW`) and `blockTimestamp >= review_deadline_ns`,
   * the freelancer can claim full payout even if the client goes silent.
   */
  @call({})
  claim_after_timeout({ order_id }: { order_id: string }): NearPromise {
    this.ensureConfigured();
    const caller = near.predecessorAccountId();
    const rec = this.escrows.get(order_id);
    assert(rec !== null, "Escrow order not found");
    assert(caller === rec.freelancer, "Only the freelancer can claim timeout release");
    assert(rec.status === "IN_REVIEW", "Order must have passed verification (IN_REVIEW)");
    assert(rec.verification?.all_passed === true, "All criteria must be verified");
    assert(
      near.blockTimestamp() >= BigInt(rec.review_deadline_ns),
      "72-hour client review window has not expired yet"
    );

    return this.finalizeSeal(rec, "timeout_auto_release");
  }

  private finalizeSeal(rec: EscrowRecord, trigger: string): NearPromise {
    const now = near.blockTimestamp();
    const amount = BigInt(rec.amount_yocto);
    rec.status = "SEALED";
    rec.sealed_at_ns = now.toString();
    rec.seal_id = `SEAL-${rec.order_id}-${now.toString().slice(-6)}`;
    this.escrows.set(rec.order_id, rec);

    this.total_locked_yocto = (BigInt(this.total_locked_yocto) - amount).toString();
    this.total_sealed_count += 1;

    near.log(
      `EVENT_JSON:{"standard":"nearsignet","version":"1.0.0","event":"escrow_sealed","data":{"order_id":"${rec.order_id}","seal_id":"${rec.seal_id}","trigger":"${trigger}","freelancer":"${rec.freelancer}","amount_yocto":"${rec.amount_yocto}"}}`
    );
    return NearPromise.new(rec.freelancer).transfer(amount);
  }

  /**
   * Scoped Mediator Agent records a structured split proposal (`refund_bps` 0..10000)
   * without moving funds directly.
   */
  @call({})
  propose_mediation({
    order_id,
    refund_bps,
    decision,
    reason_hash,
  }: {
    order_id: string;
    refund_bps: number;
    decision: string;
    reason_hash: string;
  }): EscrowRecord {
    this.ensureConfigured();
    const caller = near.predecessorAccountId();
    assert(
      caller === this.verifier_agent || caller === this.owner,
      "Only scoped verifier_agent or owner can record mediation verdict"
    );
    const rec = this.escrows.get(order_id);
    assert(rec !== null, "Escrow order not found");
    assert(rec.status !== "SEALED" && rec.status !== "REFUNDED", "Order already settled");
    assert(refund_bps >= 0 && refund_bps <= 10000, "refund_bps must be between 0 and 10000");

    rec.status = "DISPUTED";
    rec.mediation = {
      refund_bps,
      decision,
      reason_hash,
      proposed_by: caller,
      proposed_at_ns: near.blockTimestamp().toString(),
    };
    this.escrows.set(order_id, rec);
    near.log(
      `EVENT_JSON:{"standard":"nearsignet","version":"1.0.0","event":"mediation_proposed","data":{"order_id":"${order_id}","refund_bps":${refund_bps},"decision":"${decision}"}}`
    );
    return rec;
  }

  /**
   * Executes a proposed mediation split atomically between client and freelancer.
   * Requires consent from client, freelancer (if 100% refund), or contract owner/arbiter.
   */
  @call({})
  execute_mediation({ order_id }: { order_id: string }): NearPromise {
    this.ensureConfigured();
    const caller = near.predecessorAccountId();
    const rec = this.escrows.get(order_id);
    assert(rec !== null, "Escrow order not found");
    assert(rec.status === "DISPUTED" && rec.mediation !== null, "No active mediation proposal");
    assert(caller !== this.verifier_agent, "AI Firewall: verifier_agent cannot execute transfers");
    assert(
      caller === this.owner || caller === rec.client || caller === rec.freelancer,
      "Unauthorized caller for mediation settlement"
    );

    const total = BigInt(rec.amount_yocto);
    const bps = BigInt(rec.mediation.refund_bps);
    const clientShare = (total * bps) / BigInt(10000);
    const freelancerShare = total - clientShare;

    rec.status = bps > BigInt(0) ? "REFUNDED" : "SEALED";
    rec.sealed_at_ns = near.blockTimestamp().toString();
    rec.seal_id = bps === BigInt(0) ? `SEAL-${rec.order_id}` : `MED-${rec.order_id}-${bps.toString()}BPS`;
    this.escrows.set(order_id, rec);
    this.total_locked_yocto = (BigInt(this.total_locked_yocto) - total).toString();
    if (bps === BigInt(0)) this.total_sealed_count += 1;

    near.log(
      `EVENT_JSON:{"standard":"nearsignet","version":"1.0.0","event":"mediation_settled","data":{"order_id":"${order_id}","client_yocto":"${clientShare.toString()}","freelancer_yocto":"${freelancerShare.toString()}"}}`
    );

    if (clientShare > BigInt(0) && freelancerShare > BigInt(0)) {
      return NearPromise.new(rec.client).transfer(clientShare).and(NearPromise.new(rec.freelancer).transfer(freelancerShare));
    }
    if (clientShare > BigInt(0)) {
      return NearPromise.new(rec.client).transfer(clientShare);
    }
    return NearPromise.new(rec.freelancer).transfer(freelancerShare);
  }

  @view({})
  get_escrow({ order_id }: { order_id: string }): EscrowRecord | null {
    return this.escrows.get(order_id);
  }

  @view({})
  list_escrows({ from_index = 0, limit = 25 }: { from_index?: number; limit?: number }): EscrowRecord[] {
    const out: EscrowRecord[] = [];
    const keys = this.escrows.keys({ start: from_index, limit: Math.min(limit, 50) });
    for (const k of keys) {
      const v = this.escrows.get(k);
      if (v) out.push(v);
    }
    return out;
  }

  @view({})
  get_stats(): {
    owner: string;
    verifier_agent: string;
    total_locked_yocto: string;
    total_sealed_count: number;
    total_orders: number;
  } {
    return {
      owner: this.owner || near.currentAccountId(),
      verifier_agent: this.verifier_agent || `verifier.${near.currentAccountId()}`,
      total_locked_yocto: this.total_locked_yocto,
      total_sealed_count: this.total_sealed_count,
      total_orders: this.escrows.length,
    };
  }
}
