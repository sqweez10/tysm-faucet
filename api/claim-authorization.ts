import type { VercelRequest, VercelResponse } from "@vercel/node";

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const FARCASTER_CAST_HASH_RE = /^0x[a-fA-F0-9]{40}$/;

const SUPPORTED_CHAIN_IDS = new Set([8453, 84532]);

type ClaimAuthorizationRequestBody = {
  fid?: unknown;
  wallet?: unknown;
  castHash?: unknown;
  client?: unknown;
  chainId?: unknown;
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

    console.info("[claim-authorization] validated request", {
      fid: validation.fid,
      wallet: validation.wallet,
      castHash: validation.castHash,
      client: validation.client,
      chainId: validation.chainId,
      stage: "validation-only",
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
