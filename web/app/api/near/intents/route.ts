import { NextResponse } from "next/server";
import { getCrossChainIntentsQuote } from "@/lib/near";

export const dynamic = "force-dynamic";

const ASSET_MAP: Record<string, string> = {
  NEAR: "near-native",
  USDC: "usdc-base",
  USDT: "usdt-arb",
  ETH: "eth-base",
};

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as {
    origin?: string;
    fromAsset?: string;
    amountUsd?: number;
    usdAmount?: number;
    recipient?: string;
    recipientId?: string;
  };
  const origin = b.origin || ASSET_MAP[String(b.fromAsset || "NEAR").toUpperCase()] || "usdc-base";
  const amountUsd = Math.max(1, Number(b.usdAmount ?? b.amountUsd ?? 150));
  const recipient = String(b.recipientId ?? b.recipient ?? "nearsignet.testnet");
  const quote = await getCrossChainIntentsQuote(origin, amountUsd, recipient);
  return NextResponse.json(
    {
      ...quote,
      amountInFormatted: quote.originAmount,
      nearOut: quote.destinationAmountNear.replace(/\s*NEAR$/i, ""),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
