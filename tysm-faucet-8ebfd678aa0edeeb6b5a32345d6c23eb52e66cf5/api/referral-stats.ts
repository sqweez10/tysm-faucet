import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const ETH_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { address } = req.query as { address?: string };
  if (!address || !ETH_ADDR_RE.test(address)) {
    return res.status(400).json({ error: "Invalid or missing address" });
  }

  const addr = address.toLowerCase();

  try {
    const redis = Redis.fromEnv();
    const referrals = (await redis.lrange(`ref:list:${addr}`, 0, -1)) as string[];
    return res.status(200).json({
      count: referrals.length,
      referrals: referrals.slice(0, 20),
    });
  } catch (err) {
    console.error("[referral-stats]", err);
    return res.status(500).json({ error: "Storage error" });
  }
}
