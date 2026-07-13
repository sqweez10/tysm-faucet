### ⚡ TYSM Daily Faucet Mini-App (Updated)

A gamified Web3 SocialFi Mini-App built for the Farcaster ecosystem, deployed on the Base network. This application incentivizes community engagement through a structured daily token distribution l[...]

## 📊 Reward Structure (Verified On-Chain Behavior)

The faucet runs on a **repeating 30-day cycle**. The daily base amount stays
the same every cycle, and the milestone rewards repeat on Day 7, 15, and 30.

| Day Period | Daily Reward Amount | Notes |
| :--- | :--- | :--- |
| **Days 1 - 6** | 2,000 $TYSM / day | Base rate |
| **Day 7** | 10,000 $TYSM | Milestone Bonus 1 🥉 |
| **Days 8 - 14** | 2,000 $TYSM / day | Base rate |
| **Day 15** | 40,000 $TYSM | Milestone Bonus 2 🥈 |
| **Days 16 - 29** | 2,000 $TYSM / day | Base rate |
| **Day 30** | 90,000 $TYSM | Milestone Bonus 3 🥇👑 |
| **Day 31+** | *Cycle repeats* | Back to Day 1 — same schedule again |

**How the two counters work:**

* **Streak / cycle day** — resets every 30 days. This is what determines
  your reward on any given claim (Day 1–30, repeating).
* **`totalDays`** — your lifetime claim count. This never resets and keeps
  counting up no matter how many 30-day cycles you complete. It's a
  loyalty/history counter, not a reward multiplier.

That's it — there's no scaling daily base rate and no extra milestone days
beyond 7, 15, and 30 inside the current daily faucet. If your daily amount
looks the same after several cycles, that's expected: the faucet is working
exactly as designed.

---

## 🎁 Special Loyalty Bonus Pool (Planned)

A separate rewards pool is planned for long-term claimers, on top of the
daily faucet above.

* **Fully separate** from the daily faucet contract — it doesn't change
  your streak, `totalDays`, or claim history in any way.
* Planned milestones so far:
  * **C2 Day 45:** 80,000 $TYSM
  * **C2 Day 60:** 180,000 $TYSM
  * Further C3 / C4 phases may be added later.
* Each bonus milestone is a **one-time claim** — once you claim it, it's
  used.
* If you unlock a bonus but don't claim it right away, it stays claimable
  later — you won't lose it.
* Bonus claims may include a **fixed support fee of 0.0000038 ETH**. This
  is separate from normal Base network gas:
  * **Network gas** → goes to Base, like any other transaction.
  * **Support fee** → helps refill the TYSM bonus pool.

This system is still in development. Details above may be adjusted before
launch — this section will be updated once it's live.
```

## 🛠️ Tech Stack

* **Framework:** Next.js (App Router)
* **Language:** TypeScript
* **SDK:** `@farcaster/miniapp-sdk`
* **Styling:** Tailwind CSS
* **Deployment:** Vercel
* **Blockchain:** Base Network (Ethereum L2)

---
Developed with 🔥 by **tops87sqweezz.base.eth**
