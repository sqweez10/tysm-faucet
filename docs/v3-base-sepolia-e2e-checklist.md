# TYSM Faucet V3 — Base Sepolia End-to-End (E2E) Testing Plan

This document outlines the step-by-step verification process for testing **TYSM Faucet V3** on **Base Sepolia (Chain ID: 84532)** before deploying to Base Mainnet.

---

## 1. E2E Testing Checklist

- [ ] **Contract Deployment**
  - [ ] Deploy `MockTYSM` (ERC-20 test token) to Base Sepolia.
  - [ ] Deploy `TYSMFaucetV3` to Base Sepolia referencing `MockTYSM` and `SIGNER_ADDRESS`.
  - [ ] Transfer `MockTYSM` tokens into `TYSMFaucetV3` contract balance.
- [ ] **Backend Configuration**
  - [ ] Configure Base Sepolia environment variables on Vercel/Local.
  - [ ] Verify `TYSM_V3_SEPOLIA_SIGNER_PRIVATE_KEY` derives to `TYSM_V3_SEPOLIA_SIGNER_ADDRESS`.
- [ ] **Happy Path Verification**
  - [ ] Post a public Farcaster cast containing `#tysmfaucet` or an approved marker.
  - [ ] Send `POST /api/claim-authorization` request with valid `fid`, `wallet`, and `castHash`.
  - [ ] Receive HTTP 200 with `{ deadline, nonce, signature }`.
  - [ ] Verify `used_cast:<castHash>` key is set on Upstash Redis.
  - [ ] Execute `claimWithSignature(deadline, nonce, signature)` on Base Sepolia.
  - [ ] Confirm `MockTYSM` tokens are transferred to `<CLAIMING_WALLET>`.
- [ ] **Negative & Edge Case Verification**
  - [ ] Reused castHash (Redis block).
  - [ ] Reused signature/nonce on-chain (`NonceAlreadyUsed`).
  - [ ] Wallet / FID mismatch.
  - [ ] Missing marker in Farcaster cast.
  - [ ] Expired deadline (`SignatureExpired`).
  - [ ] Blocklisted wallet/FID.
  - [ ] Paused contract (`EnforcedPause`).

---

## 2. Environment Variables Setup (Placeholders Only)

Set these variables in your local `.env.test` file and Vercel Project Settings (Base Sepolia environment). **Never use real production private keys or secrets here.**

```bash
# Base Sepolia Contract Configuration
TYSM_V3_SEPOLIA_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000
TYSM_V3_SEPOLIA_SIGNER_ADDRESS=0x1111111111111111111111111111111111111111
TYSM_V3_SEPOLIA_SIGNER_PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000001

# Neynar API Key for Cast & User Verification
NEYNAR_API_KEY=NEYNAR_TEST_API_KEY

# Upstash Redis Configuration (Isolated test instance recommended)
UPSTASH_REDIS_REST_URL=[https://your-test-db.upstash.io](https://your-test-db.upstash.io)
UPSTASH_REDIS_REST_TOKEN=AxxxXXXXxxxxXXXXxxxxXXXX

3. Deployment Steps on Base Sepolia

Step 3.1: Deploy MockTYSM Token
Deploy a mock ERC-20 token (18 decimals) to act as TYSM on Base Sepolia:
forge create --rpc-url [https://sepolia.base.org](https://sepolia.base.org) \
  --private-key <DEPLOYER_PRIVATE_KEY> \
  src/MockTYSM.sol:MockTYSM

Save the output Deployed to: address as <MOCK_TYSM_ADDRESS>.
Step 3.2: Deploy TYSMFaucetV3
Deploy the V3 contract with the mock token and your test signer address:
forge create --rpc-url [https://sepolia.base.org](https://sepolia.base.org) \
  --private-key <DEPLOYER_PRIVATE_KEY> \
  src/TYSMFaucetV3.sol:TYSMFaucetV3 \
  --constructor-args <MOCK_TYSM_ADDRESS> <TYSM_V3_SEPOLIA_SIGNER_ADDRESS>

Save the output Deployed to: address as <BASE_SEPOLIA_V3_CONTRACT>.

4. Fund the Faucet

Mint or transfer MockTYSM tokens into the newly deployed TYSMFaucetV3 contract:
# Example: Transfer 1,000,000 MockTYSM tokens to the contract
cast send <MOCK_TYSM_ADDRESS> \
  "transfer(address,uint256)" <BASE_SEPOLIA_V3_CONTRACT> 1000000000000000000000000 \
  --rpc-url [https://sepolia.base.org](https://sepolia.base.org) \
  --private-key <DEPLOYER_PRIVATE_KEY>

Verify contract balance:
cast call <MOCK_TYSM_ADDRESS> \
  "balanceOf(address)(uint256)" <BASE_SEPOLIA_V3_CONTRACT> \
  --rpc-url [https://sepolia.base.org](https://sepolia.base.org)

5. Set Vercel Environment Variables

 * Go to Vercel Dashboard > Project Settings > Environment Variables.
 * Add/Update the following keys for Preview / Development environments:
   * TYSM_V3_SEPOLIA_CONTRACT_ADDRESS = <BASE_SEPOLIA_V3_CONTRACT>
   * TYSM_V3_SEPOLIA_SIGNER_ADDRESS = <TYSM_V3_SEPOLIA_SIGNER_ADDRESS>
   * TYSM_V3_SEPOLIA_SIGNER_PRIVATE_KEY = <TYSM_V3_SEPOLIA_SIGNER_PRIVATE_KEY>
   * NEYNAR_API_KEY = <NEYNAR_API_KEY>
   * UPSTASH_REDIS_REST_URL = <UPSTASH_REDIS_REST_URL>
   * UPSTASH_REDIS_REST_TOKEN = <UPSTASH_REDIS_REST_TOKEN>
 * Redeploy the Vercel project or run locally using vc dev.

6. Example Authorization Request (curl)

Send a test request to /api/claim-authorization using a valid Farcaster cast hash and verified wallet:
curl -X POST "https://<YOUR_VERCEL_PREVIEW_URL>/api/claim-authorization" \
  -H "Content-Type: application/json" \
  -d '{
    "fid": 12345,
    "wallet": "0x2222222222222222222222222222222222222222",
    "castHash": "0x3333333333333333333333333333333333333333",
    "chainId": 84532,
    "client": "e2e-test-runner"
  }'

7. Expected Success Response (HTTP 200)

{
  "deadline": 1770000000,
  "nonce": "0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
  "signature": "0x7f8a9b..."
}

8. Execute On-Chain Claim (claimWithSignature)

Using cast (Foundry CLI) or viem, call the contract on Base Sepolia using the exact values returned by the API:
cast send <BASE_SEPOLIA_V3_CONTRACT> \
  "claimWithSignature(uint256,bytes32,bytes)" \
  1770000000 \
  0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90 \
  0x7f8a9b... \
  --rpc-url [https://sepolia.base.org](https://sepolia.base.org) \
  --private-key <CLAIMING_WALLET_PRIVATE_KEY>

9. Negative Testing Protocol

| # | Test Scenario | Execution Method | Expected Result |
|---|---|---|---|
| 9.1 | Reused castHash | Send duplicate curl request with the same castHash. | HTTP 400: share_already_used |
| 9.2 | Reused Signature/Nonce | Call claimWithSignature twice on-chain using the same parameters. | On-chain revert: NonceAlreadyUsed() |
| 9.3 | Wrong FID | Pass an fid that does not match the cast author or verified wallet. | HTTP 400: wallet_fid_mismatch or share_not_found |
| 9.4 | Wrong Wallet | Pass a wallet address not verified under the user's Neynar profile. | HTTP 400: wallet_fid_mismatch |
| 9.5 | Missing Marker | Use a castHash where the cast text lacks #tysmfaucet / approved markers. | HTTP 400: share_not_found |
| 9.6 | Expired Deadline | Call claimWithSignature after deadline timestamp has passed. | On-chain revert: SignatureExpired() |
| 9.7 | Blocklisted Wallet | Add wallet to Upstash tysm:v3:deny:wallet:<address> and issue request. | HTTP 403: not_eligible |
| 9.8 | Paused Faucet | Call pause() on contract via owner key, then execute claimWithSignature. | On-chain revert: EnforcedPause() |

10. Troubleshooting Section

A. API Error: signing_unavailable (503)
 * Cause 1: TYSM_V3_SEPOLIA_SIGNER_PRIVATE_KEY does not match TYSM_V3_SEPOLIA_SIGNER_ADDRESS.
 * Solution: Verify that privateKeyToAccount(pk).address matches the configured address in lower-case.
 * Cause 2: Redis credentials or Neynar API key missing.
 * Solution: Double-check Vercel environment variables for UPSTASH_REDIS_REST_URL and NEYNAR_API_KEY.

B. On-Chain Revert: InvalidSignature()
 * Cause 1: Domain name mismatch (TYSMFaucetV3), version mismatch (1), or chain ID mismatch (84532).
 * Cause 2: The signer address configured on the contract does not match TYSM_V3_SEPOLIA_SIGNER_ADDRESS.
 * Solution: Query contract.signerAddress() on-chain to verify it matches the API signer.

C. API Error: share_not_found (400)
 * Cause: Neynar API indexing delay or cast age exceeded SHARE_MAX_AGE_SECONDS (7 days).
 * Solution: Ensure the test cast was posted within 7 days and contains #tysmfaucet.

