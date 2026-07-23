# TYSM Faucet V3 — Base Sepolia End-to-End (E2E) Testing Plan

**Status:** Base Sepolia testing checklist only. No mainnet deployment instructions. No real private keys or secrets.

This document outlines the step-by-step verification process for testing TYSM Faucet V3 on Base Sepolia before any mainnet deployment is considered.

Base Sepolia chain ID:

```text
84532
```

---

## 1. E2E Testing Checklist

### Contract deployment

- [ ] Deploy `MockTYSM` or a test TYSM token to Base Sepolia.
- [ ] Deploy `TYSMFaucetV3` to Base Sepolia.
- [ ] Constructor args must be:

```text
<MOCK_TYSM_ADDRESS> <TYSM_V3_SEPOLIA_SIGNER_ADDRESS> <OWNER_ADDRESS>
```

- [ ] Transfer or mint test TYSM into the `TYSMFaucetV3` contract.
- [ ] Confirm faucet token balance is greater than zero.
- [ ] Confirm contract `signer()` equals `<TYSM_V3_SEPOLIA_SIGNER_ADDRESS>`.
- [ ] Confirm contract `owner()` equals `<OWNER_ADDRESS>`.

### Backend configuration

- [ ] Configure Base Sepolia environment variables locally or in Vercel Preview / Development.
- [ ] Verify `TYSM_V3_SEPOLIA_SIGNER_PRIVATE_KEY` derives to `TYSM_V3_SEPOLIA_SIGNER_ADDRESS`.
- [ ] Verify `TYSM_V3_SEPOLIA_CONTRACT_ADDRESS` is the deployed V3 faucet address.
- [ ] Verify `NEYNAR_API_KEY` is set.
- [ ] Verify Upstash Redis test credentials are set.
- [ ] Use an isolated Redis test database if possible.

### Happy path verification

- [ ] Post a public Farcaster cast containing an approved marker.
- [ ] Marker examples:
  - `#tysmfaucet`
  - `tysm-faucet`
  - `tysm-faucet.vercel.app`
  - `@tops87sqweezz.base.eth`
- [ ] Send `POST /api/claim-authorization` with valid `fid`, `wallet`, `castHash`, and `chainId: 84532`.
- [ ] Receive HTTP 200 with `{ deadline, nonce, signature }`.
- [ ] Verify the used cast key is set in Upstash Redis.
- [ ] Execute `claimWithSignature(deadline, nonce, signature)` from the same wallet.
- [ ] Confirm test TYSM tokens are transferred to `<CLAIMING_WALLET_ADDRESS>`.

### Negative and edge case verification

- [ ] Reused `castHash`.
- [ ] Reused signature / nonce.
- [ ] Wrong FID.
- [ ] Wrong wallet.
- [ ] Missing marker in cast.
- [ ] Expired deadline.
- [ ] Denylisted wallet.
- [ ] Paused faucet.
- [ ] Invalid signer / domain mismatch.

---

## 2. Environment Variables Setup

Use placeholders only. Do not commit real secrets.

```text
# Base Sepolia contract configuration
TYSM_V3_SEPOLIA_CONTRACT_ADDRESS=<BASE_SEPOLIA_V3_CONTRACT>
TYSM_V3_SEPOLIA_SIGNER_ADDRESS=<BASE_SEPOLIA_SIGNER_ADDRESS>
TYSM_V3_SEPOLIA_SIGNER_PRIVATE_KEY=<BASE_SEPOLIA_SIGNER_PRIVATE_KEY>

# Neynar API key
NEYNAR_API_KEY=<NEYNAR_API_KEY>

# Upstash Redis test database
UPSTASH_REDIS_REST_URL=<UPSTASH_REDIS_REST_URL>
UPSTASH_REDIS_REST_TOKEN=<UPSTASH_REDIS_REST_TOKEN>
```

Rules:

- Do not use production private keys for Base Sepolia testing.
- Do not commit `.env` files.
- Do not paste private keys into public chat, GitHub issues, casts, or docs.
- Use separate signer keys for Sepolia and production.
- Use Vercel Environment Variables or local `.env` files ignored by Git.

---

## 3. Deployment Steps on Base Sepolia

> Adjust contract paths to match the actual deployment project layout.

Example placeholders:

```text
<BASE_SEPOLIA_RPC_URL>
<DEPLOYER_PRIVATE_KEY>
<MOCK_TYSM_ADDRESS>
<BASE_SEPOLIA_V3_CONTRACT>
<TYSM_V3_SEPOLIA_SIGNER_ADDRESS>
<OWNER_ADDRESS>
```

### 3.1 Deploy MockTYSM

Example using Foundry:

```bash
forge create \
  --rpc-url <BASE_SEPOLIA_RPC_URL> \
  --private-key <DEPLOYER_PRIVATE_KEY> \
  src/MockTYSM.sol:MockTYSM
```

Save the deployed address as:

```text
<MOCK_TYSM_ADDRESS>
```

### 3.2 Deploy TYSMFaucetV3

The V3 constructor is:

```solidity
constructor(address _tysm, address _signer, address _owner)
```

Deploy with three constructor args:

```bash
forge create \
  --rpc-url <BASE_SEPOLIA_RPC_URL> \
  --private-key <DEPLOYER_PRIVATE_KEY> \
  src/TYSMFaucetV3.sol:TYSMFaucetV3 \
  --constructor-args \
  <MOCK_TYSM_ADDRESS> \
  <TYSM_V3_SEPOLIA_SIGNER_ADDRESS> \
  <OWNER_ADDRESS>
```

Save the deployed address as:

```text
<BASE_SEPOLIA_V3_CONTRACT>
```

### 3.3 Verify contract config

Check signer:

```bash
cast call <BASE_SEPOLIA_V3_CONTRACT> \
  "signer()(address)" \
  --rpc-url <BASE_SEPOLIA_RPC_URL>
```

Expected:

```text
<TYSM_V3_SEPOLIA_SIGNER_ADDRESS>
```

Check owner:

```bash
cast call <BASE_SEPOLIA_V3_CONTRACT> \
  "owner()(address)" \
  --rpc-url <BASE_SEPOLIA_RPC_URL>
```

Expected:

```text
<OWNER_ADDRESS>
```

---

## 4. Fund the Faucet

Mint or transfer test TYSM into the deployed V3 faucet contract.

Example transfer:

```bash
cast send <MOCK_TYSM_ADDRESS> \
  "transfer(address,uint256)" \
  <BASE_SEPOLIA_V3_CONTRACT> \
  1000000000000000000000000 \
  --rpc-url <BASE_SEPOLIA_RPC_URL> \
  --private-key <DEPLOYER_PRIVATE_KEY>
```

Check faucet token balance:

```bash
cast call <MOCK_TYSM_ADDRESS> \
  "balanceOf(address)(uint256)" \
  <BASE_SEPOLIA_V3_CONTRACT> \
  --rpc-url <BASE_SEPOLIA_RPC_URL>
```

Expected:

```text
greater than 0
```

---

## 5. Set Vercel Environment Variables

In Vercel:

```text
Project Settings → Environment Variables
```

Set these for Preview / Development first:

```text
TYSM_V3_SEPOLIA_CONTRACT_ADDRESS=<BASE_SEPOLIA_V3_CONTRACT>
TYSM_V3_SEPOLIA_SIGNER_ADDRESS=<BASE_SEPOLIA_SIGNER_ADDRESS>
TYSM_V3_SEPOLIA_SIGNER_PRIVATE_KEY=<BASE_SEPOLIA_SIGNER_PRIVATE_KEY>
NEYNAR_API_KEY=<NEYNAR_API_KEY>
UPSTASH_REDIS_REST_URL=<UPSTASH_REDIS_REST_URL>
UPSTASH_REDIS_REST_TOKEN=<UPSTASH_REDIS_REST_TOKEN>
```

Then redeploy the Vercel project or use a local test environment.

Do not set production signer keys until Sepolia E2E testing is complete.

---

## 6. Example Authorization Request

Use a real Farcaster cast hash authored by the same FID in the request.

The cast must:

- be public
- be recent
- be authored by `<TEST_FID>`
- include an approved marker
- not have been used before

Example request:

```bash
curl -X POST "https://<YOUR_VERCEL_PREVIEW_URL>/api/claim-authorization" \
  -H "Content-Type: application/json" \
  -d '{
    "fid": <TEST_FID>,
    "wallet": "<CLAIMING_WALLET_ADDRESS>",
    "castHash": "<TEST_CAST_HASH>",
    "chainId": 84532,
    "client": "e2e-test-runner"
  }'
```

---

## 7. Expected Success Response

Expected HTTP status:

```text
200
```

Expected response shape:

```json
{
  "deadline": 1770000000,
  "nonce": "0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
  "signature": "0x7f8a9b..."
}
```

Important:

- Response order is `deadline`, `nonce`, `signature`.
- The signature is bound to the wallet in the EIP-712 field named `user`.
- The frontend/on-chain call must use the same wallet.

---

## 8. Execute On-Chain Claim

Call:

```solidity
claimWithSignature(uint256 deadline, bytes32 nonce, bytes calldata signature)
```

Example using Foundry `cast`:

```bash
cast send <BASE_SEPOLIA_V3_CONTRACT> \
  "claimWithSignature(uint256,bytes32,bytes)" \
  <DEADLINE_FROM_API> \
  <NONCE_FROM_API> \
  <SIGNATURE_FROM_API> \
  --rpc-url <BASE_SEPOLIA_RPC_URL> \
  --private-key <CLAIMING_WALLET_PRIVATE_KEY>
```

Important:

- `<CLAIMING_WALLET_PRIVATE_KEY>` must correspond to `<CLAIMING_WALLET_ADDRESS>`.
- This must be the same wallet that the backend signed for.
- Do not use the backend signer private key as the claiming wallet.

Expected result:

```text
claim transaction succeeds
test TYSM balance increases
```

Check user balance:

```bash
cast call <MOCK_TYSM_ADDRESS> \
  "balanceOf(address)(uint256)" \
  <CLAIMING_WALLET_ADDRESS> \
  --rpc-url <BASE_SEPOLIA_RPC_URL>
```

---

## 9. Negative Testing Protocol

| # | Test Scenario | Execution Method | Expected Result |
|---|---|---|---|
| 9.1 | Reused castHash | Send duplicate API request with the same `castHash`. | HTTP 400: `share_already_used` |
| 9.2 | Reused signature / nonce | Call `claimWithSignature` twice using the same values. | On-chain revert: `"Authorization already used"` |
| 9.3 | Wrong FID | Use an FID that does not match cast author or wallet. | HTTP 400: `wallet_fid_mismatch` or `share_not_found` |
| 9.4 | Wrong wallet | Use a wallet not verified under the FID. | HTTP 400: `wallet_fid_mismatch` |
| 9.5 | Missing marker | Use a cast without an approved marker. | HTTP 400: `share_not_found` |
| 9.6 | Expired deadline | Wait until after `deadline`, then call claim. | On-chain revert: `"Signature expired"` |
| 9.7 | Denylisted wallet | Add `tysm:v3:deny:wallet:<wallet>` in Redis, then call API. | HTTP 403: `not_eligible` |
| 9.8 | Paused faucet | Owner calls `pause()`, then attempt claim. | On-chain revert: `"Faucet is paused"` |
| 9.9 | Invalid signer / domain mismatch | Use wrong signer or wrong contract address in backend config. | On-chain revert: `"Invalid signer"` or API `signing_unavailable` |

---

## 10. Troubleshooting

### API error: `signing_unavailable` HTTP 503

Possible causes:

- Missing `TYSM_V3_SEPOLIA_CONTRACT_ADDRESS`.
- Missing `TYSM_V3_SEPOLIA_SIGNER_ADDRESS`.
- Missing `TYSM_V3_SEPOLIA_SIGNER_PRIVATE_KEY`.
- Private key does not derive to configured signer address.
- Missing `NEYNAR_API_KEY`.
- Missing Upstash Redis variables.
- EIP-712 signing failed.

Checks:

```text
privateKeyToAccount(<BASE_SEPOLIA_SIGNER_PRIVATE_KEY>).address
```

must equal:

```text
<TYSM_V3_SEPOLIA_SIGNER_ADDRESS>
```

### API error: `wallet_fid_mismatch` HTTP 400

Possible causes:

- Wallet is not verified/associated with the FID.
- Wrong wallet submitted.
- Neynar user data has not updated yet.

### API error: `share_not_found` HTTP 400

Possible causes:

- Cast hash is wrong.
- Cast was authored by another FID.
- Cast does not include an approved marker.
- Cast is older than the allowed age window.
- Neynar indexing delay.

### API error: `share_already_used` HTTP 400

Possible causes:

- The cast hash was already used to request an authorization.
- Redis test data was not cleared between test runs.

Suggested action:

```text
Use a new test castHash or clear the specific Redis test key.
```

### On-chain revert: `"Invalid signer"`

Possible causes:

- Backend signer private key does not match contract `signer()`.
- EIP-712 domain uses wrong `chainId`.
- EIP-712 domain uses wrong `verifyingContract`.
- EIP-712 field name is not `user`.
- Contract address in env does not match the deployed V3 faucet.

Check signer:

```bash
cast call <BASE_SEPOLIA_V3_CONTRACT> \
  "signer()(address)" \
  --rpc-url <BASE_SEPOLIA_RPC_URL>
```

### On-chain revert: `"Authorization already used"`

Possible causes:

- The same `deadline`, `nonce`, and `signature` were already used.
- The same authorization digest was replayed.

Expected behavior:

```text
replay is blocked
```

### On-chain revert: `"Signature expired"`

Possible causes:

- The claim transaction was submitted after the deadline.
- The local clock or RPC response was delayed.

Expected behavior:

```text
expired signatures are rejected
```

### On-chain revert: `"Faucet is paused"`

Possible causes:

- Owner called `pause()`.
- Testing paused-state behavior.

Expected behavior:

```text
claims are blocked while paused
```

---

## 11. Final Pass Criteria

Base Sepolia E2E is considered passing only if:

- [ ] V3 faucet deploys successfully.
- [ ] MockTYSM/test TYSM deploys successfully.
- [ ] Faucet is funded.
- [ ] `signer()` matches the backend Sepolia signer.
- [ ] `owner()` matches the expected owner.
- [ ] `/api/claim-authorization` returns `{ deadline, nonce, signature }` for a valid request.
- [ ] `claimWithSignature(deadline, nonce, signature)` succeeds from the signed wallet.
- [ ] Test TYSM transfers to the claiming wallet.
- [ ] Reused cast hash is rejected by API.
- [ ] Reused signature/nonce is rejected on-chain.
- [ ] Wrong FID is rejected.
- [ ] Wrong wallet is rejected.
- [ ] Missing marker is rejected.
- [ ] Expired deadline is rejected.
- [ ] Denylisted wallet is rejected.
- [ ] Paused faucet rejects claims.

---

## 12. Non-goals

This checklist does not include:

- Mainnet deployment.
- Production private keys.
- Real secrets.
- V2 refill instructions.
- V2 migration.
- Special Bonus Pool logic.
- Frontend rewrite.
- Public disclosure of anti-abuse thresholds.
````

---
