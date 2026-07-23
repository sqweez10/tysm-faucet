import type { VercelRequest, VercelResponse } from "@vercel/node";

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const FARCASTER_CAST_HASH_RE = /^0x[a-fA-F0-9]{40}$/;

const BASE_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;

const SUPPORTED_CHAIN_IDS = new Set([BASE_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID]);

const SHARE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

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
};

type AppConfig = {
  chain: ChainConfig;
  neynarApiKey: string;
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

type VerifiedCast = {
  hash: string;
  authorFid: number;
  text: string;
  timestamp: string | null;
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

function getChainConfig(chainId: number): ChainConfig | null {
  if (chainId === BASE_CHAIN_ID) {
    const contractAddress = readEnvAddress("TYSM_V3_BASE_CONTRACT_ADDRESS");
    const signerAddress = readEnvAddress("TYSM_V3_BASE_SIGNER_ADDRESS");

    if (!contractAddress || !signerAddress) {
      return null;
    }

    return {
      chainId: BASE_CHAIN_ID,
      chainName: "base",
      contractAddress,
      signerAddress,
    };
  }

  if (chainId === BASE_SEPOLIA_CHAIN_ID) {
    const contractAddress = readEnvAddress("TYSM_V3_SEPOLIA_CONTRACT_ADDRESS");
    const signerAddress = readEnvAddress("TYSM_V3_SEPOLIA_SIGNER_ADDRESS");

    if (!contractAddress || !signerAddress) {
      return null;
    }

    return {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      chainName: "base-sepolia",
      contractAddress,
      signerAddress,
    };
  }

  return null;
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

  return {
    chain,
    neynarApiKey,
  };
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
      });

      return sendError(
        res,
        503,
        "signing_unavailable",
        "The claim service is temporarily unavailable. Please try again shortly."
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

    console.info("[claim-authorization] validated request, config, and share", {
      fid: validation.fid,
      wallet: validation.wallet,
      castHash: validation.castHash,
      castAuthorFid: shareVerification.cast.authorFid,
      client: validation.client,
      chainId: appConfig.chain.chainId,
      chainName: appConfig.chain.chainName,
      contractAddress: appConfig.chain.contractAddress,
      signerAddress: appConfig.chain.signerAddress,
      stage: "neynar-cast-verification-only",
    });

    return sendError(
      res,
      503,
      "signing_unavailable",
      "The claim service is temporarily unavailable. Please try again shortly."
    );
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
