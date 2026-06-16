// app/api/leaderboard/route.ts
// ─────────────────────────────────────────────────────────────
//  Live Leaderboard API
//  - Fetches recent claimers from Basescan
//  - Reads userInfo via viem multicall
//  - Returns top 10 sorted by totalDays
//  - Cached for 5 seconds on Vercel Edge
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const FAUCET = (process.env.NEXT_PUBLIC_FAUCET_ADDRESS ?? "") as `0x${string}`;

// Public Base RPC — no key needed
const client = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

const USER_INFO_ABI = [
  {
    name: "userInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "lastClaim",    type: "uint256" },
      { name: "streak",       type: "uint256" },
      { name: "totalClaimed", type: "uint256" },
      { name: "totalDays",    type: "uint256" },
    ],
  },
] as const;

export const dynamic = "force-dynamic"; // never cache at Next.js level
export const revalidate = 0;

export async function GET() {
  try {
    if (!FAUCET || FAUCET === "0x0000000000000000000000000000000000000000") {
      return NextResponse.json({ leaderboard: [], updatedAt: Date.now() });
    }

    // ── Step 1: Get recent successful txs to the faucet ──────
    const bsUrl =
      `https://api.basescan.org/api` +
      `?module=account&action=txlist` +
      `&address=${FAUCET}` +
      `&sort=desc&page=1&offset=200` +
      `&apikey=YourApiKeyToken`; // free key or omit for limited calls

    const bsRes  = await fetch(bsUrl, { next: { revalidate: 5 } });
    const bsJson = await bsRes.json();

    let addresses: `0x${string}`[] = [];

    if (bsJson.status === "1" && Array.isArray(bsJson.result)) {
      const seen = new Set<string>();
      for (const tx of bsJson.result) {
        const from = (tx.from as string).toLowerCase();
        if (
          tx.to?.toLowerCase() === FAUCET.toLowerCase() &&
          tx.isError === "0" &&
          !seen.has(from)
        ) {
          seen.add(from);
          addresses.push(tx.from as `0x${string}`);
          if (addresses.length >= 25) break;
        }
      }
    }

    if (addresses.length === 0) {
      return NextResponse.json({ leaderboard: [], updatedAt: Date.now() });
    }

    // ── Step 2: Multicall userInfo for all addresses ──────────
    const calls = addresses.map((addr) => ({
      address: FAUCET,
      abi: USER_INFO_ABI,
      functionName: "userInfo" as const,
      args: [addr] as const,
    }));

    const results = await client.multicall({ contracts: calls, allowFailure: true });

    // ── Step 3: Build + sort leaderboard ─────────────────────
    const leaderboard = results
      .map((r, i) => {
        if (r.status !== "success") return null;
        const [, streak, , totalDays] = r.result as [bigint, bigint, bigint, bigint];
        const td = Number(totalDays);
        if (td === 0) return null;
        const addr = addresses[i];
        return {
          address: addr,
          handle: `${addr.slice(0, 6)}...${addr.slice(-4)}`,
          totalDays: td,
          streak: Number(streak),
          hearts: 0, // hearts need backend state; default 0
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.totalDays - a!.totalDays)
      .slice(0, 10)
      .map((e, i) => ({ ...e!, rank: i + 1 }));

    return NextResponse.json(
      { leaderboard, updatedAt: Date.now() },
      {
        headers: {
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("[leaderboard]", err);
    return NextResponse.json(
      { leaderboard: [], updatedAt: Date.now(), error: "Fetch failed" },
      { status: 200 } // return 200 so frontend doesn't crash
    );
  }
}
