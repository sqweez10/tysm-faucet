import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { randomBytes } from "crypto";
import { privateKeyToAccount } from "viem/accounts";

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const EVM_PRIVATE_KEY_RE = /^0x[a-fA-F0-9]{64}$/;
const FARCASTER_CAST_HASH_RE = /^0x[a-fA-F0-9]{40}$/;

const BASE_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;

const SUPPORTED_CHAIN_IDS = new Set([BASE_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID]);

const SHARE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const AUTHORIZATION_TTL_SECONDS = 10 * 60;

const RATE_LIMIT_WINDOW_SECONDS = 10 * 60;
const RATE_LIMIT_MAX_PER_FID = 5;
const RATE_LIMIT_MAX_PER_WALLET = 5;
const RATE_LIMIT_MAX_PER_CAST = 3;

const SHARE_MARKERS = [
  "#tysmfaucet",
  "tysm-faucet",
  "tysm-faucet.vercel.app",
  "@tops87sqweezz.base.eth",
];

type ClaimAuthorizationRequestBody = {
  fid?: unknown;
  wallet?: unknown;
  castHash?: unknown;
  client?: unknown;
  chainId?: unknown;
};

type ChainConfig = {
  chainId: number;
  chainName: "base" | "base-sepolia";
  contractAddress: string;
  signerAddress: string;
  signerPrivateKey: `0x${string}`;
};

type AppConfig = {
  chain: ChainConfig;
  neynarApiKey: string;
  redis: Redis;
};

type NeynarCastAuthor = {
  fid?: number;
};

type NeynarCast = {
  hash?: string;
  text?: string;
  timestamp?: string;
  created_at?: string;
  author?: NeynarCastAuthor;
};

type NeynarCastResponse = {
  cast?: NeynarCast;
} & NeynarCast;

type NeynarVerifiedAddresses = {
  eth_addresses?: string[];
  sol_addresses?: string[];
  primary?: {
    eth_address?: string;
    sol_address?: string;
  };
};

type NeynarUser = {
  fid?: number;
  custody_address?: string;
  verified_addresses?: NeynarVerifiedAddresses;
};

type NeynarUserResponse = {
  user?: NeynarUser;
  users?: NeynarUser[];
};

type VerifiedCast = {
  hash: string;
  authorFid: number;
  text: string;
  timestamp: string | null;
};

type ClaimAuthorizationResponse = {
  deadline: number;
  nonce: `0x${string}`;
  signature: `0x${string}`;
};

type SafeErrorCode =
  | "invalid_request"
  | "unsupported_chain"
  | "wallet_fid_mismatch"
  | "share_not_found"
  | "share_already_used"
  | "cooldown_active"
  | "rate_limited"
  | "signing_unavailable"
  | "not_eligible";

function setCorsHeaders(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendError(
  res: VercelResponse,
  status: number,
  error: SafeErrorCode,
  message: string
) {
  return res.status(status).json({ error, message });
}

function normalizeWallet(wallet: string) {
  return wallet.trim().toLowerCase();
}

function normalizeAddress(address: string) {
  return address.trim().toLowerCase();
}

function isValidEthAddress(value: unknown): value is string {
  return typeof value === "string" && ETH_ADDRESS_RE.test(value);
}

function isValidPrivateKey(value: unknown): value is `0x${string}` {
  return typeof value === "string" && EVM_PRIVATE_KEY_RE.test(value);
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function parseChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }

  return null;
}

function readBody(req: VercelRequest): ClaimAuthorizationRequestBody {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as ClaimAuthorizationRequestBody;
    } catch {
      return {};
    }
  }

  if (typeof req.body === "object") {
    return req.body as ClaimAuthorizationRequestBody;
  }

  return {};
}

function readRequiredEnv(name: string): string | null {
  const value = process.env[name];

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

function readEnvAddress(name: string): string | null {
  const value = process.env[name];

  if (!isValidEthAddress(value)) {
    return null;
  }

  return normalizeAddress(value);
}

function readEnvPrivateKey(name: string): `0x${string}` | null {
  const value = process.env[name];

  if (!isValidPrivateKey(value)) {
    return null;
  }

  return value;
}

function getChainConfig(chainId: number): ChainConfig | null {
  if (chainId === BASE_CHAIN_ID) {
    const contractAddress = readEnvAddress("TYSM_V3_BASE_CONTRACT_ADDRESS");
    const signerAddress = readEnvAddress("TYSM_V3_BASE_SIGNER_ADDRESS");
    const signerPrivateKey = readEnvPrivateKey("TYSM_V3_BASE_SIGNER_PRIVATE_KEY");

    if (!contractAddress || !signerAddress || !signerPrivateKey) {
      return null;
    }

    return {
      chainId: BASE_CHAIN_ID,
      chainName: "base",
      contractAddress,
      signerAddress,
      signerPrivateKey,
    };
  }

  if (chainId === BASE_SEPOLIA_CHAIN_ID) {
    const contractAddress = readEnvAddress("TYSM_V3_SEPOLIA_CONTRACT_ADDRESS");
    const signerAddress = readEnvAddress("TYSM_V3_SEPOLIA_SIGNER_ADDRESS");
    const signerPrivateKey = readEnvPrivateKey(
      "TYSM_V3_SEPOLIA_SIGNER_PRIVATE_KEY"
    );

    if (!contractAddress || !signerAddress || !signerPrivateKey) {
      return null;
    }

    return {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      chainName: "base-sepolia",
      contractAddress,
      signerAddress,
      signerPrivateKey,
    };
  }

  return null;
}

function getRedis(): Redis | null {
  const url = readRequiredEnv("UPSTASH_REDIS_REST_URL");
  const token = readRequiredEnv("UPSTASH_REDIS_REST_TOKEN");

  if (!url || !token) {
    return null;
  }

  return new Redis({
    url,
    token,
  });
}

function getAppConfig(chainId: number): AppConfig | null {
  const chain = getChainConfig(chainId);
  if (!chain) {
    return null;
  }

  const neynarApiKey = readRequiredEnv("NEYNAR_API_KEY");
  if (!neynarApiKey) {
    return null;
  }

  const redis = getRedis();
  if (!redis) {
    return null;
  }

  return {
    chain,
    neynarApiKey,
    redis,
  };
}

function generateNonce(): `0x${string}` {
  return `0x${randomBytes(32).toString("hex")}`;
}

function generateDeadline(nowSeconds = Math.floor(Date.now() / 1000)): number {
  return nowSeconds + AUTHORIZATION_TTL_SECONDS;
}

function getClaimAuthorizationDomain(chain: ChainConfig) {
  return {
    name: "TYSMFaucetV3",
    version: "1",
    chainId: chain.chainId,
    verifyingContract: chain.contractAddress as `0x${string}`,
  } as const;
}

const claimAuthorizationTypes = {
  ClaimAuthorization: [
    { name: "user", type: "address" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

async function signClaimAuthorization(params: {
  chain: ChainConfig;
  user: string;
  deadline: number;
  nonce: `0x${string}`;
}): Promise<
  | {
      ok: true;
      signature: `0x${string}`;
    }
  | {
      ok: false;
      internalReason: "signer_mismatch" | "signing_failed";
    }
> {
  try {
    const account = privateKeyToAccount(params.chain.signerPrivateKey);

    if (normalizeAddress(account.address) !== params.chain.signerAddress) {
      return {
        ok: false,
        internalReason: "signer_mismatch",
      };
    }

    const signature = await account.signTypedData({
      domain: getClaimAuthorizationDomain(params.chain),
      types: claimAuthorizationTypes,
      primaryType: "ClaimAuthorization",
      message: {
        user: params.user as `0x${string}`,
        deadline: BigInt(params.deadline),
        nonce: params.nonce,
      },
    });

    return {
      ok: true,
      signature,
    };
  } catch {
    return {
      ok: false,
      internalReason: "signing_failed",
    };
  }
}

function validateRequestBody(body: ClaimAuthorizationRequestBody):
  | {
      ok: true;
      fid: number;
      wallet: string;
      castHash: string;
      client: string | null;
      chainId: number;
    }
  | {
      ok: false;
      status: number;
      error: SafeErrorCode;
      message: string;
    } {
  const fid = parsePositiveInteger(body.fid);
  if (!fid) {
    return {
      ok: false,
      status: 400,
      error: "invalid_request",
      message: "Required fields are missing.",
    };
  }

  if (typeof body.wallet !== "string" || !ETH_ADDRESS_RE.test(body.wallet)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_request",
      message: "Required fields are missing.",
    };
  }

  if (
    typeof body.castHash !== "string" ||
    !FARCASTER_CAST_HASH_RE.test(body.castHash)
  ) {
    return {
      ok: false,
      status: 400,
      error: "invalid_request",
      message: "Required fields are missing.",
    };
  }

  const chainId = parseChainId(body.chainId);
  if (!chainId) {
    return {
      ok: false,
      status: 400,
      error: "invalid_request",
      message: "Required fields are missing.",
    };
  }

  if (!SUPPORTED_CHAIN_IDS.has(chainId)) {
    return {
      ok: false,
      status: 400,
      error: "unsupported_chain",
      message: "This chain is not supported.",
    };
  }

  const client = typeof body.client === "string" ? body.client.slice(0, 80) : null;

  return {
    ok: true,
    fid,
    wallet: normalizeWallet(body.wallet),
    castHash: body.castHash.toLowerCase(),
    client,
    chainId,
  };
}

function getCastFromNeynarResponse(json: NeynarCastResponse): NeynarCast | null {
  if (json.cast && typeof json.cast === "object") {
    return json.cast;
  }

  if (json.hash || json.author || json.text) {
    return json;
  }

  return null;
}

function castHasRequiredMarker(text: string): boolean {
  const normalizedText = text.toLowerCase();

  return SHARE_MARKERS.some((marker) => normalizedText.includes(marker));
}

function isRecentCast(timestamp: string | null): boolean {
  if (!timestamp) {
    return false;
  }

  const createdAtMs = Date.parse(timestamp);
  if (!Number.isFinite(createdAtMs)) {
    return false;
  }

  const ageMs = Date.now() - createdAtMs;
  if (ageMs < 0) {
    return false;
  }

  return ageMs <= SHARE_MAX_AGE_SECONDS * 1000;
}

async function fetchCastByHash(
  apiKey: string,
  castHash: string
): Promise<VerifiedCast | null> {
  const url =
    "https://api.neynar.com/v2/farcaster/cast/" +
    `?identifier=${encodeURIComponent(castHash)}` +
    "&type=hash";

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      api_key: apiKey,
    },
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as NeynarCastResponse;
  const cast = getCastFromNeynarResponse(json);

  if (!cast) {
    return null;
  }

  const authorFid = cast.author?.fid;
  const text = typeof cast.text === "string" ? cast.text : "";
  const timestamp =
    typeof cast.timestamp === "string"
      ? cast.timestamp
      : typeof cast.created_at === "string"
        ? cast.created_at
        : null;

  if (!authorFid || typeof authorFid !== "number") {
    return null;
  }

  return {
    hash: typeof cast.hash === "string" ? cast.hash.toLowerCase() : castHash,
    authorFid,
    text,
    timestamp,
  };
}

async function verifyShareCast(params: {
  apiKey: string;
  castHash: string;
  fid: number;
}): Promise<
  | {
      ok: true;
      cast: VerifiedCast;
    }
  | {
      ok: false;
      internalReason:
        | "cast_not_found"
        | "author_mismatch"
        | "cast_not_recent"
        | "missing_marker";
    }
> {
  const cast = await fetchCastByHash(params.apiKey, params.castHash);

  if (!cast) {
    return {
      ok: false,
      internalReason: "cast_not_found",
    };
  }

  if (cast.authorFid !== params.fid) {
    return {
      ok: false,
      internalReason: "author_mismatch",
    };
  }

  if (!isRecentCast(cast.timestamp)) {
    return {
      ok: false,
      internalReason: "cast_not_recent",
    };
  }

  if (!castHasRequiredMarker(cast.text)) {
    return {
      ok: false,
      internalReason: "missing_marker",
    };
  }

  return {
    ok: true,
    cast,
  };
}

function getUserFromNeynarResponse(json: NeynarUserResponse): NeynarUser | null {
  if (json.user && typeof json.user === "object") {
    return json.user;
  }

  if (Array.isArray(json.users) && json.users.length > 0) {
    return json.users[0] ?? null;
  }

  return null;
}

function collectUserEthAddresses(user: NeynarUser): string[] {
  const addresses = new Set<string>();

  if (isValidEthAddress(user.custody_address)) {
    addresses.add(normalizeAddress(user.custody_address));
  }

  const verified = user.verified_addresses;

  if (Array.isArray(verified?.eth_addresses)) {
    for (const address of verified.eth_addresses) {
      if (isValidEthAddress(address)) {
        addresses.add(normalizeAddress(address));
      }
    }
  }

  if (isValidEthAddress(verified?.primary?.eth_address)) {
    addresses.add(normalizeAddress(verified.primary.eth_address));
  }

  return [...addresses];
}

async function fetchUserByFid(
  apiKey: string,
  fid: number
): Promise<NeynarUser | null> {
  const url =
    "https://api.neynar.com/v2/farcaster/user/bulk" +
    `?fids=${encodeURIComponent(String(fid))}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      api_key: apiKey,
    },
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as NeynarUserResponse;
  const user = getUserFromNeynarResponse(json);

  if (!user || user.fid !== fid) {
    return null;
  }

  return user;
}

async function verifyWalletFidAssociation(params: {
  apiKey: string;
  fid: number;
  wallet: string;
}): Promise<
  | {
      ok: true;
      matchedAddress: string;
    }
  | {
      ok: false;
      internalReason: "user_not_found" | "wallet_not_associated";
    }
> {
  const user = await fetchUserByFid(params.apiKey, params.fid);

  if (!user) {
    return {
      ok: false,
      internalReason: "user_not_found",
    };
  }

  const wallet = normalizeAddress(params.wallet);
  const userAddresses = collectUserEthAddresses(user);

  if (!userAddresses.includes(wallet)) {
    return {
      ok: false,
      internalReason: "wallet_not_associated",
    };
  }

  return {
    ok: true,
    matchedAddress: wallet,
  };
}

function usedCastKey(castHash: string) {
  return `tysm:v3:used_cast:${castHash.toLowerCase()}`;
}

async function isCastAlreadyUsed(redis: Redis, castHash: string): Promise<boolean> {
  const existing = await redis.get(usedCastKey(castHash));
  return existing !== null;
}

async function markCastUsed(params: {
  redis: Redis;
  castHash: string;
  fid: number;
  wallet: string;
  chainId: number;
  deadline: number;
}): Promise<void> {
  await params.redis.set(usedCastKey(params.castHash), {
    fid: params.fid,
    wallet: params.wallet,
    chainId: params.chainId,
    deadline: params.deadline,
    usedAt: Math.floor(Date.now() / 1000),
  });
}

type RateLimitResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      internalReason: "fid" | "wallet" | "cast";
    };

async function incrementRateLimit(params: {
  redis: Redis;
  key: string;
  max: number;
}): Promise<boolean> {
  const count = await params.redis.incr(params.key);

  if (count === 1) {
    await params.redis.expire(params.key, RATE_LIMIT_WINDOW_SECONDS);
  }

  return count <= params.max;
}

function rateLimitKey(kind: "fid" | "wallet" | "cast", value: string | number) {
  return `tysm:v3:rl:${kind}:${String(value).toLowerCase()}`;
}

async function checkRateLimits(params: {
  redis: Redis;
  fid: number;
  wallet: string;
  castHash: string;
}): Promise<RateLimitResult> {
  const fidOk = await incrementRateLimit({
    redis: params.redis,
    key: rateLimitKey("fid", params.fid),
    max: RATE_LIMIT_MAX_PER_FID,
  });

  if (!fidOk) {
    return {
      ok: false,
      internalReason: "fid",
    };
  }

  const walletOk = await incrementRateLimit({
    redis: params.redis,
    key: rateLimitKey("wallet", params.wallet),
    max: RATE_LIMIT_MAX_PER_WALLET,
  });

  if (!walletOk) {
    return {
      ok: false,
      internalReason: "wallet",
    };
  }

  const castOk = await incrementRateLimit({
    redis: params.redis,
    key: rateLimitKey("cast", params.castHash),
    max: RATE_LIMIT_MAX_PER_CAST,
  });

  if (!castOk) {
    return {
      ok: false,
      internalReason: "cast",
    };
  }

  return {
    ok: true,
  };
}

type DenylistResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      internalReason: "wallet" | "fid" | "cast";
    };

function denylistKey(kind: "wallet" | "fid" | "cast", value: string | number) {
  return `tysm:v3:deny:${kind}:${String(value).toLowerCase()}`;
}

async function isDenylisted(redis: Redis, key: string): Promise<boolean> {
  const existing = await redis.get(key);
  return existing !== null;
}

async function checkDenylist(params: {
  redis: Redis;
  fid: number;
  wallet: string;
  castHash: string;
}): Promise<DenylistResult> {
  const walletDenied = await isDenylisted(
    params.redis,
    denylistKey("wallet", params.wallet)
  );

  if (walletDenied) {
    return {
      ok: false,
      internalReason: "wallet",
    };
  }

  const fidDenied = await isDenylisted(
    params.redis,
    denylistKey("fid", params.fid)
  );

  if (fidDenied) {
    return {
      ok: false,
      internalReason: "fid",
    };
  }

  const castDenied = await isDenylisted(
    params.redis,
    denylistKey("cast", params.castHash)
  );

  if (castDenied) {
    return {
      ok: false,
      internalReason: "cast",
    };
  }

  return {
    ok: true,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = readBody(req);
    const validation = validateRequestBody(body);

    if (!validation.ok) {
      return sendError(
        res,
        validation.status,
        validation.error,
        validation.message
      );
    }

    const appConfig = getAppConfig(validation.chainId);

    if (!appConfig) {
      console.error("[claim-authorization] missing or invalid app config", {
        chainId: validation.chainId,
        hasNeynarApiKey: Boolean(process.env.NEYNAR_API_KEY),
        hasRedisUrl: Boolean(process.env.UPSTASH_REDIS_REST_URL),
        hasRedisToken: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
        hasBasePrivateKey: Boolean(process.env.TYSM_V3_BASE_SIGNER_PRIVATE_KEY),
        hasSepoliaPrivateKey: Boolean(
          process.env.TYSM_V3_SEPOLIA_SIGNER_PRIVATE_KEY
        ),
      });

      return sendError(
        res,
        503,
        "signing_unavailable",
        "The claim service is temporarily unavailable. Please try again shortly."
      );
    }

    const rateLimit = await checkRateLimits({
      redis: appConfig.redis,
      fid: validation.fid,
      wallet: validation.wallet,
      castHash: validation.castHash,
    });

    if (!rateLimit.ok) {
      console.info("[claim-authorization] rate limited", {
        fid: validation.fid,
        wallet: validation.wallet,
        castHash: validation.castHash,
        chainId: appConfig.chain.chainId,
        reason: rateLimit.internalReason,
      });

      return sendError(
        res,
        429,
        "rate_limited",
        "Too many requests. Please slow down and try again shortly."
      );
    }

    const denylist = await checkDenylist({
      redis: appConfig.redis,
      fid: validation.fid,
      wallet: validation.wallet,
      castHash: validation.castHash,
    });

    if (!denylist.ok) {
      console.info("[claim-authorization] denylist rejected request", {
        fid: validation.fid,
        wallet: validation.wallet,
        castHash: validation.castHash,
        chainId: appConfig.chain.chainId,
        reason: denylist.internalReason,
      });

      return sendError(
        res,
        403,
        "not_eligible",
        "Claim eligibility could not be verified right now. Please try again later or contact support."
      );
    }

    const castAlreadyUsed = await isCastAlreadyUsed(
      appConfig.redis,
      validation.castHash
    );

    if (castAlreadyUsed) {
      console.info("[claim-authorization] used cast rejected", {
        fid: validation.fid,
        wallet: validation.wallet,
        castHash: validation.castHash,
        chainId: appConfig.chain.chainId,
      });

      return sendError(
        res,
        400,
        "share_already_used",
        "This share has already been used for a claim."
      );
    }

    const walletVerification = await verifyWalletFidAssociation({
      apiKey: appConfig.neynarApiKey,
      fid: validation.fid,
      wallet: validation.wallet,
    });

    if (!walletVerification.ok) {
      console.info("[claim-authorization] wallet/FID verification failed", {
        fid: validation.fid,
        wallet: validation.wallet,
        chainId: appConfig.chain.chainId,
        reason: walletVerification.internalReason,
      });

      return sendError(
        res,
        400,
        "wallet_fid_mismatch",
        "This wallet could not be verified for this account."
      );
    }

    const shareVerification = await verifyShareCast({
      apiKey: appConfig.neynarApiKey,
      castHash: validation.castHash,
      fid: validation.fid,
    });

    if (!shareVerification.ok) {
      console.info("[claim-authorization] share verification failed", {
        fid: validation.fid,
        wallet: validation.wallet,
        castHash: validation.castHash,
        chainId: appConfig.chain.chainId,
        reason: shareVerification.internalReason,
      });

      return sendError(
        res,
        400,
        "share_not_found",
        "Please share your TYSM streak before claiming."
      );
    }

    const nonce = generateNonce();
    const deadline = generateDeadline();

    const signedAuthorization = await signClaimAuthorization({
      chain: appConfig.chain,
      user: validation.wallet,
      deadline,
      nonce,
    });

    if (!signedAuthorization.ok) {
      console.error("[claim-authorization] signing failed", {
        fid: validation.fid,
        wallet: validation.wallet,
        castHash: validation.castHash,
        chainId: appConfig.chain.chainId,
        signerAddress: appConfig.chain.signerAddress,
        reason: signedAuthorization.internalReason,
      });

      return sendError(
        res,
        503,
        "signing_unavailable",
        "The claim service is temporarily unavailable. Please try again shortly."
      );
    }

    await markCastUsed({
      redis: appConfig.redis,
      castHash: validation.castHash,
      fid: validation.fid,
      wallet: validation.wallet,
      chainId: appConfig.chain.chainId,
      deadline,
    });

    console.info("[claim-authorization] issued signed authorization", {
      fid: validation.fid,
      wallet: validation.wallet,
      matchedAddress: walletVerification.matchedAddress,
      castHash: validation.castHash,
      castAuthorFid: shareVerification.cast.authorFid,
      client: validation.client,
      chainId: appConfig.chain.chainId,
      chainName: appConfig.chain.chainName,
      contractAddress: appConfig.chain.contractAddress,
      signerAddress: appConfig.chain.signerAddress,
      deadline,
      noncePreview: `${nonce.slice(0, 10)}...${nonce.slice(-6)}`,
      stage: "signed-authorization-issued",
    });

    const responseBody: ClaimAuthorizationResponse = {
      deadline,
      nonce,
      signature: signedAuthorization.signature,
    };

    return res.status(200).json(responseBody);
  } catch (err) {
    console.error("[claim-authorization] unexpected error", err);

    return sendError(
      res,
      500,
      "signing_unavailable",
      "The claim service is temporarily unavailable. Please try again shortly."
    );
  }
}
