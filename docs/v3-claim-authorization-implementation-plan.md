# TYSM Faucet V3 — Claim Authorization Implementation Plan

**Status:** Planning document only. Backend implementation not started. No private keys, secrets, or mainnet deployment instructions are included.

This document describes a small-diff plan for adding the TYSM Faucet V3 claim authorization backend to the existing `tysm-faucet` app repo.

---

## 1. Goal

Add a backend endpoint:

```text
api/claim-authorization.ts
```

This endpoint will issue short-lived EIP-712 claim signatures for TYSM Faucet V3 only after server-side eligibility checks pass.

The frontend will later call this endpoint, receive:

```json
{
  "deadline": 1234567890,
  "nonce": "0x...",
  "signature": "0x..."
}
```

and then call the V3 contract function:

```solidity
claimWithSignature(uint256 deadline, bytes32 nonce, bytes calldata signature)
```

This implementation must preserve the V3 Fresh Start design:

- No V2 migration.
- No `oldFaucet`.
- No `migrated`.
- No copied V2 state.
- No V2 daily faucet dependency.

---

## 2. Current repo structure observations

The `tysm-faucet` app repo appears to use:

- Next.js App Router
- TypeScript
- Farcaster mini app SDK
- Tailwind CSS
- Vercel deployment
- `pnpm`
- Root-level Vercel API functions in `/api`

Existing API files include:

```text
api/referral-stats.ts
api/referral-track.ts
api/resolve-users.ts
api/webhook.ts
```

Because existing serverless functions already live in the root `/api` folder, the V3 claim authorization endpoint should also be added there:

```text
api/claim-authorization.ts
```

This avoids changing the app router structure and keeps the diff small.

---

## 3. New files to add

Recommended new files:

```text
api/claim-authorization.ts
```

Optional helper files, only if the implementation becomes too large:

```text
lib/claim-auth/config.ts
lib/claim-auth/errors.ts
lib/claim-auth/neynar.ts
lib/claim-auth/rate-limit.ts
lib/claim-auth/redis.ts
lib/claim-auth/signing.ts
lib/claim-auth/validation.ts
```

For the first implementation, prefer the smallest clear structure. Avoid spreading logic across many files unless needed.

---

## 4. Existing files likely to modify

Likely files:

```text
package.json
pnpm-lock.yaml
```

Possible dependency additions:

```text
viem
```

or, if the app already uses ethers elsewhere:

```text
ethers
```

Prefer one signing library. Do not install both unless there is a strong reason.

If using Upstash Redis and it is already present in the repo, reuse the existing dependency/config pattern.

Do not modify frontend files yet.

Do not modify existing referral API files unless a shared helper is intentionally extracted.

---

## 5. Environment variables needed

The backend should read all sensitive configuration from environment variables.

Suggested variables:

```text
TYSM_V3_CHAIN_ID
TYSM_V3_CONTRACT_ADDRESS
TYSM_V3_SIGNER_PRIVATE_KEY
TYSM_V3_SIGNER_ADDRESS
NEYNAR_API_KEY
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

For Sepolia testing, use separate variables or environment-specific Vercel settings:

```text
TYSM_V3_SEPOLIA_CHAIN_ID
TYSM_V3_SEPOLIA_CONTRACT_ADDRESS
TYSM_V3_SEPOLIA_SIGNER_PRIVATE_KEY
TYSM_V3_SEPOLIA_SIGNER_ADDRESS
```

Rules:

- Never commit private keys.
- Never expose signer private keys to the frontend.
- Never log private keys.
- Use separate test and production signer keys.
- If the signer is compromised, pause the faucet and rotate signer via `setSigner`.

---

## 6. Dependencies needed

The endpoint needs:

1. EIP-712 signing
2. HTTP requests to Neynar or another Farcaster data source
3. Optional Redis storage / rate limiting

Recommended signing dependency:

```text
viem
```

Useful viem APIs may include:

```text
privateKeyToAccount
account.signTypedData
isAddress
```

If the repo already uses `ethers`, use ethers instead for consistency.

For storage/rate limiting, the repo already includes Upstash Redis-related dependencies, so prefer using Upstash Redis if available.

---

## 7. API request / response shape

Endpoint:

```text
POST /api/claim-authorization
```

Request body:

```json
{
  "fid": 476026,
  "wallet": "0x...",
  "castHash": "0x...",
  "client": "farcaster-mini-app",
  "chainId": 8453
}
```

Success response:

```json
{
  "deadline": 1234567890,
  "nonce": "0x...",
  "signature": "0x..."
}
```

Important:

- Response order is `deadline`, `nonce`, `signature`.
- Frontend must call `claimWithSignature(deadline, nonce, signature)`.
- EIP-712 field name is `user`, not `wallet`.

---

## 8. Validation steps

The endpoint should validate:

- HTTP method is `POST`.
- Body is valid JSON.
- `fid` exists and is a positive integer.
- `wallet` exists and is a valid EVM address.
- `castHash` exists and looks like a Farcaster cast hash.
- `chainId` is supported.
- Required environment variables exist.
- The requested `chainId` matches configured contract/signing domain.

Invalid requests should return safe errors.

Example:

```json
{
  "error": "invalid_request",
  "message": "Required fields are missing."
}
```

Do not leak internal validation details unless safe.

---

## 9. Neynar / Farcaster cast verification plan

Frontend `hasShared` and `localStorage` are not proof. They are UI state only.

The backend must verify the real cast using Neynar or another trusted Farcaster data source.

Checks:

- `castHash` exists.
- The cast author FID matches the requester `fid`.
- The cast is recent enough.
- The cast contains at least one required marker, such as:
  - `#TYSMFaucet`
  - the app URL
  - `@tops87sqweezz.base.eth`

If verification fails, return a generic safe error:

```json
{
  "error": "share_not_found",
  "message": "Please share your TYSM streak before claiming."
}
```

Do not reveal whether the failure was because of author mismatch, missing marker, cast age, or missing cast.

---

## 10. Wallet / FID association verification plan

The backend must verify that the wallet is associated with the provided Farcaster FID.

Possible checks:

- Use Neynar user lookup by FID and inspect verified EVM addresses.
- Accept wallet only if it appears in the user's verified addresses or other trusted Farcaster wallet association source.
- Normalize addresses before comparison.
- Do not trust the frontend-provided `wallet` without verification.

If wallet/FID verification fails:

```json
{
  "error": "wallet_fid_mismatch",
  "message": "This wallet could not be verified for this account."
}
```

---

## 11. Used cast hash storage plan

Use Redis or another persistent store to prevent cast reuse.

Suggested Redis key:

```text
tysm:v3:used_cast:{castHash}
```

Value:

```json
{
  "fid": 476026,
  "wallet": "0x...",
  "usedAt": 1234567890,
  "chainId": 8453
}
```

Before signing:

- Check if `used_cast:{castHash}` exists.
- If it exists, reject.
- If not, continue.

After issuing authorization:

- Store the cast hash as used.
- Consider whether to store immediately on signature issuance or only after confirmed on-chain claim.
- For anti-abuse, storing on issuance is safer.
- If a user fails the transaction after signature issuance, support may need a manual reset path.

Safe error:

```json
{
  "error": "share_already_used",
  "message": "This share has already been used for a claim."
}
```

---

## 12. Nonce and deadline generation plan

Generate a cryptographically random `bytes32` nonce.

Rules:

- Nonce must be unpredictable.
- Nonce must not be sequential.
- Nonce must not be derived from user input.
- Use secure randomness available in the server runtime.

Example shape:

```text
0x + 32 random bytes
```

Deadline:

- Use a short-lived timestamp.
- Suggested starting window: 5–10 minutes.
- Long enough for normal users to submit a transaction.
- Short enough to reduce risk from leaked signatures.

The contract handles replay protection by tracking used authorization digests. The backend should also log issued nonces for auditing.

Suggested Redis/log key:

```text
tysm:v3:issued_auth:{digest or nonce}
```

---

## 13. EIP-712 signing plan

The contract uses OpenZeppelin ECDSA/EIP-712.

Domain:

```json
{
  "name": "TYSMFaucetV3",
  "version": "1",
  "chainId": 8453,
  "verifyingContract": "0x..."
}
```

For Base Sepolia:

```json
{
  "name": "TYSMFaucetV3",
  "version": "1",
  "chainId": 84532,
  "verifyingContract": "0x..."
}
```

Types:

```json
{
  "ClaimAuthorization": [
    { "name": "user", "type": "address" },
    { "name": "deadline", "type": "uint256" },
    { "name": "nonce", "type": "bytes32" }
  ]
}
```

Value:

```json
{
  "user": "0x...",
  "deadline": 1234567890,
  "nonce": "0x..."
}
```

Important:

- Use `user`, not `wallet`.
- The signature must be bound to the wallet that will call `claimWithSignature`.
- The domain must use the exact deployed V3 contract address.
- The chain ID must match the target network.
- Do not sign if config is missing or inconsistent.

---

## 14. Rate limiting plan

Apply rate limits before expensive checks and before signing.

Recommended layers:

- Per FID
- Per wallet
- Per IP/session if available
- Per castHash
- Per chainId

Suggested Redis keys:

```text
tysm:v3:rl:fid:{fid}
tysm:v3:rl:wallet:{wallet}
tysm:v3:rl:ip:{ip}
tysm:v3:rl:cast:{castHash}
```

Do not reveal exact thresholds publicly.

Rate limit response:

```json
{
  "error": "rate_limited",
  "message": "Too many requests. Please slow down and try again shortly."
}
```

---

## 15. Denylist / blocklist plan

Maintain a backend denylist separate from the contract blocklist.

Possible denylist types:

```text
wallet
fid
collector-pattern
castHash
ip/session
```

Suggested Redis key:

```text
tysm:v3:deny:{type}:{value}
```

Denylist reasons are internal only.

Safe response:

```json
{
  "error": "not_eligible",
  "message": "Claim eligibility could not be verified right now. Please try again later or contact support."
}
```

The contract-level blocklist remains useful because it blocks claims even if a signature is issued accidentally.

---

## 16. Safe error response strategy

Use generic public errors.

Do not expose:

- risk thresholds
- Neynar score thresholds
- denylist status
- exact rule that failed
- farming pattern details
- internal logs
- signer configuration

Recommended public errors:

```text
invalid_request
unsupported_chain
wallet_fid_mismatch
share_not_found
share_already_used
cooldown_active
rate_limited
signing_unavailable
not_eligible
```

Keep detailed reasons only in internal logs.

---

## 17. Logging strategy without secrets

Log enough to debug and audit without leaking secrets.

Safe to log:

```text
request id
fid
normalized wallet
castHash
chainId
contractAddress
signer public address
deadline
nonce hash or digest
internal rejection reason
timestamp
```

Never log:

```text
signer private key
raw secret values
environment variable values
API keys
full Authorization headers
```

Consider hashing sensitive identifiers if logs may be exposed to third-party tooling.

---

## 18. Local / test strategy

Before touching production:

- Test request validation.
- Test unsupported chain rejection.
- Test missing env rejection.
- Test fake/invalid wallet rejection.
- Test wallet/FID mismatch.
- Test cast not found.
- Test cast author mismatch.
- Test cast missing marker.
- Test used cast rejection.
- Test rate limit.
- Test denylist.
- Test successful EIP-712 signing.
- Verify the signature against the V3 contract test suite or a local deploy.

No real private keys should be committed. Use local test keys only through local environment variables.

---

## 19. Base Sepolia E2E plan

Base Sepolia testing must happen before mainnet.

Checklist:

- Deploy test TYSM / MockTYSM.
- Deploy V3 faucet.
- Set backend Sepolia signer as contract signer.
- Fund faucet with test TYSM.
- Configure backend with:
  - `chainId: 84532`
  - Sepolia V3 faucet contract address
  - Sepolia signer private key in environment only
- Post a real test Farcaster share cast.
- Verify cast through backend.
- Request `/api/claim-authorization`.
- Submit `claimWithSignature(deadline, nonce, signature)`.
- Confirm claim succeeds.
- Confirm reused cast is rejected.
- Confirm reused signature is rejected on-chain.
- Confirm wrong FID is rejected.
- Confirm blocklist works.
- Confirm pause works.
- Confirm expired deadline fails.

---

## 20. Production readiness checklist

Do not consider mainnet until all are complete:

- [ ] V3 contract uses OpenZeppelin ECDSA/EIP-712.
- [ ] GitHub Actions compile/test is green.
- [ ] Backend endpoint implemented.
- [ ] Backend signer secured.
- [ ] Separate test and production signer keys.
- [ ] Neynar/Farcaster verification working.
- [ ] Wallet/FID verification working.
- [ ] Used cast storage working.
- [ ] Nonce/deadline signing working.
- [ ] Rate limiting enabled.
- [ ] Denylist ready.
- [ ] Safe error messages verified.
- [ ] Frontend integrated.
- [ ] Base Sepolia E2E completed.
- [ ] Mainnet contract address reviewed.
- [ ] Owner address reviewed.
- [ ] Signer address reviewed.
- [ ] V2 confirmed not being refilled.

---

## 21. Non-goals

This implementation plan does not include:

- V2 migration.
- V2 history import.
- `oldFaucet`.
- `migrated`.
- Special Bonus Pool logic.
- Frontend rewrite.
- Mainnet deployment.
- Private keys or secrets.
- A promise that Neynar User Quality Score alone determines eligibility.

---

## 22. Step-by-step implementation order

Recommended order:

1. Add `api/claim-authorization.ts` skeleton.
2. Add method check: only `POST`.
3. Add request body parsing and validation.
4. Add environment/config validation.
5. Add supported chain config selection.
6. Add safe error response helper.
7. Add Redis connection helper if needed.
8. Add rate limit checks.
9. Add denylist checks.
10. Add wallet/FID verification.
11. Add Farcaster cast lookup.
12. Add cast author FID check.
13. Add cast marker check.
14. Add used cast hash check.
15. Add cooldown mirror check if practical.
16. Generate deadline.
17. Generate random bytes32 nonce.
18. Sign EIP-712 typed data using field `user`.
19. Store issued authorization.
20. Store used cast hash.
21. Return `{ deadline, nonce, signature }`.
22. Add tests or manual verification notes.
23. Test against Base Sepolia.
24. Only after successful E2E, integrate frontend.
```

## Commit message

```text
Add V3 claim authorization implementation plan
```
