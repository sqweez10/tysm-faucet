import { Router } from "express";
import { Redis } from "@upstash/redis";

const ETH_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

const router = Router();

router.get("/referral-stats", async (req, res) => {
  const address = req.query.address as string | undefined;
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
    req.log?.error({ err }, "[referral-stats] Redis error");
    return res.status(500).json({ error: "Storage error" });
  }
});

export default router;
