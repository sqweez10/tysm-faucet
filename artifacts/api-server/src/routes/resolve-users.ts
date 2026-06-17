import { Router } from "express";

type NeynarUser = {
  fid?: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
  custody_address?: string;
  verified_addresses?: { eth_addresses?: string[]; sol_addresses?: string[] };
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const router = Router();

router.get("/resolve-users", async (req, res) => {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing NEYNAR_API_KEY" });

  const addressesParam = req.query.addresses;
  if (!addressesParam || typeof addressesParam !== "string") {
    return res.status(400).json({ error: "Missing addresses query param" });
  }

  const addresses = addressesParam
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 50);

  if (addresses.length === 0) return res.status(400).json({ error: "No valid addresses" });

  try {
    const neynarRes = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address/?addresses=${encodeURIComponent(addresses.join(","))}`,
      { headers: { accept: "application/json", api_key: apiKey } },
    );

    if (!neynarRes.ok) return res.status(neynarRes.status).json({ error: "Neynar request failed" });

    const usersRaw = (await neynarRes.json()) as Record<string, NeynarUser[]>;

    const byAddress: Record<string, { fid: number | null; username: string | null; displayName: string | null; handle: string; profileUrl: string | null }> = {};

    for (const address of addresses) {
      byAddress[address] = { fid: null, username: null, displayName: null, handle: shortAddress(address), profileUrl: null };
    }

    for (const [rawAddr, users] of Object.entries(usersRaw)) {
      const addr = rawAddr.trim().toLowerCase();
      if (!byAddress[addr]) continue;
      const user = Array.isArray(users) ? users[0] : users;
      if (!user) continue;
      byAddress[addr] = {
        fid: user.fid ?? null,
        username: user.username ?? null,
        displayName: user.display_name ?? null,
        handle: user.username ? `@${user.username}` : shortAddress(addr),
        profileUrl: user.username ? `https://farcaster.xyz/${user.username}` : null,
      };
    }

    return res.status(200).json({ users: byAddress });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
