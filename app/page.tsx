"use client";

import { useEffect, useState, useCallback } from "react";
import sdk from "@farcaster/frame-sdk";
import { sdk as miniappSdk } from "@farcaster/miniapp-sdk";
import {
  useAccount, useConnect, useReadContract,
  useWriteContract, useWaitForTransactionReceipt,
} from "wagmi";
import { farcasterFrame } from "@farcaster/frame-wagmi-connector";
import { formatUnits } from "viem";
import { base } from "wagmi/chains";

const FAUCET_ADDRESS = (process.env.NEXT_PUBLIC_FAUCET_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://tysm-faucet.vercel.app";

const FAUCET_ABI = [
  { name: "claim", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "getTimeLeft", type: "function", stateMutability: "view", inputs: [{ name: "_user", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "canClaim", type: "function", stateMutability: "view", inputs: [{ name: "_user", type: "address" }], outputs: [{ type: "bool" }] },
  { name: "faucetBalance", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "userInfo", type: "function", stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "lastClaim", type: "uint256" },
      { name: "streak", type: "uint256" },
      { name: "totalClaimed", type: "uint256" },
      { name: "totalDays", type: "uint256" },
    ]
  },
  { name: "totalClaimsCount", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "nextReward", type: "function", stateMutability: "view", inputs: [{ name: "_user", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

function formatCountdown(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}

function formatAmount(amount: bigint): string {
  return Number(formatUnits(amount, 18)).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const MILESTONES = [
  { day: 7,  reward: "10,000", color: "#f59e0b", label: "Gift" },
  { day: 15, reward: "40,000", color: "#10b981", label: "Gift" },
  { day: 30, reward: "90,000", color: "#8b5cf6", label: "Gift" },
];

function getNextMilestone(streak: number) {
  if (streak < 7)  return { day: 7,  reward: "10,000", daysLeft: 7 - streak };
  if (streak < 15) return { day: 15, reward: "40,000", daysLeft: 15 - streak };
  if (streak < 30) return { day: 30, reward: "90,000", daysLeft: 30 - streak };
  return null;
}

function getRewardLabel(streak: number): string {
  if (streak === 30) return "90,000";
  if (streak === 15) return "40,000";
  if (streak === 7)  return "10,000";
  return "2,000";
}

function isMilestone(streak: number): boolean {
  return streak === 7 || streak === 15 || streak === 30;
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const contractReady = FAUCET_ADDRESS !== ZERO_ADDR;

export default function Home() {
  const [sdkReady, setSdkReady]       = useState(false);
  const [userCtx, setUserCtx]         = useState<any>(null);
  const [countdown, setCountdown]     = useState(0);
  const [justClaimed, setJustClaimed] = useState(false);
  const [txError, setTxError]         = useState("");
  const [hasShared, setHasShared]     = useState(false);

  const { address, isConnected } = useAccount();
  const { connect } = useConnect();

  const baseQ = { query: { enabled: contractReady && !!address } };

  const { data: canClaimData, refetch: refetchCanClaim } = useReadContract({
    address: FAUCET_ADDRESS, abi: FAUCET_ABI, functionName: "canClaim",
    args: [address!], ...baseQ,
  });
  const { data: timeLeftData, refetch: refetchTimeLeft } = useReadContract({
    address: FAUCET_ADDRESS, abi: FAUCET_ABI, functionName: "getTimeLeft",
    args: [address!], ...baseQ,
  });
  const { data: userInfoData, refetch: refetchUserInfo } = useReadContract({
    address: FAUCET_ADDRESS, abi: FAUCET_ABI, functionName: "userInfo",
    args: [address!], ...baseQ,
  });
  const { data: faucetBalData, refetch: refetchBalance } = useReadContract({
    address: FAUCET_ADDRESS, abi: FAUCET_ABI, functionName: "faucetBalance",
    query: { enabled: contractReady },
  });
  const { data: totalClaimsData } = useReadContract({
    address: FAUCET_ADDRESS, abi: FAUCET_ABI, functionName: "totalClaimsCount",
    query: { enabled: contractReady },
  });

  const { writeContract, data: txHash, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isTxLoading, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    const load = async () => {
      try {
        const ctx = await sdk.context;
        setUserCtx(ctx);
        connect({ connector: farcasterFrame() });
        await sdk.actions.ready();
      } catch (e) {
        console.warn("SDK:", e);
      } finally {
        setSdkReady(true);
      }
    };
    if (!sdkReady) load();
  }, [sdkReady, connect]);

  useEffect(() => {
    if (timeLeftData !== undefined) setCountdown(Number(timeLeftData));
  }, [timeLeftData]);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => {
      setCountdown((p) => {
        if (p <= 1) { refetchCanClaim(); refetchTimeLeft(); return 0; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [countdown, refetchCanClaim, refetchTimeLeft]);

  useEffect(() => {
    if (!isTxSuccess) return;
    setJustClaimed(true);
    setHasShared(false);
    refetchCanClaim(); refetchTimeLeft(); refetchUserInfo(); refetchBalance();
  }, [isTxSuccess, refetchCanClaim, refetchTimeLeft, refetchUserInfo, refetchBalance]);

  useEffect(() => {
    if (!writeError) return;
    setTxError("Transaction failed. Try again.");
    const id = setTimeout(() => setTxError(""), 4000);
    return () => clearTimeout(id);
  }, [writeError]);

  const handleShareFirst = useCallback(async () => {
    const streak  = userInfoData ? Number(userInfoData[1]) : 0;
    const total   = userInfoData ? formatAmount(userInfoData[2]) : "0";
    const name    = userCtx?.user?.displayName || userCtx?.user?.username || "Someone";
    const reward  = getRewardLabel(streak + 1);
    const nextM   = getNextMilestone(streak);

    const text = nextM
      ? `Claiming ${reward} $TYSM on Day ${streak + 1}!\nOnly ${nextM.daysLeft} days until Day ${nextM.day} milestone -> ${nextM.reward} $TYSM!\n\nClaim yours free every 24h:`
      : `${name} is claiming $TYSM on Day ${streak + 1}!\nFree to claim every 24 hours:`;

    const shareUrl = `${APP_URL}/share?user=${encodeURIComponent(name)}&streak=${streak}&claimed=${total}`;

    try {
      await miniappSdk.actions.composeCast({ text, embeds: [shareUrl] });
    } catch {
      const url = `https://farcaster.xyz/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(shareUrl)}`;
      await sdk.actions.openUrl(url);
    }
    setHasShared(true);
  }, [userInfoData, userCtx]);

  const handleClaim = useCallback(() => {
    setTxError("");
    writeContract({ address: FAUCET_ADDRESS, abi: FAUCET_ABI, functionName: "claim", chainId: base.id });
  }, [writeContract]);

  const handleShareAfter = useCallback(async () => {
    const streak = userInfoData ? Number(userInfoData[1]) : 0;
    const total  = userInfoData ? formatAmount(userInfoData[2]) : "0";
    const name   = userCtx?.user?.displayName || userCtx?.user?.username || "Someone";
    const reward = getRewardLabel(streak);
    const mile   = isMilestone(streak);

    const text = mile
      ? `${name} hit Day ${streak} Milestone! Received ${reward} $TYSM! Total: ${total} $TYSM\n\nClaim yours free every 24h:`
      : `${name} claimed ${reward} $TYSM! Day ${streak} streak! Total: ${total} $TYSM\n\nClaim yours free every 24h:`;

    const shareUrl = `${APP_URL}/share?user=${encodeURIComponent(name)}&streak=${streak}&claimed=${total}`;

    try {
      await miniappSdk.actions.composeCast({ text, embeds: [shareUrl] });
    } catch {
      const url = `https://farcaster.xyz/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(shareUrl)}`;
      await sdk.actions.openUrl(url);
    }
  }, [userInfoData, userCtx]);

  const streak       = userInfoData ? Number(userInfoData[1]) : 0;
  const totalDays    = userInfoData ? Number(userInfoData[3]) : 0;
  const totalClaimed = userInfoData ? userInfoData[2] : BigInt(0);
  const faucetBal    = faucetBalData ?? BigInt(0);
  const totalClaims  = Number(totalClaimsData ?? BigInt(0));
  const canClaim     = canClaimData ?? false;
  const isBusy       = isWritePending || isTxLoading;
  const nextStreak   = streak + 1 > 30 ? 1 : streak + 1;
  const rewardLabel  = getRewardLabel(nextStreak);
  const nextM        = getNextMilestone(streak);
  const isOnMile     = isMilestone(nextStreak);
  const cyclePos     = streak === 0 ? 0 : streak % 30 === 0 ? 30 : streak % 30;
  const cyclePct     = (cyclePos / 30) * 100;

  if (!sdkReady) {
    return (
      <div className="min-h-screen bg-[#0d0d1a] flex flex-col items-center justify-center gap-4">
        <div className="text-6xl animate-bounce">🙏</div>
        <p className="text-yellow-400 text-sm animate-pulse tracking-widest">LOADING TYSM FAUCET...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0a0a18] via-[#0f1425] to-[#0a0a18] text-white">
      <style>{`
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
        @keyframes milePulse{0%{transform:scale(1)}50%{transform:scale(1.06)}100%{transform:scale(1)}}
        .mile-pulse{animation:milePulse 1.5s ease-in-out infinite}
      `}</style>

      <div className="max-w-sm mx-auto px-4 pt-5 pb-8 space-y-3">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {userCtx?.user?.pfpUrl ? (
              <img src={userCtx.user.pfpUrl} alt="pfp"
                className="w-10 h-10 rounded-full border-2 border-yellow-500/40 object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-yellow-900/20 border-2 border-yellow-700/30 flex items-center justify-center text-xl">
                🙏
              </div>
            )}
            <div>
              <p className="text-yellow-300 font-bold text-sm leading-tight">
                {userCtx?.user?.displayName || userCtx?.user?.username || "Farcaster User"}
              </p>
              <p className="text-gray-600 text-[11px]">
                {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Connecting..."}
              </p>
            </div>
          </div>
          <div className="bg-white/5 border border-yellow-800/30 rounded-xl px-3 py-1.5 text-right">
            <p className="text-gray-500 text-[9px] uppercase tracking-widest">Total Days</p>
            <p className="text-yellow-400 font-black text-lg leading-tight">{totalDays}d 🔥</p>
          </div>
        </div>

        {/* Title */}
        <div className="text-center py-1">
          <div className="text-5xl mb-1" style={{ animation: "float 3s ease-in-out infinite" }}>🙏</div>
          <h1 className="text-5xl font-black leading-none mb-0.5"
            style={{ background: "linear-gradient(135deg,#fcd34d,#f59e0b,#d97706)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            $TYSM
          </h1>
          <p className="text-gray-500 text-[10px] tracking-[0.4em] uppercase">Daily Faucet · by tops87</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/4 border border-yellow-900/20 rounded-2xl p-3">
            <p className="text-gray-500 text-[9px] uppercase tracking-widest mb-0.5">Faucet Pool</p>
            <p className="text-yellow-400 font-black text-base leading-tight">
              {contractReady ? formatAmount(faucetBal) : "—"}
            </p>
            <p className="text-gray-600 text-[10px]">$TYSM left</p>
          </div>
          <div className="bg-white/4 border border-green-900/20 rounded-2xl p-3">
            <p className="text-gray-500 text-[9px] uppercase tracking-widest mb-0.5">You Claimed</p>
            <p className="text-green-400 font-black text-base leading-tight">
              {totalClaimed > BigInt(0) ? formatAmount(totalClaimed) : "0"}
            </p>
            <p className="text-gray-600 text-[10px]">$TYSM total</p>
          </div>
        </div>

        {/* 30-Day Progress */}
        <div className="bg-white/4 border border-yellow-900/20 rounded-2xl p-3.5">
          <div className="flex justify-between items-center mb-2">
            <p className="text-gray-400 text-xs font-medium">30-Day Cycle</p>
            <p className="text-yellow-400 text-xs font-black">Day {cyclePos}/30</p>
          </div>

          {/* Bar */}
          <div className="relative w-full bg-gray-800/80 rounded-full h-3 overflow-hidden mb-1">
            <div className="h-3 rounded-full transition-all duration-700"
              style={{ width: `${cyclePct}%`, background: "linear-gradient(90deg,#f59e0b,#fcd34d)" }} />
            {MILESTONES.map((m) => (
              <div key={m.day} className="absolute top-0 h-full w-0.5 bg-white/25"
                style={{ left: `${(m.day / 30) * 100}%` }} />
            ))}
          </div>

          {/* Milestone labels */}
          <div className="flex justify-between mt-1.5">
            {MILESTONES.map((m) => (
              <div key={m.day} className="text-center">
                <p className="text-[10px]" style={{ color: cyclePos >= m.day ? m.color : "#4b5563" }}>
                  🎁
                </p>
                <p className="text-[8px] text-gray-600">D{m.day}</p>
                <p className="text-[8px] font-bold" style={{ color: cyclePos >= m.day ? m.color : "#4b5563" }}>
                  {m.reward}
                </p>
              </div>
            ))}
          </div>

          {/* Next milestone banner */}
          {nextM && (
            <div className="mt-2.5 bg-white/5 border border-yellow-800/20 rounded-xl px-3 py-1.5 flex justify-between items-center">
              <p className="text-gray-500 text-[10px]">Next Milestone</p>
              <p className="text-yellow-400 text-[10px] font-bold">
                🎁 Day {nextM.day} → {nextM.reward} $TYSM ({nextM.daysLeft}d left)
              </p>
            </div>
          )}
        </div>

        {/* Main Claim Card */}
        <div className="bg-white/4 border border-yellow-900/20 rounded-2xl p-4 text-center"
          style={{ boxShadow: isOnMile ? "0 0 32px rgba(245,158,11,0.28)" : "0 0 20px rgba(245,158,11,0.08)" }}>

          {!contractReady ? (
            <p className="text-gray-600 text-sm py-4">Deploy contract first...</p>

          ) : canClaim ? (
            <>
              {isOnMile ? (
                <div className="mile-pulse inline-flex items-center gap-1.5 bg-yellow-950/60 border border-yellow-500/40 rounded-full px-3 py-1 mb-2.5">
                  <span>🎁</span>
                  <p className="text-yellow-300 text-[11px] font-black">MILESTONE DAY!</p>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 bg-green-950/60 border border-green-700/30 rounded-full px-3 py-1 mb-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <p className="text-green-400 text-[11px] font-bold">READY TO CLAIM</p>
                </div>
              )}

              <p className="font-black text-yellow-400 leading-none mb-0.5" style={{ fontSize: 52 }}>
                {rewardLabel}
              </p>
              <p className="text-gray-500 text-sm mb-3">$TYSM tokens</p>

              {txError && <p className="text-red-400 text-xs mb-2 bg-red-950/30 rounded-lg p-1.5">{txError}</p>}
              {isTxSuccess && justClaimed && (
                <p className="text-green-400 text-xs mb-2 font-semibold">✅ Claimed! Check your wallet.</p>
              )}

              {/* Share before claim */}
              {!hasShared ? (
                <div className="space-y-2">
                  <button onClick={handleShareFirst}
                    className="w-full font-black py-3.5 rounded-xl text-base transition-all active:scale-95 flex items-center justify-center gap-2 text-white"
                    style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
                    ⚡ Share First → Unlock Claim!
                  </button>
                  <p className="text-gray-600 text-[10px]">Share to unlock the Claim button 🙏</p>
                </div>
              ) : (
                <button onClick={handleClaim} disabled={isBusy || !isConnected}
                  className="w-full font-black py-4 rounded-xl text-lg transition-all active:scale-95"
                  style={{
                    background: isBusy || !isConnected ? "#374151" : "linear-gradient(90deg,#f59e0b,#fcd34d,#f59e0b)",
                    color: isBusy || !isConnected ? "#6b7280" : "#000",
                  }}>
                  {isBusy ? "⏳ Sending..." : !isConnected ? "🔌 Connecting..." : "🙏 Claim $TYSM"}
                </button>
              )}
            </>

          ) : (
            <>
              <p className="text-gray-500 text-[11px] uppercase tracking-widest mb-1">Next Claim In</p>
              <p className="font-black text-yellow-400 font-mono"
                style={{ fontSize: 40, letterSpacing: "0.06em" }}>
                {countdown > 0 ? formatCountdown(countdown) : "00:00:00"}
              </p>
              <p className="text-gray-600 text-xs mt-1">
                Come back in ~{Math.ceil(countdown / 3600)}h
              </p>
              {nextM && (
                <p className="text-yellow-700 text-[10px] mt-1.5">
                  🎯 {nextM.daysLeft} more days → 🎁 {nextM.reward} $TYSM!
                </p>
              )}
            </>
          )}
        </div>

        {/* Community stats */}
        <div className="bg-white/4 border border-purple-900/20 rounded-2xl p-3">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-gray-500 text-[9px] uppercase tracking-widest">Community Claims</p>
              <p className="text-purple-400 font-black text-xl">{totalClaims.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-gray-500 text-[9px] uppercase tracking-widest">Daily Reward</p>
              <p className="text-yellow-400 font-black text-xl">2,000+</p>
            </div>
          </div>
        </div>

        {/* Share after claim */}
        {justClaimed && (
          <button onClick={handleShareAfter}
            className="w-full text-white font-black py-4 rounded-2xl text-base transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)", boxShadow: "0 0 24px rgba(139,92,246,0.2)" }}>
            🎉 Share Your Claim! Cast it! ⚡
          </button>
        )}

        {/* Milestone Info */}
        <div className="bg-white/3 border border-white/5 rounded-2xl p-3.5">
          <p className="text-gray-400 text-xs font-bold mb-2.5">🎁 Milestone Rewards</p>
          <div className="space-y-1.5">
            {[
              { day: 7,  reward: "10,000", color: "text-yellow-400" },
              { day: 15, reward: "40,000", color: "text-green-400"  },
              { day: 30, reward: "90,000", color: "text-purple-400" },
            ].map((m) => (
              <div key={m.day} className="flex justify-between items-center">
                <p className="text-gray-500 text-[11px]">🎁 Day {m.day}</p>
                <p className={`text-[11px] font-bold ${m.color}`}>{m.reward} $TYSM</p>
              </div>
            ))}
          </div>
          <div className="mt-2.5 pt-2 border-t border-white/5 space-y-1">
            <p className="text-gray-600 text-[10px]">🔄 After Day 30 → New Cycle begins</p>
            <p className="text-gray-600 text-[10px]">⚡ Share first to unlock Claim</p>
            <p className="text-gray-600 text-[10px]">🔒 Smart Contract on Base Chain</p>
          </div>
        </div>

        <p className="text-center text-gray-700 text-[10px] pt-1">
          $TYSM Faucet · tops87 · Base Chain
        </p>
      </div>
    </main>
  );
}
