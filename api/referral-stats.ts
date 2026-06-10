import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { address } = req.query as { address?: string };
  if (!address) return res.status(400).json({ error: "Missing address" });

  const addr = address.toLowerCase().trim();

  try {
    const redis = Redis.fromEnv();
    const referrals = (await redis.lrange(`ref:list:${addr}`, 0, -1)) as string[];
    return res.status(200).json({ count: referrals.length, referrals: referrals.slice(0, 20) });
  } catch (err) {
    console.error("[referral-stats]", err);
    return res.status(500).json({ error: "Storage error" });
  }
}
