import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { referrer, referee } = req.body as { referrer?: string; referee?: string };
  if (!referrer || !referee) return res.status(400).json({ error: "Missing fields" });

  const ref = referrer.toLowerCase().trim();
  const ree = referee.toLowerCase().trim();
  if (ref === ree) return res.status(400).json({ error: "Cannot refer yourself" });

  try {
    const redis = Redis.fromEnv();
    const existing = await redis.get(`ref:by:${ree}`);
    if (existing) return res.status(200).json({ ok: true, already: true });

    await redis.set(`ref:by:${ree}`, ref);
    await redis.lpush(`ref:list:${ref}`, ree);

    return res.status(200).json({ ok: true, already: false });
  } catch (err) {
    console.error("[referral-track]", err);
    return res.status(500).json({ error: "Storage error" });
  }
}
