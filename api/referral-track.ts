import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const ETH_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const ALLOWED_ORIGINS = new Set([
  "https://tysm-faucet.vercel.app",
  "http://localhost:5173",
  "http://localhost:24555",
]);

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.has(origin) || origin.endsWith(".vercel.app")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { referrer, referee } = (req.body || {}) as { referrer?: string; referee?: string };

  // Strict ETH address validation
  if (!referrer || !referee) return res.status(400).json({ error: "Missing fields" });
  if (!ETH_ADDR_RE.test(referrer)) return res.status(400).json({ error: "Invalid referrer address" });
  if (!ETH_ADDR_RE.test(referee))  return res.status(400).json({ error: "Invalid referee address" });

  const ref = referrer.toLowerCase();
  const ree = referee.toLowerCase();
  if (ref === ree) return res.status(400).json({ error: "Cannot refer yourself" });

  try {
    const redis = Redis.fromEnv();

    // Rate limiting: max 5 attempts per referee per 60s (prevents bot spam)
    const rlKey = `rl:track:${ree}`;
    const rlCount = (await redis.incr(rlKey)) as number;
    if (rlCount === 1) await redis.expire(rlKey, 60);
    if (rlCount > 5) return res.status(429).json({ error: "Too many requests. Try again in a minute." });

    // ATOMIC SET NX — eliminates race conditions completely.
    // Redis executes this as a single operation: set only if key doesn't exist.
    // Two simultaneous requests: one gets "OK" (proceeds), other gets null (blocked).
    const wasSet = await redis.set(`ref:by:${ree}`, ref, { nx: true });

    if (!wasSet) {
      // Referee already has a referrer — first-come-first-served enforced
      return res.status(200).json({ ok: true, already: true });
    }

    // Only reached by the ONE request that won the atomic race
    await redis.lpush(`ref:list:${ref}`, ree);

    return res.status(200).json({ ok: true, already: false });
  } catch (err) {
    console.error("[referral-track]", err);
    return res.status(500).json({ error: "Storage error" });
  }
}
