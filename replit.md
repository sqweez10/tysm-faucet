# TYSM Daily Faucet

A Farcaster miniapp that lets users claim free $TYSM tokens on Base Chain every 24 hours, with streak tracking, cycle-based rewards, and a live leaderboard.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/tysm-faucet run dev` — run the frontend (handled by workflow)
- `pnpm run typecheck` — full typecheck across all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (Tailwind CSS v4)
- API: Express 5
- Blockchain: wagmi v2 + viem, Base Chain
- Farcaster: @farcaster/frame-sdk, @farcaster/miniapp-sdk, @farcaster/frame-wagmi-connector

## Where things live

- `artifacts/tysm-faucet/src/pages/Home.tsx` — main faucet UI (claim + leaderboard tabs)
- `artifacts/tysm-faucet/src/pages/SharePage.tsx` — share page shown when casting
- `artifacts/api-server/src/routes/leaderboard.ts` — leaderboard API (fetches from Basescan + multicall)
- `artifacts/tysm-faucet/public/` — og.png, Tysm-Logo.png

## Architecture decisions

- No database needed — all on-chain state read via wagmi/viem contract calls
- Leaderboard fetches recent txs from Basescan API then multicalls userInfo for each address
- Farcaster SDK initializes on mount; SDK not available in regular browsers (gracefully handles this)
- `VITE_FAUCET_ADDRESS` env var controls the contract address (zero address = demo mode)
- `VITE_APP_URL` env var sets the base URL for share links

## Product

Users open the miniapp inside Farcaster, connect their wallet via the Farcaster frame connector, and claim $TYSM tokens once per 24 hours. Streaks unlock higher cycle base rates (2K/5K/10K/day) and milestone bonuses on days 7, 15, 30. A live leaderboard shows top claimers sorted by total days.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Set `VITE_FAUCET_ADDRESS` to the deployed contract address for the faucet to work
- Basescan API rate-limited without an API key (the leaderboard uses `YourApiKeyToken` placeholder)
- wagmi/viem are in `devDependencies` since this is a Vite-built static app
- The `buffer` module externalization warning in the browser console is harmless (from viem internals)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
