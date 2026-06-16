import { Router, type IRouter } from "express";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const FAUCET = (process.env.VITE_FAUCET_ADDRESS ?? process.env.NEXT_PUBLIC_FAUCET_ADDRESS ?? "") as `0x${string}`;

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

const router: IRouter = Router();

router.get("/leaderboard", async (_req, res) => {
  try {
    if (!FAUCET || FAUCET === "0x0000000000000000000000000000000000000000") {
      res.json({ leaderboard: [], updatedAt: Date.now() });
      return;
    }

    const bsUrl =
      `https://base.blockscout.com/api/v2/addresses/${FAUCET}/transactions` +
      `?filter=to`;

    const bsRes  = await fetch(bsUrl, {
      headers: { "Accept": "application/json" },
    });
    const bsJson = await bsRes.json() as { items?: Array<{ from: { hash: string }; status: string }> };

    let addresses: `0x${string}`[] = [];

    if (Array.isArray(bsJson.items)) {
      const seen = new Set<string>();
      for (const tx of bsJson.items) {
        const from = tx.from?.hash?.toLowerCase();
        if (from && tx.status === "ok" && !seen.has(from)) {
          seen.add(from);
          addresses.push(tx.from.hash as `0x${string}`);
          if (addresses.length >= 25) break;
        }
      }
    }

    if (addresses.length === 0) {
      res.json({ leaderboard: [], updatedAt: Date.now() });
      return;
    }

    const calls = addresses.map((addr) => ({
      address: FAUCET,
      abi: USER_INFO_ABI,
      functionName: "userInfo" as const,
      args: [addr] as const,
    }));

    const results = await client.multicall({ contracts: calls, allowFailure: true });

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
          hearts: 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.totalDays - a!.totalDays)
      .slice(0, 10)
      .map((e, i) => ({ ...e!, rank: i + 1 }));

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json({ leaderboard, updatedAt: Date.now() });
  } catch (err) {
    _req.log.error({ err }, "[leaderboard] fetch failed");
    res.status(200).json({ leaderboard: [], updatedAt: Date.now(), error: "Fetch failed" });
  }
});

export default router;
