"use client";

import { sdk } from "@farcaster/miniapp-sdk";

type ShareClaimButtonProps = {
  streakDays: number;
  totalClaims?: number;
  username?: string;
};

export default function ShareClaimButton({
  streakDays,
  totalClaims,
  username,
}: ShareClaimButtonProps) {
  async function handleShare() {
    const safeStreakDays = Math.max(0, Number(streakDays || 0));
    const safeTotalClaims =
      totalClaims !== undefined ? Math.max(0, Number(totalClaims || 0)) : undefined;

    const userLine = username
      ? `${username} just claimed TYSM 🙏`
      : "I just claimed TYSM 🙏";

    const streakLine =
      safeStreakDays === 1
        ? "Current streak: 1 day"
        : `Current streak: ${safeStreakDays} days`;

    const totalLine =
      safeTotalClaims !== undefined ? `Total claims: ${safeTotalClaims}` : "";

    const text = [
      userLine,
      "",
      "TYSM Daily Faucet is live.",
      streakLine,
      totalLine,
      "",
      "Claim yours:",
      "https://tysm-faucet.vercel.app/",
    ]
      .filter(Boolean)
      .join("\n");

    await sdk.actions.composeCast({
      text,
      embeds: ["https://tysm-faucet.vercel.app/"],
    });
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="w-full rounded-xl bg-purple-600 px-4 py-3 font-semibold text-white shadow-lg transition hover:bg-purple-700 active:scale-[0.98]"
    >
      Share my TYSM streak
    </button>
  );
}
