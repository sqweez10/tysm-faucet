"use client";

import { useEffect, useState, useCallback } from "react";
// @ts-ignore
import sdk from "@farcaster/frame-sdk";
// @ts-ignore
import { sdk as miniappSdk } from "@farcaster/miniapp-sdk";
import {
  useAccount, useConnect, useReadContract,
  useWriteContract, useWaitForTransactionReceipt, usePublicClient,
} from "wagmi";
// @ts-ignore
import { farcasterFrame } from "@farcaster/frame-wagmi-connector";
import { formatUnits } from "viem";
import { base } from "wagmi/chains";

const FAUCET_ADDRESS = (import.meta.env.VITE_FAUCET_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;
const APP_URL = import.meta.env.VITE_APP_URL || "https://tysm-faucet.vercel.app";

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

function formatCountdown(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}
function nextClaimUTC(secondsLeft: number): string {
  const t = new Date(Date.now() + secondsLeft * 1000);
  const h = String(t.getUTCHours()).padStart(2, "0");
  const m = String(t.getUTCMinutes()).padStart(2, "0");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${t.getUTCDate()} ${months[t.getUTCMonth()]} ${h}:${m} UTC`;
}
function formatAmount(amount: bigint): string {
  return Number(formatUnits(amount, 18)).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

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

function getCycleProgress(totalDays: number): { pos: number; pct: number } {
  const { cycleDay } = getCycleInfo(totalDays);
  const pos = Math.min(cycleDay, 30);
  return { pos, pct: (pos / 30) * 100 };
}

function heartColor(hearts: number): string {
  if (hearts === 0) return "#22c55e";
  if (hearts === 1) return "#eab308";
  if (hearts === 2) return "#f97316";
  return "#ef4444";
}
function heartBg(hearts: number): string {
  if (hearts === 0) return "rgba(34,197,94,0.12)";
  if (hearts === 1) return "rgba(234,179,8,0.12)";
  if (hearts === 2) return "rgba(249,115,22,0.12)";
  return "rgba(239,68,68,0.12)";
}

function getMonthEndSecondsUTC(): number {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
}

interface LeaderboardEntry {
  rank: number;
  address: string;
  handle: string;
  totalDays: number;
  streak: number;
  hearts: number;
}

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

export default function Home() {
  const [sdkReady, setSdkReady]           = useState(false);
  const [userCtx, setUserCtx]             = useState<any>(null);
  const [countdown, setCountdown]         = useState(0);
  const [justClaimed, setJustClaimed]     = useState(false);
  const [txError, setTxError]             = useState("");
  const [hasShared, setHasShared]         = useState(false);
  const [activeTab, setActiveTab]         = useState<"home" | "board" | "rewards">("home");
  const [monthSecs, setMonthSecs]         = useState(getMonthEndSecondsUTC());
  const [hearts, setHearts]               = useState(0);

  const [liveLeaderboard, setLiveLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbLoading,       setLbLoading]       = useState(false);
  const [lbUpdatedAt,     setLbUpdatedAt]     = useState(0);
  const [lbError,         setLbError]         = useState(false);

  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const publicClient = usePublicClient();
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
    const id = setInterval(() => setMonthSecs(getMonthEndSecondsUTC()), 1000);
    return () => clearInterval(id);
  }, []);

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

  useEffect(() => {
    if (activeTab !== "board") return;
    let cancelled = false;
    const fetchLb = async () => {
      if (!contractReady || !publicClient) return;
      try {
        setLbError(false);
        setLbLoading(true);
        const bsRes = await fetch(
          `https://base.blockscout.com/api/v2/addresses/${FAUCET_ADDRESS}/transactions?filter=to`,
          { headers: { Accept: "application/json" } }
        );
        const bsJson = await bsRes.json() as {
          items?: Array<{ from: { hash: string }; status: string }>;
        };
        const addresses: `0x${string}`[] = [];
        if (Array.isArray(bsJson.items)) {
          const seen = new Set<string>();
          for (const tx of bsJson.items) {
            const from = tx.from?.hash?.toLowerCase();
            if (from && tx.status === "ok" && !seen.has(from)) {
              seen.add(from);
              addresses.push(tx.from.hash as `0x${string}`);
              if (addresses.length >= 25) break;
            }
          }
        }
        if (addresses.length === 0) {
          if (!cancelled) { setLiveLeaderboard([]); setLbUpdatedAt(Date.now()); }
          return;
        }
        const calls = addresses.map((addr) => ({
          address: FAUCET_ADDRESS,
          abi: FAUCET_ABI,
          functionName: "userInfo" as const,
          args: [addr] as const,
        }));
        const results = await publicClient.multicall({ contracts: calls, allowFailure: true });
        const rawBoard = results
          .map((r, i) => {
            if (r.status !== "success") return null;
            const [, streak, , totalDays] = r.result as readonly [bigint, bigint, bigint, bigint];
            const td = Number(totalDays);
            if (td === 0) return null;
            const addr = addresses[i];
            return { address: addr, handle: `${addr.slice(0, 6)}...${addr.slice(-4)}`, totalDays: td, streak: Number(streak), hearts: 0 };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
          .sort((a, b) => b.totalDays - a.totalDays)
          .slice(0, 10)
          .map((e, i) => ({ ...e, rank: i + 1 }));

        const resolveUsers = async (entries: typeof rawBoard): Promise<LeaderboardEntry[]> => {
          try {
            const addressesParam = entries.map((e) => e.address).join(",");
            const res = await fetch(`/api/resolve-users?addresses=${encodeURIComponent(addressesParam)}`);
            if (!res.ok) return entries.map((e) => ({ ...e, handle: `${e.address.slice(0, 6)}...${e.address.slice(-4)}` }));
            const json = await res.json();
            const usersByAddress = json?.users || {};
            return entries.map((e) => {
              const key = e.address.toLowerCase();
              const user = usersByAddress[key];
              return { ...e, handle: user?.handle || `${e.address.slice(0, 6)}...${e.address.slice(-4)}` };
            });
          } catch {
            return entries.map((e) => ({ ...e, handle: `${e.address.slice(0, 6)}...${e.address.slice(-4)}` }));
          }
        };

        const board: LeaderboardEntry[] = await resolveUsers(rawBoard);

        if (!cancelled) { setLiveLeaderboard(board); setLbUpdatedAt(Date.now()); }
      } catch {
        if (!cancelled) setLbError(true);
      } finally {
        if (!cancelled) setLbLoading(false);
      }
    };
    fetchLb();
    const intervalId = setInterval(fetchLb, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(intervalId); };
  }, [activeTab, publicClient]);

  const totalDays    = userInfoData ? Number(userInfoData[3]) : 0;
  const totalClaimed = userInfoData ? userInfoData[2] : BigInt(0);
  const faucetBal    = faucetBalData ?? BigInt(0);
  const canClaim     = canClaimData ?? false;
  const isBusy       = isWritePending || isTxLoading;

  const nextTotalDay  = totalDays + 1;
  const cycleInfo     = getCycleInfo(nextTotalDay);
  const rewardAmt     = getDailyReward(nextTotalDay);
  const isOnMile      = isMilestoneDay(nextTotalDay);
  const nextM         = getNextMilestone(totalDays);
  const { pos: cyclePos, pct: cyclePct } = getCycleProgress(totalDays);

  const mDays = Math.floor(monthSecs / 86400);
  const mHrs  = Math.floor((monthSecs % 86400) / 3600);
  const mMins = Math.floor((monthSecs % 3600) / 60);
  const mSecs = monthSecs % 60;

  const handleShareFirst = useCallback(async () => {
    const name   = userCtx?.user?.displayName || userCtx?.user?.username || "Someone";
    const reward = fmt(rewardAmt);
    const text   = nextM
      ? `Claiming ${reward} $TYSM on Day ${nextTotalDay}!\nOnly ${nextM.day - totalDays} days until Day ${nextM.day} milestone → ${fmt(nextM.reward)} $TYSM!\n\nClaim yours free every 24h:\n\n@tops87sqweez`
      : `${name} is claiming $TYSM on Day ${nextTotalDay}! Free to claim every 24 hours:\n\n@tops87sqweez`;
    const shareUrl = `${APP_URL}/share?user=${encodeURIComponent(name)}&streak=${totalDays}`;
    try {
      await miniappSdk.actions.composeCast({ text, embeds: [shareUrl] });
    } catch {
      const url = `https://farcaster.xyz/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(shareUrl)}`;
      await sdk.actions.openUrl(url);
    }
    setHasShared(true);
  }, [userCtx, rewardAmt, nextTotalDay, nextM, totalDays]);

  const handleShareAfter = useCallback(async () => {
    const name   = userCtx?.user?.displayName || userCtx?.user?.username || "Someone";
    const reward = fmt(rewardAmt);
    const text   = isOnMile
      ? `${name} hit Day ${totalDays} Milestone! Received ${reward} $TYSM! 🎁\n\nClaim yours free every 24h:\n\n@tops87sqweez`
      : `${name} claimed ${reward} $TYSM! Day ${totalDays} streak! 🔥\n\nClaim yours free every 24h:\n\n@tops87sqweez`;
    const shareUrl = `${APP_URL}/share?user=${encodeURIComponent(name)}&streak=${totalDays}`;
    try {
      await miniappSdk.actions.composeCast({ text, embeds: [shareUrl] });
    } catch {
      const url = `https://farcaster.xyz/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(shareUrl)}`;
      await sdk.actions.openUrl(url);
    }
  }, [userCtx, rewardAmt, totalDays, isOnMile]);

  const handleClaim = useCallback(() => {
    setTxError("");
    writeContract({ address: FAUCET_ADDRESS, abi: FAUCET_ABI, functionName: "claim", chainId: base.id });
  }, [writeContract]);

  if (!sdkReady) {
    return (
      <div className="min-h-screen bg-[#0d0d1a] flex flex-col items-center justify-center gap-4">
        <div className="text-6xl animate-bounce">🙏</div>
        <p className="text-yellow-400 text-sm animate-pulse tracking-widest">LOADING TYSM FAUCET...</p>
      </div>
    );
  }

  const { milestones: currentMilestones } = getCycleInfo(Math.max(totalDays, 1));
  const milestoneMarkers = [
    { pct: (7  / 30) * 100, color: "#f59e0b", label: "D7"  },
    { pct: (15 / 30) * 100, color: "#10b981", label: "D15" },
    { pct: (30 / 30) * 100, color: "#8b5cf6", label: "D30" },
  ];

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

      {/* Tab Navigation */}
      <div className="sticky top-0 z-50 bg-[#0a0a18]/95 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-sm mx-auto flex">
          {(["home", "board", "rewards"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-xs font-black tracking-widest uppercase transition-all ${activeTab === tab ? "tab-active" : "tab-inactive"}`}>
              {tab === "home" ? "🙏 Claim" : tab === "board" ? "🏆 Board" : "🎁 Rewards"}
            </button>
          ))}
        </div>
      </div>

      {/* HOME TAB */}
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
                <div key={m.pct} className="absolute top-0 h-full w-0.5"
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
                {!hasShared ? (
                  <div className="space-y-2">
                    <button onClick={handleShareFirst} className="w-full font-black py-3.5 rounded-xl text-base transition-all active:scale-95 flex items-center justify-center gap-2 text-white" style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
                      ⚡ Share First → Unlock Claim!
                    </button>
                    <p className="text-gray-600 text-[10px]">Share to unlock the Claim button 🙏</p>
                  </div>
                ) : (
                  <button onClick={handleClaim} disabled={isBusy || !isConnected} className="w-full font-black py-4 rounded-xl text-lg transition-all active:scale-95 text-white" style={{ background: isBusy || !isConnected ? "#374151" : "linear-gradient(90deg,#f59e0b,#fcd34d)" }}>
                    {isBusy ? "Processing..." : "🙏 Claim Free $TYSM"}
                  </button>
                )}
              </>
            ) : (
              <div className="py-2">
                <div className="inline-flex items-center gap-1.5 bg-gray-950 border border-gray-800 rounded-full px-3 py-1 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                  <p className="text-gray-500 text-[11px] font-bold uppercase tracking-wider">Claimed · Next in</p>
                </div>
                <p className="font-mono text-3xl font-black text-gray-400 tracking-wider mb-1">
                  {formatCountdown(countdown)}
                </p>
                <p className="text-gray-600 text-[11px] font-mono mb-2">
                  Available {nextClaimUTC(countdown)}
                </p>
                <button onClick={handleShareAfter} className="w-full font-bold py-2.5 rounded-xl text-xs bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex items-center justify-center gap-1.5 text-gray-300">
                  📢 Broadcast Your Streak
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LEADERBOARD TAB */}
      {activeTab === "board" && (
        <div className="max-w-sm mx-auto px-4 pt-4 pb-24 space-y-4">
          <div className="text-center py-2">
            <h2 className="text-2xl font-black shimmer-text">Global Leaderboard</h2>
            <p className="text-gray-500 text-[11px]">The most loyal $TYSM claimers in the ecosystem</p>
          </div>

          <div className="bg-white/4 border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-gray-300 text-xs font-bold">🏆 Community Ranks</p>
                <span className="flex items-center gap-1 bg-green-900/30 border border-green-700/30 rounded-full px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-green-400 text-[9px] font-bold">LIVE</span>
                </span>
              </div>
              <p className="text-gray-600 text-[9px]">
                {lbLoading ? "Updating..." : lbUpdatedAt > 0 ? "Updated" : ""}
              </p>
            </div>

            {lbError && (
              <div className="px-3 py-2 bg-red-950/20 border-b border-red-800/20">
                <p className="text-red-400 text-[10px] text-center">Failed to load leaderboard data.</p>
              </div>
            )}

            <div className="grid grid-cols-12 gap-1 px-3 py-1.5 border-b border-white/5">
              <p className="col-span-1 text-gray-600 text-[9px] font-bold uppercase">#</p>
              <p className="col-span-4 text-gray-600 text-[9px] font-bold uppercase">User</p>
              <p className="col-span-2 text-gray-600 text-[9px] font-bold uppercase text-center">Days</p>
              <p className="col-span-2 text-gray-600 text-[9px] font-bold uppercase text-center">Rate</p>
              <p className="col-span-3 text-gray-600 text-[9px] font-bold uppercase text-center">Shield</p>
            </div>

            {lbLoading && liveLeaderboard.length === 0 && (
              <div className="divide-y divide-white/5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1 px-3 py-2.5 items-center animate-pulse">
                    <div className="col-span-1 h-3 bg-white/10 rounded" />
                    <div className="col-span-4 h-3 bg-white/10 rounded" />
                    <div className="col-span-2 h-3 bg-white/10 rounded mx-auto w-8" />
                    <div className="col-span-2 h-3 bg-white/10 rounded mx-auto w-6" />
                    <div className="col-span-3 h-3 bg-white/10 rounded mx-auto w-8" />
                  </div>
                ))}
              </div>
            )}

            {!lbLoading && liveLeaderboard.length === 0 && !lbError && (
              <div className="px-3 py-8 text-center">
                <p className="text-gray-600 text-xs">No claimers found yet</p>
                <p className="text-gray-700 text-[10px] mt-1">Be the first to claim!</p>
              </div>
            )}

            {liveLeaderboard.length > 0 && (
              <div className="divide-y divide-white/5">
                {liveLeaderboard.map((row) => {
                  const ci        = getCycleInfo(row.totalDays);
                  const rankColor =
                    row.rank === 1 ? "#f59e0b"
                    : row.rank === 2 ? "#9ca3af"
                    : row.rank === 3 ? "#d97706"
                    : "#4b5563";
                  return (
                    <div key={row.address}
                      className="grid grid-cols-12 gap-1 px-3 py-2.5 items-center transition-colors hover:bg-white/3">
                      <p className="col-span-1 font-black text-sm" style={{ color: rankColor }}>
                        {row.rank <= 3 ? ["🥇", "🥈", "🥉"][row.rank - 1] : row.rank}
                      </p>
                      <div className="col-span-4 flex items-center gap-1 min-w-0">
                        <p className="text-gray-300 text-[11px] font-medium truncate">{row.handle}</p>
                        <CycleBadge cycle={ci.cycle} />
                      </div>
                      <p className="col-span-2 text-yellow-400 font-black text-[11px] text-center">{row.totalDays}🔥</p>
                      <p className="col-span-2 text-green-400 text-[10px] font-bold text-center">
                        {(ci.baseRate / 1000).toFixed(0)}K
                      </p>
                      <div className="col-span-3 flex justify-center">
                        <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5"
                          style={{ color: heartColor(row.hearts), background: heartBg(row.hearts), border: `1px solid ${heartColor(row.hearts)}40` }}>
                          {row.hearts}/3
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="px-3 py-2 border-t border-white/5">
              <p className="text-gray-700 text-[9px] text-center">
                Refreshed on tab open · Sorted by Total Days claimed
              </p>
            </div>
          </div>
        </div>
      )}

      {/* REWARDS TAB */}
      {activeTab === "rewards" && (
        <div className="max-w-sm mx-auto px-4 pt-4 pb-8 space-y-4">

          {/* Monthly Lucky Draw Banner */}
          <div style={{
            background: "linear-gradient(135deg,#92400e 0%,#78350f 50%,#451a03 100%)",
            border: "1px solid rgba(245,158,11,0.55)",
            boxShadow: "0 0 24px rgba(245,158,11,0.12)"
          }} className="rounded-2xl p-4 space-y-3">
            <p className="text-center text-base font-black text-yellow-300 leading-snug">
              🎁 TYSM Daily Faucet<br/>Monthly Rewards! 🎁
            </p>
            <p className="text-center text-yellow-100/75 text-xs leading-relaxed">
              To celebrate, I'm launching a special lucky draw at the end of this month for{" "}
              <span className="text-yellow-300 font-bold">3 lucky users!</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="prize-gold rounded-xl p-2.5 text-center">
                <p className="text-xl">🥇</p>
                <p className="text-yellow-300 font-black text-sm mt-0.5">$3.5</p>
                <p className="text-yellow-600 text-[10px]">1st Prize</p>
              </div>
              <div className="prize-silver rounded-xl p-2.5 text-center">
                <p className="text-xl">🥈</p>
                <p className="text-gray-200 font-black text-sm mt-0.5">$2.5</p>
                <p className="text-gray-500 text-[10px]">2nd Prize</p>
              </div>
              <div className="prize-bronze rounded-xl p-2.5 text-center">
                <p className="text-xl">🥉</p>
                <p className="text-orange-300 font-black text-sm mt-0.5">$1.0</p>
                <p className="text-orange-600 text-[10px]">3rd Prize</p>
              </div>
            </div>
            <p className="text-center text-yellow-700 text-[10px]">Winner drawn at end of month · Must have claimed at least once</p>
          </div>

          {/* Reward Structure */}
          <div>
            <h3 className="text-center text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Daily Reward Structure</h3>
            <div className="space-y-3">

              {/* Cycle 1 */}
              <div className="bg-white/4 border border-yellow-500/25 rounded-2xl overflow-hidden">
                <div className="bg-yellow-500/10 px-3 py-2.5 flex items-center justify-between">
                  <span className="text-yellow-400 font-black text-xs">🥉 Cycle 1 · Days 1–30</span>
                  <span className="text-yellow-300 font-bold text-xs">2,000 / day</span>
                </div>
                <div className="divide-y divide-white/5">
                  {[
                    { day: 7,  label: "🔥 Week 1",     bonus: "+10K" },
                    { day: 15, label: "🌟 Mid Month",  bonus: "+40K" },
                    { day: 30, label: "👑 Full Month",  bonus: "+90K" },
                  ].map(m => (
                    <div key={m.day} className="grid grid-cols-3 px-3 py-2 text-[11px]">
                      <span className="text-gray-500">Day {m.day}</span>
                      <span className="text-gray-300 text-center">{m.label}</span>
                      <span className="text-green-400 font-bold text-right">{m.bonus}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cycle 2 */}
              <div className="bg-white/4 border border-gray-400/25 rounded-2xl overflow-hidden">
                <div className="bg-gray-400/10 px-3 py-2.5 flex items-center justify-between">
                  <span className="text-gray-300 font-black text-xs">🥈 Cycle 2 · Days 31–60</span>
                  <span className="text-emerald-300 font-bold text-xs">5,000 / day</span>
                </div>
                <div className="divide-y divide-white/5">
                  {[
                    { day: 37, label: "🔥 Week 1",     bonus: "+20K"  },
                    { day: 45, label: "🌟 Mid Month",  bonus: "+80K"  },
                    { day: 60, label: "👑 Full Month",  bonus: "+180K" },
                  ].map(m => (
                    <div key={m.day} className="grid grid-cols-3 px-3 py-2 text-[11px]">
                      <span className="text-gray-500">Day {m.day}</span>
                      <span className="text-gray-300 text-center">{m.label}</span>
                      <span className="text-green-400 font-bold text-right">{m.bonus}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cycle 3 */}
              <div className="bg-white/4 border border-purple-400/25 rounded-2xl overflow-hidden">
                <div className="bg-purple-400/10 px-3 py-2.5 flex items-center justify-between">
                  <span className="text-purple-300 font-black text-xs">🥇👑 Cycle 3 · Days 61+</span>
                  <span className="text-purple-300 font-bold text-xs">10,000 / day</span>
                </div>
                <div className="divide-y divide-white/5">
                  {[
                    { day: 67, label: "🔥 Week 1",     bonus: "+20K"  },
                    { day: 75, label: "🌟 Mid Month",  bonus: "+80K"  },
                    { day: 90, label: "👑 Full Month",  bonus: "+180K" },
                  ].map(m => (
                    <div key={m.day} className="grid grid-cols-3 px-3 py-2 text-[11px]">
                      <span className="text-gray-500">Day {m.day}</span>
                      <span className="text-gray-300 text-center">{m.label}</span>
                      <span className="text-green-400 font-bold text-right">{m.bonus}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
            <p className="text-gray-700 text-[9px] text-center mt-3">Infinite progression · No resets · Keep claiming every day!</p>
          </div>

        </div>
      )}

      {/* Frozen "Your Status" row at bottom of leaderboard */}
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
              <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5"
                style={{ color: heartColor(hearts), background: heartBg(hearts), border: `1px solid ${heartColor(hearts)}40` }}>
                {hearts}/3
              </span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
