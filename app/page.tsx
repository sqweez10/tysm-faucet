"use client";

// START OF NEW UI
// ============================================================
//  TYSM Daily Faucet — Overhaul v2
//  - Infinite Cycle Loyalty Logic (Cycle 1/2/3+)
//  - Heart Protection System (0–3/3)
//  - UTC-only countdown & streak checks
//  - Leaderboard tab with Milestone Rules + Lucky Draw
//  - NO changes to contract / wagmi / providers
// ============================================================

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

// ─── Contract Config (unchanged) ────────────────────────────
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

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const contractReady = FAUCET_ADDRESS !== ZERO_ADDR;

// ─── Formatters ─────────────────────────────────────────────
function formatCountdown(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}
function formatAmount(amount: bigint): string {
  return Number(formatUnits(amount, 18)).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

// ─── Infinite Cycle Logic ────────────────────────────────────
interface MilestoneEntry { day: number; reward: number; cycleDay: number; }
interface CycleInfo {
  cycle: number;
  cycleDay: number;
  baseRate: number;
  milestones: MilestoneEntry[];
  cycleLabel: string;
}

function getCycleInfo(totalDays: number): CycleInfo {
  if (totalDays <= 30) {
    return {
      cycle: 1, cycleDay: totalDays, baseRate: 2000,
      cycleLabel: "Cycle 1",
      milestones: [
        { day: 7,  reward: 10000,  cycleDay: 7  },
        { day: 15, reward: 40000,  cycleDay: 15 },
        { day: 30, reward: 90000,  cycleDay: 30 },
      ],
    };
  } else if (totalDays <= 60) {
    return {
      cycle: 2, cycleDay: totalDays - 30, baseRate: 5000,
      cycleLabel: "Cycle 2",
      milestones: [
        { day: 37, reward: 20000,  cycleDay: 7  },
        { day: 45, reward: 80000,  cycleDay: 15 },
        { day: 60, reward: 180000, cycleDay: 30 },
      ],
    };
  } else {
    // Cycle 3+ uses same 2x pattern as cycle 2, anchored at day 61
    const base3 = Math.floor((totalDays - 61) / 30) * 30 + 61;
    return {
      cycle: 3, cycleDay: totalDays - 60, baseRate: 10000,
      cycleLabel: "Cycle 3+",
      milestones: [
        { day: 67, reward: 20000,  cycleDay: 7  },
        { day: 75, reward: 80000,  cycleDay: 15 },
        { day: 90, reward: 180000, cycleDay: 30 },
      ],
    };
  }
}

function getDailyReward(totalDays: number): number {
  const { milestones, baseRate } = getCycleInfo(totalDays);
  const hit = milestones.find(m => m.day === totalDays);
  return hit ? hit.reward : baseRate;
}

function isMilestoneDay(totalDays: number): boolean {
  const { milestones } = getCycleInfo(totalDays);
  return milestones.some(m => m.day === totalDays);
}

function getNextMilestone(totalDays: number): MilestoneEntry | null {
  const { milestones } = getCycleInfo(totalDays);
  return milestones.find(m => m.day > totalDays) ?? null;
}

// Cycle progress bar: position within the 30-day window
function getCycleProgress(totalDays: number): { pos: number; pct: number } {
  const { cycleDay } = getCycleInfo(totalDays);
  const pos = Math.min(cycleDay, 30);
  return { pos, pct: (pos / 30) * 100 };
}

// ─── Heart / Protection Colors ───────────────────────────────
function heartColor(hearts: number): string {
  if (hearts === 0) return "#22c55e";   // green  — 0/3
  if (hearts === 1) return "#eab308";   // yellow — 1/3
  if (hearts === 2) return "#f97316";   // orange — 2/3
  return "#ef4444";                     // red    — 3/3
}
function heartBg(hearts: number): string {
  if (hearts === 0) return "rgba(34,197,94,0.12)";
  if (hearts === 1) return "rgba(234,179,8,0.12)";
  if (hearts === 2) return "rgba(249,115,22,0.12)";
  return "rgba(239,68,68,0.12)";
}

// ─── UTC Month-end Countdown ─────────────────────────────────
function getMonthEndSecondsUTC(): number {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
}

// ─── Mock Leaderboard Data ───────────────────────────────────
// In production this would come from your backend API
const MOCK_LEADERBOARD = [
  { rank: 1,  handle: "@tops87",     totalDays: 91, dailyRate: 10000, hearts: 0 },
  { rank: 2,  handle: "@cryptolily", totalDays: 67, dailyRate: 10000, hearts: 1 },
  { rank: 3,  handle: "@basewhale",  totalDays: 60, dailyRate: 5000,  hearts: 0 },
  { rank: 4,  handle: "@nftpanda",   totalDays: 45, dailyRate: 5000,  hearts: 2 },
  { rank: 5,  handle: "@gmgm_eth",   totalDays: 37, dailyRate: 5000,  hearts: 1 },
  { rank: 6,  handle: "@wagmifren",  totalDays: 30, dailyRate: 2000,  hearts: 0 },
  { rank: 7,  handle: "@pixel_ape",  totalDays: 22, dailyRate: 2000,  hearts: 3 },
  { rank: 8,  handle: "@degenking",  totalDays: 15, dailyRate: 2000,  hearts: 2 },
  { rank: 9,  handle: "@solarsail",  totalDays: 7,  dailyRate: 2000,  hearts: 0 },
  { rank: 10, handle: "@newfrend",   totalDays: 3,  dailyRate: 2000,  hearts: 1 },
];

// ─── Heart Display Component ─────────────────────────────────
function HeartBadge({ hearts }: { hearts: number }) {
  const color = heartColor(hearts);
  const bg    = heartBg(hearts);
  const full  = 3 - hearts;
  return (
    <span style={{ color, background: bg, border: `1px solid ${color}40` }}
      className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold">
      {"❤️".repeat(full)}{"🖤".repeat(hearts)} {hearts}/3
    </span>
  );
}

// ─── Cycle Badge ─────────────────────────────────────────────
function CycleBadge({ cycle }: { cycle: number }) {
  const colors = ["", "#f59e0b", "#10b981", "#8b5cf6"];
  const c = Math.min(cycle, 3);
  return (
    <span style={{ color: colors[c], border: `1px solid ${colors[c]}50`, background: `${colors[c]}15` }}
      className="text-[9px] font-black rounded-full px-1.5 py-0.5 tracking-widest uppercase">
      C{cycle}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────
export default function Home() {
  const [sdkReady, setSdkReady]           = useState(false);
  const [userCtx, setUserCtx]             = useState<any>(null);
  const [countdown, setCountdown]         = useState(0);
  const [justClaimed, setJustClaimed]     = useState(false);
  const [txError, setTxError]             = useState("");
  const [hasShared, setHasShared]         = useState(false);
  const [activeTab, setActiveTab]         = useState<"home" | "board">("home");
  const [monthSecs, setMonthSecs]         = useState(getMonthEndSecondsUTC());
  // Hearts stored locally (in production: synced from backend)
  const [hearts, setHearts]               = useState(0); // 0–3

  const { address, isConnected } = useAccount();
  const { connect } = useConnect();

  const baseQ = { query: { enabled: contractReady && !!address } };

  const { data: canClaimData,  refetch: refetchCanClaim  } = useReadContract({
    address: FAUCET_ADDRESS, abi: FAUCET_ABI, functionName: "canClaim",
    args: [address!], ...baseQ,
  });
  const { data: timeLeftData,  refetch: refetchTimeLeft  } = useReadContract({
    address: FAUCET_ADDRESS, abi: FAUCET_ABI, functionName: "getTimeLeft",
    args: [address!], ...baseQ,
  });
  const { data: userInfoData,  refetch: refetchUserInfo  } = useReadContract({
    address: FAUCET_ADDRESS, abi: FAUCET_ABI, functionName: "userInfo",
    args: [address!], ...baseQ,
  });
  const { data: faucetBalData, refetch: refetchBalance   } = useReadContract({
    address: FAUCET_ADDRESS, abi: FAUCET_ABI, functionName: "faucetBalance",
    query: { enabled: contractReady },
  });
  const { data: totalClaimsData } = useReadContract({
    address: FAUCET_ADDRESS, abi: FAUCET_ABI, functionName: "totalClaimsCount",
    query: { enabled: contractReady },
  });

  const { writeContract, data: txHash, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isTxLoading, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // ── SDK init (unchanged) ───────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const ctx = await sdk.context;
        setUserCtx(ctx);
        connect({ connector: farcasterFrame() });
        await miniappSdk.actions.ready();
      } catch (e) {
        console.warn("SDK:", e);
      } finally {
        setSdkReady(true);
      }
    };
    if (!sdkReady) load();
  }, [sdkReady, connect]);

  // ── Countdown from contract (UTC-based) ───────────────────
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

  // ── Month-end countdown (UTC) ──────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setMonthSecs(getMonthEndSecondsUTC()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Post-claim effects ─────────────────────────────────────
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

  // ── Derived state ──────────────────────────────────────────
  const totalDays    = userInfoData ? Number(userInfoData[3]) : 0;
  const totalClaimed = userInfoData ? userInfoData[2] : BigInt(0);
  const faucetBal    = faucetBalData ?? BigInt(0);
  const totalClaims  = Number(totalClaimsData ?? BigInt(0));
  const canClaim     = canClaimData ?? false;
  const isBusy       = isWritePending || isTxLoading;

  // Next day's data (what user will earn on NEXT claim)
  const nextTotalDay  = totalDays + 1;
  const cycleInfo     = getCycleInfo(nextTotalDay);
  const rewardAmt     = getDailyReward(nextTotalDay);
  const isOnMile      = isMilestoneDay(nextTotalDay);
  const nextM         = getNextMilestone(totalDays);
  const { pos: cyclePos, pct: cyclePct } = getCycleProgress(totalDays);

  // Month countdown parts
  const mDays = Math.floor(monthSecs / 86400);
  const mHrs  = Math.floor((monthSecs % 86400) / 3600);
  const mMins = Math.floor((monthSecs % 3600) / 60);
  const mSecs = monthSecs % 60;

  // Share handlers (unchanged logic, updated labels)
  const handleShareFirst = useCallback(async () => {
    const name   = userCtx?.user?.displayName || userCtx?.user?.username || "Someone";
    const reward = fmt(rewardAmt);
    const text   = nextM
      ? `Claiming ${reward} $TYSM on Day ${nextTotalDay}!\nOnly ${nextM.day - totalDays} days until Day ${nextM.day} milestone → ${fmt(nextM.reward)} $TYSM!\n\nClaim yours free every 24h:`
      : `${name} is claiming $TYSM on Day ${nextTotalDay}! Free to claim every 24 hours:`;
    const shareUrl = `${APP_URL}/share?user=${encodeURIComponent(name)}&streak=${totalDays}`;
    try {
      await miniappSdk.actions.composeCast({ text, embeds: [shareUrl] });
    } catch {
      const url = `https://farcaster.xyz/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(shareUrl)}`;
      await sdk.actions.openUrl(url);
    }
    setHasShared(true);
  }, [userInfoData, userCtx, rewardAmt, nextTotalDay, nextM, totalDays]);

  const handleShareAfter = useCallback(async () => {
    const name   = userCtx?.user?.displayName || userCtx?.user?.username || "Someone";
    const reward = fmt(rewardAmt);
    const text   = isOnMile
      ? `${name} hit Day ${totalDays} Milestone! Received ${reward} $TYSM! 🎁\n\nClaim yours free every 24h:`
      : `${name} claimed ${reward} $TYSM! Day ${totalDays} streak! 🔥\n\nClaim yours free every 24h:`;
    const shareUrl = `${APP_URL}/share?user=${encodeURIComponent(name)}&streak=${totalDays}`;
    try {
      await miniappSdk.actions.composeCast({ text, embeds: [shareUrl] });
    } catch {
      const url = `https://farcaster.xyz/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(shareUrl)}`;
      await sdk.actions.openUrl(url);
    }
  }, [userInfoData, userCtx, rewardAmt, totalDays, isOnMile]);

  const handleClaim = useCallback(() => {
    setTxError("");
    writeContract({ address: FAUCET_ADDRESS, abi: FAUCET_ABI, functionName: "claim", chainId: base.id });
  }, [writeContract]);

  // ── Loading screen ─────────────────────────────────────────
  if (!sdkReady) {
    return (
      <div className="min-h-screen bg-[#0d0d1a] flex flex-col items-center justify-center gap-4">
        <div className="text-6xl animate-bounce">🙏</div>
        <p className="text-yellow-400 text-sm animate-pulse tracking-widest">LOADING TYSM FAUCET...</p>
      </div>
    );
  }

  // ── Cycle milestone markers for progress bar ───────────────
  const { milestones: currentMilestones } = getCycleInfo(Math.max(totalDays, 1));
  const milestoneMarkers = [
    { pct: (7  / 30) * 100, color: "#f59e0b", label: "D7"  },
    { pct: (15 / 30) * 100, color: "#10b981", label: "D15" },
    { pct: (30 / 30) * 100, color: "#8b5cf6", label: "D30" },
  ];

  // ─────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0a0a18] via-[#0f1425] to-[#0a0a18] text-white">
      <style>{`
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
        @keyframes milePulse{0%{transform:scale(1)}50%{transform:scale(1.06)}100%{transform:scale(1)}}
        @keyframes shimmer{0%{background-position:200% center}100%{background-position:-200% center}}
        @keyframes glow{0%,100%{opacity:.6}50%{opacity:1}}
        .mile-pulse{animation:milePulse 1.5s ease-in-out infinite}
        .shimmer-text{background:linear-gradient(90deg,#fcd34d,#f59e0b,#fde68a,#f59e0b,#fcd34d);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:shimmer 3s linear infinite}
        .tab-active{border-bottom:2px solid #f59e0b;color:#fcd34d}
        .tab-inactive{border-bottom:2px solid transparent;color:#6b7280}
        .prize-gold{background:linear-gradient(135deg,#92400e,#78350f);border:1px solid #f59e0b60}
        .prize-silver{background:linear-gradient(135deg,#1f2937,#111827);border:1px solid #9ca3af60}
        .prize-bronze{background:linear-gradient(135deg,#1c1009,#0f0a04);border:1px solid #d9770660}
        .lucky-bg{background:radial-gradient(ellipse at top,#1a1040,#0a0a18)}
        .leaderboard-me{background:linear-gradient(90deg,rgba(245,158,11,0.08),rgba(245,158,11,0.04));border-top:1px solid rgba(245,158,11,0.25)}
      `}</style>

      {/* ── Tab Navigation ── */}
      <div className="sticky top-0 z-50 bg-[#0a0a18]/95 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-sm mx-auto flex">
          {(["home", "board"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-xs font-black tracking-widest uppercase transition-all ${activeTab === tab ? "tab-active" : "tab-inactive"}`}>
              {tab === "home" ? "🙏 Claim" : "🏆 Leaderboard"}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════
          HOME TAB
      ══════════════════════════════════════ */}
      {activeTab === "home" && (
        <div className="max-w-sm mx-auto px-4 pt-5 pb-8 space-y-3">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {userCtx?.user?.pfpUrl ? (
                <img src={userCtx.user.pfpUrl} alt="pfp"
                  className="w-10 h-10 rounded-full border-2 border-yellow-500/40 object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-yellow-900/20 border-2 border-yellow-700/30 flex items-center justify-center text-xl">🙏</div>
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
            <div className="flex flex-col items-end gap-1">
              <div className="bg-white/5 border border-yellow-800/30 rounded-xl px-3 py-1 text-right">
                <p className="text-gray-500 text-[9px] uppercase tracking-widest">Total Days</p>
                <p className="text-yellow-400 font-black text-lg leading-tight">{totalDays}d 🔥</p>
              </div>
              <HeartBadge hearts={hearts} />
            </div>
          </div>

          {/* Title */}
          <div className="text-center py-1">
            <div className="text-5xl mb-1" style={{ animation: "float 3s ease-in-out infinite" }}>🙏</div>
            <h1 className="text-5xl font-black leading-none mb-0.5 shimmer-text">$TYSM</h1>
            <p className="text-gray-500 text-[10px] tracking-[0.4em] uppercase">Daily Faucet · by tops87</p>
          </div>

          {/* Cycle Badge Row */}
          <div className="flex items-center justify-center gap-2">
            <CycleBadge cycle={cycleInfo.cycle} />
            <p className="text-gray-500 text-[11px]">
              {cycleInfo.cycle === 1 ? "Base: 2,000 $TYSM/day"
              : cycleInfo.cycle === 2 ? "Upgraded: 5,000 $TYSM/day"
              : "Elite: 10,000 $TYSM/day"}
            </p>
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

          {/* Cycle Progress Bar */}
          <div className="bg-white/4 border border-yellow-900/20 rounded-2xl p-3.5">
            <div className="flex justify-between items-center mb-2">
              <p className="text-gray-400 text-xs font-medium">
                {cycleInfo.cycleLabel} Progress
              </p>
              <p className="text-yellow-400 text-xs font-black">Day {cyclePos}/30</p>
            </div>
            <div className="relative w-full bg-gray-800/80 rounded-full h-3 overflow-hidden mb-1">
              <div className="h-3 rounded-full transition-all duration-700"
                style={{ width: `${cyclePct}%`, background: "linear-gradient(90deg,#f59e0b,#fcd34d)" }} />
              {milestoneMarkers.map((m) => (
                <div key={m.pct}
                  className="absolute top-0 h-full w-0.5"
                  style={{ left: `${m.pct}%`, background: m.color + "60" }} />
              ))}
            </div>
            <div className="flex justify-between mt-1.5">
              {currentMilestones.map((m) => (
                <div key={m.day} className="text-center">
                  <p className="text-[10px]" style={{ color: totalDays >= m.day ? "#f59e0b" : "#4b5563" }}>🎁</p>
                  <p className="text-[8px] text-gray-600">D{m.day}</p>
                  <p className="text-[8px] font-bold" style={{ color: totalDays >= m.day ? "#f59e0b" : "#4b5563" }}>
                    {fmt(m.reward)}
                  </p>
                </div>
              ))}
            </div>
            {nextM && (
              <div className="mt-2.5 bg-white/5 border border-yellow-800/20 rounded-xl px-3 py-1.5 flex justify-between items-center">
                <p className="text-gray-500 text-[10px]">Next Milestone</p>
                <p className="text-yellow-400 text-[10px] font-bold">
                  🎁 Day {nextM.day} → {fmt(nextM.reward)} $TYSM ({nextM.day - totalDays}d left)
                </p>
              </div>
            )}
          </div>

          {/* ── Main Claim Card ── */}
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
                <p className="font-black text-yellow-400 leading-none mb-0.5" style={{ fontSize: 48 }}>
                  {fmt(rewardAmt)}
                </p>
                <p className="text-gray-500 text-sm mb-3">$TYSM tokens</p>

                {txError && (
                  <p className="text-red-400 text-xs mb-2 bg-red-950/30 rounded-lg p-1.5">{txError}</p>
                )}
                {isTxSuccess && justClaimed && (
                  <p className="text-green-400 text-xs mb-2 font-semibold">✅ Claimed! Check your wallet.</p>
                )}

                {/* Share → Claim flow */}
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
              /* ── Countdown State ── */
              <>
                <p className="text-gray-500 text-[11px] uppercase tracking-widest mb-1">Next Claim In</p>
                <p className="font-black text-yellow-400 font-mono"
                  style={{ fontSize: 40, letterSpacing: "0.06em" }}>
                  {countdown > 0 ? formatCountdown(countdown) : "00:00:00"}
                </p>
                <p className="text-gray-600 text-xs mt-1">
                  {countdown > 0 ? `~${Math.ceil(countdown / 3600)}h remaining` : "Refreshing..."}
                </p>
                {nextM && (
                  <p className="text-yellow-700 text-[10px] mt-1.5">
                    🎯 {nextM.day - totalDays} more days → 🎁 {fmt(nextM.reward)} $TYSM!
                  </p>
                )}
                {/* Heart protection reminder */}
                <div className="mt-3 flex items-center justify-center gap-1.5">
                  <HeartBadge hearts={hearts} />
                  <p className="text-gray-600 text-[10px]">streak shield</p>
                </div>
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
                <p className="text-yellow-400 font-black text-xl">
                  {cycleInfo.cycle === 1 ? "2,000" : cycleInfo.cycle === 2 ? "5,000" : "10,000"}+
                </p>
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

          <p className="text-center text-gray-700 text-[10px] pt-1">
            $TYSM Faucet · tops87 · Base Chain · UTC
          </p>
        </div>
      )}

      {/* ══════════════════════════════════════
          LEADERBOARD TAB
      ══════════════════════════════════════ */}
      {activeTab === "board" && (
        <div className="max-w-sm mx-auto px-4 pt-5 pb-24 space-y-4">

          {/* ── SECTION 1: Rules & Milestone Loop ── */}
          <div className="bg-white/4 border border-yellow-900/25 rounded-2xl p-4 space-y-3">
            <p className="text-yellow-400 font-black text-sm tracking-wide">📜 Rules & Milestone Loops</p>

            {/* Cycle cards */}
            {[
              {
                label: "Cycle 1", days: "Days 1–30", rate: "2,000", badge: "#f59e0b",
                milestones: [
                  { d: 7,  r: "10,000" },
                  { d: 15, r: "40,000" },
                  { d: 30, r: "90,000" },
                ],
              },
              {
                label: "Cycle 2", days: "Days 31–60", rate: "5,000", badge: "#10b981",
                milestones: [
                  { d: 37, r: "20,000" },
                  { d: 45, r: "80,000" },
                  { d: 60, r: "180,000" },
                ],
              },
              {
                label: "Cycle 3+", days: "Days 61+", rate: "10,000", badge: "#8b5cf6",
                milestones: [
                  { d: 67, r: "20,000" },
                  { d: 75, r: "80,000" },
                  { d: 90, r: "180,000" },
                ],
              },
            ].map((c) => (
              <div key={c.label} className="rounded-xl p-3 space-y-1.5"
                style={{ background: `${c.badge}0d`, border: `1px solid ${c.badge}30` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                      style={{ color: c.badge, background: `${c.badge}20`, border: `1px solid ${c.badge}40` }}>
                      {c.label}
                    </span>
                    <p className="text-gray-400 text-[11px]">{c.days}</p>
                  </div>
                  <p className="text-[11px] font-bold" style={{ color: c.badge }}>
                    {c.rate} $TYSM/day
                  </p>
                </div>
                <div className="flex gap-2">
                  {c.milestones.map((m) => (
                    <div key={m.d} className="flex-1 text-center rounded-lg py-1"
                      style={{ background: `${c.badge}10` }}>
                      <p className="text-[9px] text-gray-500">Day {m.d}</p>
                      <p className="text-[10px] font-black" style={{ color: c.badge }}>🎁 {m.r}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Heart rules */}
            <div className="bg-white/5 rounded-xl p-3 space-y-1.5">
              <p className="text-gray-300 text-[11px] font-bold">❤️ Streak Protection</p>
              <div className="space-y-1">
                {[
                  { icon: "🟢", text: "0/3 — Full shields, streak safe" },
                  { icon: "🟡", text: "1/3 — 1 miss absorbed" },
                  { icon: "🟠", text: "2/3 — 2 misses absorbed" },
                  { icon: "🔴", text: "3/3 — One more miss = streak reset!" },
                  { icon: "🔄", text: "7 straight claims → shields refill to 0/3" },
                ].map((r) => (
                  <p key={r.text} className="text-[10px] text-gray-500 flex gap-1.5 items-start">
                    <span>{r.icon}</span>{r.text}
                  </p>
                ))}
              </div>
            </div>

            {/* UTC note */}
            <p className="text-gray-600 text-[9px] text-center">
              🌐 All timers & resets use UTC · Your 24h window starts from the exact moment you claim
            </p>
          </div>

          {/* ── SECTION 2: Lucky Draw ── */}
          <div className="lucky-bg border border-purple-800/40 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-purple-300 font-black text-sm">🎰 Monthly Lucky Draw</p>
              <span className="text-[9px] font-bold text-purple-400 bg-purple-900/30 border border-purple-700/30 rounded-full px-2 py-0.5 uppercase tracking-wider">
                End of Month
              </span>
            </div>

            {/* Countdown to month end */}
            <div className="bg-black/30 border border-purple-700/30 rounded-xl p-3 text-center">
              <p className="text-gray-500 text-[9px] uppercase tracking-widest mb-1">Draw Countdown (UTC)</p>
              <div className="flex justify-center gap-2">
                {[
                  { v: String(mDays).padStart(2, "0"), label: "Days" },
                  { v: String(mHrs).padStart(2, "0"),  label: "Hrs"  },
                  { v: String(mMins).padStart(2, "0"), label: "Min"  },
                  { v: String(mSecs).padStart(2, "0"), label: "Sec"  },
                ].map((t) => (
                  <div key={t.label} className="text-center">
                    <div className="bg-purple-900/40 border border-purple-700/30 rounded-lg w-10 h-9 flex items-center justify-center">
                      <span className="text-purple-200 font-black text-lg font-mono leading-none">{t.v}</span>
                    </div>
                    <p className="text-gray-600 text-[8px] mt-0.5">{t.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Prize tiers */}
            <div className="space-y-2">
              {[
                { rank: "🥇", prize: "1st Prize", usd: "$3.50", desc: "worth of $TYSM", cls: "prize-gold" },
                { rank: "🥈", prize: "2nd Prize", usd: "$2.50", desc: "worth of $TYSM", cls: "prize-silver" },
                { rank: "🥉", prize: "3rd Prize", usd: "$1.00", desc: "worth of $TYSM", cls: "prize-bronze" },
              ].map((p) => (
                <div key={p.prize} className={`${p.cls} rounded-xl p-3 flex items-center justify-between`}>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{p.rank}</span>
                    <div>
                      <p className="text-gray-300 text-[11px] font-bold">{p.prize}</p>
                      <p className="text-gray-500 text-[9px]">{p.desc}</p>
                    </div>
                  </div>
                  <p className="text-white font-black text-base">{p.usd}</p>
                </div>
              ))}
            </div>

            {/* Eligibility note */}
            <div className="bg-purple-900/20 border border-purple-700/20 rounded-xl p-2.5">
              <p className="text-gray-400 text-[10px] text-center">
                🎟️ All active claimers this month are automatically entered · Winner drawn by admin at month end (UTC)
              </p>
            </div>
          </div>

          {/* ── SECTION 3: Live Status Grid ── */}
          <div className="bg-white/4 border border-white/8 rounded-2xl p-3.5 space-y-2">
            <p className="text-gray-300 text-xs font-bold">📊 Your Live Status</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Total Days", value: `${totalDays}d 🔥`, color: "text-yellow-400" },
                { label: "Daily Rate",  value: `${fmt(cycleInfo.baseRate)}`, color: "text-green-400" },
                { label: "Current Cycle", value: cycleInfo.cycleLabel, color: "text-purple-400" },
              ].map((s) => (
                <div key={s.label} className="bg-white/5 rounded-xl p-2 text-center">
                  <p className={`${s.color} font-black text-sm leading-tight`}>{s.value}</p>
                  <p className="text-gray-600 text-[9px] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
              <p className="text-gray-400 text-[11px]">Streak Protection</p>
              <HeartBadge hearts={hearts} />
            </div>
          </div>

          {/* ── SECTION 4: Leaderboard Table ── */}
          <div className="bg-white/4 border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-3 py-2 border-b border-white/5">
              <p className="text-gray-300 text-xs font-bold">🏆 Community Ranks</p>
            </div>

            {/* Header */}
            <div className="grid grid-cols-12 gap-1 px-3 py-1.5 border-b border-white/5">
              <p className="col-span-1 text-gray-600 text-[9px] font-bold uppercase">#</p>
              <p className="col-span-4 text-gray-600 text-[9px] font-bold uppercase">User</p>
              <p className="col-span-2 text-gray-600 text-[9px] font-bold uppercase text-center">Days</p>
              <p className="col-span-2 text-gray-600 text-[9px] font-bold uppercase text-center">Rate</p>
              <p className="col-span-3 text-gray-600 text-[9px] font-bold uppercase text-center">Shield</p>
            </div>

            {/* Rows */}
            <div className="divide-y divide-white/5">
              {MOCK_LEADERBOARD.map((row) => {
                const ci = getCycleInfo(row.totalDays);
                const rankColor = row.rank === 1 ? "#f59e0b" : row.rank === 2 ? "#9ca3af" : row.rank === 3 ? "#d97706" : "#4b5563";
                return (
                  <div key={row.rank} className="grid grid-cols-12 gap-1 px-3 py-2.5 items-center">
                    <p className="col-span-1 font-black text-sm" style={{ color: rankColor }}>
                      {row.rank <= 3 ? ["🥇","🥈","🥉"][row.rank-1] : row.rank}
                    </p>
                    <div className="col-span-4 flex items-center gap-1">
                      <p className="text-gray-300 text-[11px] font-medium truncate">{row.handle}</p>
                      <CycleBadge cycle={ci.cycle} />
                    </div>
                    <p className="col-span-2 text-yellow-400 font-black text-[11px] text-center">{row.totalDays}🔥</p>
                    <p className="col-span-2 text-green-400 text-[10px] font-bold text-center">{(row.dailyRate/1000).toFixed(0)}K</p>
                    <div className="col-span-3 flex justify-center">
                      <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5"
                        style={{
                          color: heartColor(row.hearts),
                          background: heartBg(row.hearts),
                          border: `1px solid ${heartColor(row.hearts)}40`
                        }}>
                        {row.hearts}/3
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-center text-gray-700 text-[10px]">
            $TYSM Faucet · tops87 · Base Chain · UTC
          </p>
        </div>
      )}

      {/* ── Frozen "Your Status" row at bottom of leaderboard ── */}
      {activeTab === "board" && (
        <div className="fixed bottom-0 left-0 right-0 z-50 leaderboard-me px-4 py-2.5 backdrop-blur-sm">
          <div className="max-w-sm mx-auto grid grid-cols-12 gap-1 items-center">
            <p className="col-span-1 text-yellow-400 font-black text-sm">—</p>
            <div className="col-span-4 flex items-center gap-1">
              <p className="text-yellow-300 text-[11px] font-bold truncate">
                @{userCtx?.user?.username || "you"}
              </p>
              <CycleBadge cycle={cycleInfo.cycle} />
            </div>
            <p className="col-span-2 text-yellow-400 font-black text-[11px] text-center">{totalDays}🔥</p>
            <p className="col-span-2 text-green-400 text-[10px] font-bold text-center">
              {(cycleInfo.baseRate/1000).toFixed(0)}K
            </p>
            <div className="col-span-3 flex justify-center">
              <HeartBadge hearts={hearts} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
// END OF NEW UI
