### ⚡ TYSM Daily Faucet Mini-App

  A gamified Web3 SocialFi Mini-App built for the Farcaster ecosystem, deployed on the Base network. Users claim free $TYSM tokens once every 24 hours, with milestone bonuses for loyalty streaks.

  ## 🚀 Key Features

  * **⚡ Share-to-Unlock:** Users must share (Cast) their current streak status to Farcaster before unlocking the on-chain claim, creating a 100% viral loop.
  * **🎯 Progress Tracking:** Visual progress bar showing position within the current 30-day cycle.
  * **⏳ Countdown Timer:** Shows exactly how long until the next claim is available.
  * **🏆 Leaderboard:** Live rankings by total claim days.

  ## 📊 On-Chain Daily Faucet Reward Structure

  The faucet uses a **repeating 30-day cycle**. After Day 30, the cycle starts again from Day 1.
  `totalDays` is the lifetime claim count and never resets. The cycle position (streak) resets every 30 days.

  | Day in Cycle | Daily Reward | Notes |
  | :--- | :--- | :--- |
  | Days 1–6 | 2,000 $TYSM | Base daily claim |
  | **Day 7** | **10,000 $TYSM** | 🔥 Week 1 Milestone |
  | Days 8–14 | 2,000 $TYSM | Base daily claim |
  | **Day 15** | **40,000 $TYSM** | 🌟 Mid-Month Milestone |
  | Days 16–29 | 2,000 $TYSM | Base daily claim |
  | **Day 30** | **90,000 $TYSM** | 👑 Full Month Milestone |
  | Day 31+ | 2,000 $TYSM/day | Cycle repeats from Day 1 |

  > All rewards above are paid by the on-chain faucet contract. The base daily rate is **2,000 $TYSM** across all cycles.

  ---

  ## 🎁 Planned: Special Loyalty Bonus Pool

  Special Loyalty Bonuses for long-term users are planned as a **separate bonus pool**, not part of the daily faucet contract.

  | Milestone | Bonus | Notes |
  | :--- | :--- | :--- |
  | C2 — Day 45 (lifetime) | 80,000 $TYSM | One-time · Claimable later if unlocked |
  | C2 — Day 60 (lifetime) | 180,000 $TYSM | One-time · Claimable later if unlocked |
  | C3 / C4 phases | TBD | Planned later |

  **Important details:**
  - Each bonus milestone can be claimed **only once**.
  - If a user reaches Day 60 without claiming Day 45, they can still claim both unlocked bonuses later.
  - Bonus claims are **separate** from the daily faucet claim.
  - Special Bonus claims may include a fixed support fee of **0.0000038 ETH** (separate from Base network gas).
  - Network gas goes to Base. The support fee helps refill the TYSM bonus pool.

  > C3/C4 phases are planned as future bonus pool phases. Milestones and dates TBD.

  ---

  ## 🛠️ Tech Stack

  * **Framework:** React + Vite
  * **Language:** TypeScript
  * **SDK:** `@farcaster/frame-sdk`, `@farcaster/miniapp-sdk`
  * **Styling:** Tailwind CSS v4
  * **Blockchain:** Base Network (Ethereum L2) · wagmi v2 + viem
  * **Deployment:** Vercel / Replit

  ---
  Developed with 🔥 by **tops87sqweezz.base.eth**
  