import { Router } from "express";
import { Redis } from "@upstash/redis";

const ETH_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

const router = Router();

router.post("/referral-track", async (req, res) => {
  const { referrer, referee } = (req.body || {}) as { referrer?: string; referee?: string };

  if (!referrer || !referee) return res.status(400).json({ error: "Missing fields" });
  if (!ETH_ADDR_RE.test(referrer)) return res.status(400).json({ error: "Invalid referrer address" });
  if (!ETH_ADDR_RE.test(referee))  return res.status(400).json({ error: "Invalid referee address" });

  const ref = referrer.toLowerCase();
  const ree = referee.toLowerCase();
  if (ref === ree) return res.status(400).json({ error: "Cannot refer yourself" });

  try {
    const redis = Redis.fromEnv();

    // Rate limiting: max 5 attempts per referee per 60s
    const rlKey = `rl:track:${ree}`;
    const rlCount = (await redis.incr(rlKey)) as number;
    if (rlCount === 1) await redis.expire(rlKey, 60);
    if (rlCount > 5) return res.status(429).json({ error: "Too many requests. Try again in a minute." });

    // Atomic SET NX — eliminates race conditions
    const wasSet = await redis.set(`ref:by:${ree}`, ref, { nx: true });

    if (!wasSet) {
      return res.status(200).json({ ok: true, already: true });
    }

    await redis.lpush(`ref:list:${ref}`, ree);
    return res.status(200).json({ ok: true, already: false });
  } catch (err) {
    req.log?.error({ err }, "[referral-track] Redis error");
    return res.status(500).json({ error: "Storage error" });
  }
});

export default router;
