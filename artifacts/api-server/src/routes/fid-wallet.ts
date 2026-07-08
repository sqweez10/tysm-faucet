import { Router } from "express";
  import { Redis } from "@upstash/redis";

  const ETH_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

  const router = Router();

  // UX/helper mapping ONLY: last wallet address seen for a given Farcaster FID.
  // This is NEVER used as a source of truth for claim eligibility, cooldown,
  // or countdown — those always come directly from the on-chain contract,
  // queried with the currently connected wagmi address.

  router.get("/fid-wallet", async (req, res) => {
    const fidRaw = req.query.fid;
    const fid = typeof fidRaw === "string" ? Number(fidRaw) : NaN;

    if (!Number.isInteger(fid) || fid <= 0) {
      return res.status(400).json({ error: "Invalid or missing fid" });
    }

    try {
      const redis = Redis.fromEnv();
      const wallet = (await redis.get(`fid:wallet:${fid}`)) as string | null;
      return res.status(200).json({ wallet: wallet ?? null });
    } catch (err) {
      req.log?.error({ err }, "[fid-wallet] Redis unavailable on GET");
      // Fail soft — never block the app on Redis errors.
      return res.status(200).json({ wallet: null, degraded: true });
    }
  });

  router.post("/fid-wallet", async (req, res) => {
    const { fid, wallet } = (req.body || {}) as { fid?: number; wallet?: string };

    if (!fid || !Number.isInteger(fid) || fid <= 0) {
      return res.status(400).json({ error: "Invalid or missing fid" });
    }
    if (!wallet || !ETH_ADDR_RE.test(wallet)) {
      return res.status(400).json({ error: "Invalid or missing wallet" });
    }

    const normalizedWallet = wallet.toLowerCase();

    try {
      const redis = Redis.fromEnv();
      await redis.set(`fid:wallet:${fid}`, normalizedWallet);
      return res.status(200).json({ ok: true });
    } catch (err) {
      req.log?.error({ err }, "[fid-wallet] Redis unavailable on POST");
      // Fail soft — this is a best-effort convenience mapping, not critical state.
      return res.status(200).json({ ok: false, degraded: true });
    }
  });

  export default router;
  