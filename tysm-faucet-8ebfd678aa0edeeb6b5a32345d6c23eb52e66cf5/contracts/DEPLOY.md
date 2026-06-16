# Deploy TYSMReferralRewards via Remix IDE

## Steps (no setup needed — just a browser)

1. Open **https://remix.ethereum.org**

2. In the **File Explorer** (left panel), create a new file:
   `TYSMReferralRewards.sol`
   → paste the full content of `contracts/TYSMReferralRewards.sol`

3. Click **Solidity Compiler** tab → set version to `0.8.20` → click **Compile**

4. Click **Deploy & Run Transactions** tab
   - Environment: **Injected Provider - MetaMask**
   - Switch MetaMask to **Base Mainnet**

5. In the **CONTRACT** dropdown select `TYSMReferralRewards`

6. In the **Deploy** field, enter the TYSM token address:
   `0x...` ← (your $TYSM token contract address on Base)

7. Click **Deploy** → confirm in MetaMask

8. Copy the deployed contract address → set it as `VITE_REFERRAL_CONTRACT_ADDRESS` in Vercel

## After Deployment

### Fund the pool
In Remix, under **Deployed Contracts**:
1. First approve TYSM spend: call the TYSM token contract's `approve(referralContract, amount)`
2. Then call `deposit(amount)` on TYSMReferralRewards

### Register referrals (sync from Redis)
Call `registerReferral(referrerAddress, refereeAddress)` for each confirmed pair,
or use `registerReferralBatch([referrers], [referees])` for efficiency.

## Reward Tiers
| Referrals | Reward per referral |
|-----------|---------------------|
| 1 – 5     | 5,000 $TYSM         |
| 6 – 10    | 8,000 $TYSM         |
| 11+       | 12,000 $TYSM        |
