"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import { formatUnits, parseAbiItem, decodeEventLog } from "viem";
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

const TYSM_TOKEN_ADDRESS =
  "0x0358795322c04de04ead2338a803a9d3518a9877" as `0x${string}`;

type ClaimHistoryItem = {
  txHash: `0x${string}`;
  wallet: string;
  claimedDay: number;
  expectedReward: number;
  actualReward?: string;
  createdAt: string;
};

function claimHistoryKey(wallet?: string) {
  return wallet ? `tysm_claim_history_${wallet.toLowerCase()}` : "tysm_claim_history";
}

function loadClaimHistory(wallet?: string): ClaimHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(claimHistoryKey(wallet)) || "[]");
  } catch {
    return [];
  }
}

function saveClaimHistory(wallet: string | undefined, item: ClaimHistoryItem) {
  if (!wallet || typeof window === "undefined") return;
  const prev = loadClaimHistory(wallet);
  const next = [item, ...prev.filter((x) => x.txHash !== item.txHash)].slice(0, 10);

  localStorage.setItem(claimHistoryKey(wallet), JSON.stringify(next));
}

const REFERRAL_ADDRESS = (import.meta.env.VITE_REFERRAL_CONTRACT_ADDRESS || ZERO_ADDR) as `0x${string}`;
const referralReady = REFERRAL_ADDRESS !== ZERO_ADDR;

const REFERRAL_ABI = [
  { name: "pendingRewards", type: "function", stateMutability: "view",
    inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "referralCount",  type: "function", stateMutability: "view",
    inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "claimRewards",   type: "function", stateMutability: "nonpayable",
    inputs: [], outputs: [] },
  { name: "poolBalance",    type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
  { name: "isReferred",    
    type: "function", stateMutability: "view",
    inputs: [{ name: "", type: "address" }], outputs: [{ type: "bool" }] },
] as const;

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
      cycle: 2, cycleDay: totalDays - 30, baseRate: 2000,
      cycleLabel: "Cycle 2",
      milestones: [
        { day: 37, reward: 20000,  cycleDay: 7  },
        { day: 45, reward: 80000,  cycleDay: 15 },
        { day: 60, reward: 180000, cycleDay: 30 },
      ],
    };
  } else {
    return {
      cycle: 3, cycleDay: totalDays - 60, baseRate: 2000,
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
  const [notifEnabled,    setNotifEnabled]    = useState(false);
  const [copied,          setCopied]          = useState(false);
  const [lbRetryKey,      setLbRetryKey]      = useState(0);
  const [lbPage,          setLbPage]          = useState(1);
  const [refCount,        setRefCount]        = useState<number | null>(null);
  const [refLoading,      setRefLoading]      = useState(false);
  const [refCopied,       setRefCopied]       = useState(false);
  // UX-only: warns if the connected wallet differs from the last wallet seen
  // for this Farcaster FID.
  // Purely informational — never affects claim
  // eligibility, cooldown, or countdown, which always read the on-chain
  // contract with the currently connected wagmi address.
  const [fidWalletMismatch, setFidWalletMismatch] = useState<string | null>(null);

  const [claimHistory, setClaimHistory] = useState<ClaimHistoryItem[]>([]);
  const [lastClaim, setLastClaim] = useState<ClaimHistoryItem | null>(null);
  const processedClaimTxRef = useRef<`0x${string}` | null>(null);

  const { address, isConnected } = useAccount();
  useEffect(() => {
    if (!address) return;
    setClaimHistory(loadClaimHistory(address));
  }, [address]);
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
  const {
    data: txReceipt,
    isLoading: isTxLoading,
    isSuccess: isTxSuccess,
  } = useWaitForTransactionReceipt({ hash: txHash });
  const refBaseQ = { query: { enabled: referralReady && !!address } };
  const { data: pendingRefData, refetch: refetchPendingRef } = useReadContract({
    address: REFERRAL_ADDRESS, abi: REFERRAL_ABI, functionName: "pendingRewards",
    args: [address!], ...refBaseQ,
  });
  const { writeContract: writeRefClaim, data: refClaimHash, isPending: isRefClaimPending } = useWriteContract();
  const { isLoading: isRefClaimLoading, isSuccess: isRefClaimSuccess } = useWaitForTransactionReceipt({ hash: refClaimHash });
  useEffect(() => { if (isRefClaimSuccess) refetchPendingRef(); }, [isRefClaimSuccess, refetchPendingRef]);

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
  const totalDays    = userInfoData ? Number(userInfoData[3]) : 0;
  const totalClaimed = userInfoData ? userInfoData[2] : BigInt(0);
  const faucetBal    = faucetBalData ?? BigInt(0);
  const canClaim     = canClaimData ?? false;
  const isBusy         = isWritePending || isTxLoading;
  const globalClaims   = totalClaimsData ? Number(totalClaimsData) : 0;
  const faucetLow = contractReady && faucetBal > 0n && faucetBal < BigInt("100000000000000000000000");
  // 100,000 TYSM

  const nextTotalDay  = totalDays + 1;
  const cycleInfo     = getCycleInfo(nextTotalDay);
  const rewardAmt     = getDailyReward(nextTotalDay);
  const isOnMile      = isMilestoneDay(nextTotalDay);
  const nextM         = getNextMilestone(totalDays);
  const { pos: cyclePos, pct: cyclePct } = getCycleProgress(totalDays);

  useEffect(() => {
    if (!isTxSuccess || !txHash) return;
    if (processedClaimTxRef.current === txHash) return;

    processedClaimTxRef.current = txHash;

    setJustClaimed(true);
    setHasShared(false);

    let actualReward: string | undefined;

    try {
      const transferEvent = parseAbiItem(
        "event Transfer(address indexed from, address indexed to, uint256 value)"
      );

      const transferLog = txReceipt?.logs.find((log) => {
        if (log.address.toLowerCase() !== TYSM_TOKEN_ADDRESS.toLowerCase()) return false;

        try {
          const decoded = decodeEventLog({
            abi: [transferEvent],
            data: log.data,
            topics: log.topics,
          });

          const from = String(decoded.args.from).toLowerCase();
          const to = String(decoded.args.to).toLowerCase();

          return (
            from === FAUCET_ADDRESS.toLowerCase() &&
            !!address &&
            to === address.toLowerCase()
          );
        } catch {
          return false;
        }
      });

      if (transferLog) {
        const decoded = decodeEventLog({
          abi: [transferEvent],
          data: transferLog.data,
          topics: transferLog.topics,
        });
        actualReward = formatUnits(decoded.args.value as bigint, 18);
      }
    } catch {
      actualReward = undefined;
    }

    const item: ClaimHistoryItem = {
      txHash,
      wallet: address || "",
      claimedDay: nextTotalDay,
      expectedReward: rewardAmt,
      actualReward,
      createdAt: new Date().toISOString(),
    };
    setLastClaim(item);

    if (address) {
      saveClaimHistory(address, item);
      setClaimHistory(loadClaimHistory(address));
    }

    refetchCanClaim();
    refetchTimeLeft();
    refetchUserInfo();
    refetchBalance();
  }, [
    isTxSuccess,
    txHash,
    txReceipt,
    address,
    nextTotalDay,
    rewardAmt,
    refetchCanClaim,
    refetchTimeLeft,
    refetchUserInfo,
    refetchBalance,
  ]);
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
              if (addresses.length >= 100) break;
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
          .slice(0, 100)
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

        if (!cancelled) { setLiveLeaderboard(board); setLbUpdatedAt(Date.now()); setLbPage(1); }
      } catch {
        if (!cancelled) setLbError(true);
      } finally {
        if (!cancelled) setLbLoading(false);
      }
    };
    fetchLb();
    const intervalId = setInterval(fetchLb, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(intervalId); };
  }, [activeTab, publicClient, lbRetryKey]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (ref && /^0x[a-fA-F0-9]{40}$/.test(ref)) {
        localStorage.setItem("tysm_ref", ref.toLowerCase());
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (!address) return;
    try {
      const referrer = localStorage.getItem("tysm_ref");
      if (!referrer || referrer === address.toLowerCase()) return;
      if (!/^0x[a-fA-F0-9]{40}$/.test(referrer)) {
        localStorage.removeItem("tysm_ref");
        return;
      }
      fetch("/api/referral-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referrer, referee: address.toLowerCase() }),
      })
        .then(async (r) => {
          if (r.ok) localStorage.removeItem("tysm_ref");
        })
        .catch(() => { /* keep localStorage so it retries on next mount */ });
    } catch { /* ignore */ }
  }, [address]);
  useEffect(() => {
    if (activeTab !== "rewards" || !address) return;
    setRefLoading(true);
    fetch(`/api/referral-stats?address=${encodeURIComponent(address.toLowerCase())}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setRefCount(d.count); })
      .catch(() => {})
      .finally(() => setRefLoading(false));
  }, [activeTab, address]);
  const myRank         = address ? liveLeaderboard.find(e => e.address.toLowerCase() === address.toLowerCase())?.rank : undefined;
  const mDays = Math.floor(monthSecs / 86400);
  const mHrs  = Math.floor((monthSecs % 86400) / 3600);
  const mMins = Math.floor((monthSecs % 3600) / 60);
  const mSecs = monthSecs % 60;
  const handleShareFirst = useCallback(async () => {
    const name   = userCtx?.user?.displayName || userCtx?.user?.username || "Someone";
    const reward = fmt(rewardAmt);
    const text   = nextM
      ? `Claiming ${reward} $TYSM on Day ${nextTotalDay}!\nOnly ${nextM.day - totalDays} days until Day ${nextM.day} milestone → ${fmt(nextM.reward)} $TYSM!\n\nClaim yours free every 24h:\n\n@tops87sqweezz.base.eth`
      : `${name} is claiming $TYSM on Day ${nextTotalDay}! Free to claim every 24 hours:\n\n@tops87sqweezz.base.eth`;
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
      ? `${name} hit Day ${totalDays} Milestone! Received ${reward} $TYSM! 🎁\n\nClaim yours free every 24h:\n\n@tops87sqweezz.base.eth`
      : `${name} claimed ${reward} $TYSM! Day ${totalDays} streak! 🔥\n\nClaim yours free every 24h:\n\n@tops87sqweezz.base.eth`;
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
    
    const builderCapabilities = {
      dataSuffix: {
        value: "0x62635f7034696b386d38620b0080218021802180218021802180218021" as `0x${string}`,
        optional: true
      }
    };

    try {
      if (typeof writeContract === 'function') {
        writeContract({
          address: FAUCET_ADDRESS,
          abi: FAUCET_ABI,
          functionName: "claim",
          chainId: base.id,
          ...({ capabilities: builderCapabilities } as any)
        });
      }
    } catch (err) {
      console.error("Claim error:", err);
      setTxError("Transaction failed. Please try again.");
    }
  }, [writeContract]);
  const handleEnableNotif = useCallback(async () => {
    try {
      await miniappSdk.actions.addFrame();
      setNotifEnabled(true);
    } catch { /* not in miniapp context */ }
  }, []);
  const handleCopyReferral = useCallback(() => {
    const link = address ? `${APP_URL}?ref=${address}` : APP_URL;
    navigator.clipboard.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [address]);
  const handleCopyRefLink = useCallback(() => {
    const link = address ? `${APP_URL}?ref=${address}` : APP_URL;
    navigator.clipboard.writeText(link).catch(() => {});
    setRefCopied(true);
    setTimeout(() => setRefCopied(false), 2500);
  }, [address]);
  // UX-only: FID <-> wallet helper mapping. Never used for claim eligibility,
  // cooldown, or countdown — those always come from the contract reads above,
  // keyed by the currently connected wagmi `address`.
  // This effect only:
  //   1) looks up the last wallet seen for this FID, to show an informational
  //      banner if it differs from the wallet connected right now
  //   2) records the current (fid, wallet) pair for next time
  // Any failure here (network, Redis down) is swallowed silently — the app
  // must keep working normally regardless.
  useEffect(() => {
    const fid = userCtx?.user?.fid;
    if (!address || !fid || !Number.isInteger(fid) || fid <= 0) {
      setFidWalletMismatch(null);
      return;
    }

    const currentWallet = address.toLowerCase();
    let cancelled = false;

    fetch(`/api/fid-wallet?fid=${encodeURIComponent(fid)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { wallet?: string | null } | null) => {
        if (cancelled || !d) return;
        const lastWallet = d.wallet ? d.wallet.toLowerCase() : null;
        if (lastWallet && lastWallet !== currentWallet) {
          setFidWalletMismatch(lastWallet);
        } else {
          setFidWalletMismatch(null);
        }
      })
      .catch(() => { /* fail soft — never block the UI */ })
      .finally(() => {
        // Best-effort: record current pairing. Only fires once we have a
        // valid fid AND a valid connected address (constraint #8).
        fetch("/api/fid-wallet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fid, wallet: currentWallet }),
        }).catch(() => { /* fail soft */ });
      });

    return () => { cancelled = true; };
  }, [address, userCtx?.user?.fid]);

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

      {activeTab === "home" && (
        <div className="max-w-sm mx-auto px-4 pt-5 pb-8 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {userCtx?.user?.pfpUrl ? (
                <img src={userCtx.user.pfpUrl} alt="pfp" className="w-10 h-10 rounded-full border-2 border-yellow-500/40 object-cover" />
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

          {/* Informational only — never affects claim eligibility/cooldown/countdown */}
          {fidWalletMismatch && (
            <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl px-3 py-2 flex items-start gap-2">
              <span className="text-sm leading-none mt-0.5">⚠️</span>
              <p className="text-amber-300/90 text-[10.5px] leading-snug">
                You previously connected a different wallet ({fidWalletMismatch.slice(0, 6)}...{fidWalletMismatch.slice(-4)}).
                Streak and cooldown always follow the wallet you're connected with now.
              </p>
            </div>
          )}

          <div className="text-center py-1">
            <div className="text-5xl mb-1" style={{ animation: "float 3s ease-in-out infinite" }}>🙏</div>
            <h1 className="text-5xl font-black leading-none mb-0.5 shimmer-text">$TYSM</h1>
            <p className="text-gray-500 text-[10px] tracking-[0.4em] uppercase">Daily Faucet · by tops87</p>
          </div>

          <div className="flex items-center justify-center gap-2">
            <CycleBadge cycle={cycleInfo.cycle} />
            <p className="text-gray-500 text-[11px]">
              {cycleInfo.cycle === 1 ? "Base: 2,000 $TYSM/day" : cycleInfo.cycle === 2 ? "Cycle 2: Daily 2,000 + bigger milestone bonuses" : "Cycle 3+: Daily 2,000 + maximum milestone bonuses"}
            </p>
          </div>

          <div className="bg-white/4 border border-white/5 rounded-2xl p-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" style={{ animation: "glow 2s infinite" }} />
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-0.5">Next Claim Value</p>
                <div className="flex items-baseline gap-1.5">
                  <span className={`font-black text-3xl text-yellow-400 ${isOnMile ? "shimmer-text mile-pulse" : ""}`}>
                    {fmt(rewardAmt)}
                  </span>
                  <span className="text-gray-500 text-xs font-bold">$TYSM</span>
                  {isOnMile && (
                    <span className="ml-1 text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-md font-black uppercase tracking-wider animate-pulse">
                      Milestone 🎁
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-0.5">Cycle Progress</p>
                <p className="text-white font-black text-sm">{cyclePos}<span className="text-gray-600 font-normal text-xs">/30d</span></p>
              </div>
            </div>

            <div className="relative pt-2 pb-1">
              <div className="h-2 w-full bg-white/5 rounded-full overflow-visible relative">
                <div className="h-full bg-gradient-to-r from-yellow-500 to-amber-500 rounded-full transition-all duration-500 relative" style={{ width: `${cyclePct}%` }}>
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-yellow-300 rounded-full shadow-[0_0_8px_#f59e0b] scale-110" />
                </div>
                {milestoneMarkers.map((m, idx) => {
                  const isHit = cyclePos >= parseFloat(m.label.replace("D",""));
                  return (
                    <div key={idx} className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: `${m.pct}%` }}>
                      <div className="w-1.5 h-1.5 rounded-full border transition-all" style={{ backgroundColor: isHit ? m.color : "#1f2937", borderColor: m.color }} />
                      <span className="text-[8px] font-black mt-3 transition-colors" style={{ color: isHit ? m.color : "#4b5563" }}>
                        {m.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {nextM && (
              <p className="text-gray-600 text-[10px] text-center mt-5">
                Next Milestone: <span className="text-yellow-500/90 font-bold">Day {nextM.day}</span> → <span className="text-yellow-400 font-bold">+{fmt(nextM.reward)} $TYSM</span> bonus!
              </p>
            )}
          </div>

          <div className="space-y-2.5 pt-1">
            {!isConnected ? (
              <button disabled className="w-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold py-3.5 px-4 rounded-xl text-xs uppercase tracking-widest animate-pulse">
                🔑 WALLET CONNECTING VIA FRAME...
              </button>
            ) : canClaim ? (
              justClaimed && !hasShared ? (
                <button onClick={handleShareFirst} className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-black font-black py-4 px-4 rounded-xl text-xs uppercase tracking-widest shadow-[0_4px_20px_rgba(245,158,11,0.25)] transition-all transform hover:-translate-y-0.5 active:translate-y-0">
                  📢 Cast to Verify & Unlock Claim
                </button>
              ) : (
                <button onClick={handleClaim} disabled={isBusy}
                  className="w-full bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-400 text-black font-black py-4 px-4 rounded-xl text-xs uppercase tracking-widest shadow-[0_4px_20px_rgba(234,179,8,0.3)] transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none" style={{ backgroundSize: '200% auto', animation: 'shimmer 3s linear infinite' }}>
                  {isWritePending ? "✍️ APPROVE IN WALLET..." : isTxLoading ? "⏳ MINING TRANSACTION..." : "🙏 CLAIM DAILY $TYSM"}
                </button>
              )
            ) : (
              <div className="bg-white/4 border border-white/5 rounded-xl p-3.5 text-center">
                <p className="text-gray-500 text-[10px] uppercase tracking-widest mb-1">Cooldown Active</p>
                <p className="text-2xl font-black text-gray-300 tracking-wider font-mono">
                  {countdown > 0 ? formatCountdown(countdown) : "00:00:00"}
                </p>
                <p className="text-gray-600 text-[10px] mt-1.5">
                  Next claim available at <span className="text-gray-400 font-medium">{countdown > 0 ? nextClaimUTC(countdown) : "—"}</span>
                </p>
                {justClaimed && (
                  <button onClick={handleShareAfter} className="mt-3 inline-flex items-center gap-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-yellow-400/90 font-bold text-[11px] py-1.5 px-3 rounded-lg transition-all">
                    <span>📢 Share Streak Cast</span>
                  </button>
                )}
              </div>
            )}

            {txError && (
              <div className="bg-red-950/30 border border-red-500/20 text-red-400 text-[11px] font-medium py-2.5 px-3 rounded-xl text-center animate-shake">
                ❌ {txError}
              </div>
            )}
          </div>

          {lastClaim && (
            <div className="bg-green-950/20 border border-green-500/20 rounded-xl p-3 text-center animate-fadeIn">
              <p className="text-green-400 font-black text-xs uppercase tracking-wider mb-1">🎉 Claim Successful!</p>
              <p className="text-gray-400 text-[10px] leading-relaxed">
                Day {lastClaim.claimedDay} streak registered. Received{" "}
                <span className="text-yellow-400 font-bold">
                  {lastClaim.actualReward ? parseFloat(lastClaim.actualReward).toLocaleString("en-US") : fmt(lastClaim.expectedReward)}
                </span>{" "}
                $TYSM.
              </p>
              <div className="mt-2 flex items-center justify-center gap-3 text-[10px]">
                <a href={`https://basescan.org/tx/${lastClaim.txHash}`} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-300 underline font-medium">
                  View on BaseScan ↗
                </a>
                <button onClick={() => { navigator.clipboard.writeText(lastClaim.txHash).catch(()=>{}); alert("Tx Hash copied!"); }} className="text-gray-500 hover:text-gray-300 underline font-medium">
                  Copy Tx
                </button>
              </div>
            </div>
          )}

          {/* Referral Card */}
          <div className="bg-gradient-to-b from-purple-950/10 to-transparent border border-purple-500/10 rounded-2xl p-4 mt-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">🔗</span>
                <h3 className="text-purple-300 font-black text-xs uppercase tracking-wider">Referral Program</h3>
              </div>
              <span className="text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">
                +10% Bonus
              </span>
            </div>
            <p className="text-gray-500 text-[11px] leading-normal mb-3">
              Earn an extra <span className="text-purple-300 font-bold">10%</span> of all daily claims made by users you invite. Directly deposited to your pending rewards pool.
            </p>
            <div className="flex gap-2">
              <button onClick={handleCopyReferral} className="flex-1 bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 text-purple-300 font-bold py-2.5 px-3 rounded-xl text-[11px] transition-all truncate">
                {copied ? "✅ Link Copied!" : "📋 Copy My Invite Link"}
              </button>
            </div>
          </div>

          <div className="bg-white/4 border border-white/5 rounded-2xl p-3.5 space-y-2">
            <div className="flex justify-between text-[11px] text-gray-500 border-b border-white/5 pb-2">
              <span className="font-medium">Total Global Claims</span>
              <span className="text-gray-300 font-bold font-mono">{globalClaims > 0 ? fmt(globalClaims) : "—"}</span>
            </div>
            <div className="flex justify-between text-[11px] text-gray-500 pt-0.5">
              <span className="font-medium">Faucet Contract Balance</span>
              <span className={`font-mono font-bold ${faucetLow ? "text-red-400 animate-pulse" : "text-gray-300"}`}>
                {contractReady ? `${formatAmount(faucetBal)} TYSM` : "—"}
              </span>
            </div>
            {faucetLow && (
              <p className="text-[9.5px] text-red-400/90 text-center bg-red-950/20 border border-red-500/10 py-1 px-2 rounded-lg leading-tight mt-1 animate-pulse">
                ⚠️ Faucet balance is running low. Claims may fail if it empties before refill.
              </p>
            )}
          </div>

          {claimHistory.length > 0 && (
            <div className="pt-2">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 pl-1">Your Recent Claims</h3>
              <div className="bg-white/4 border border-white/5 rounded-2xl overflow-hidden divide-y divide-white/5">
                {claimHistory.map((h, i) => (
                  <div key={i} className="px-3.5 py-2.5 flex items-center justify-between text-[11px]">
                    <div>
                      <p className="text-gray-300 font-bold">Day {h.claimedDay}</p>
                      <p className="text-gray-600 text-[9.5px] font-mono mt-0.5">
                        {h.txHash.slice(0, 6)}...{h.txHash.slice(-4)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-yellow-400 font-black">
                        +{h.actualReward ? parseFloat(h.actualReward).toLocaleString("en-US") : fmt(h.expectedReward)}
                      </p>
                      <p className="text-gray-600 text-[9px] mt-0.5">
                        {new Date(h.createdAt).toLocaleDateString("en-US", { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-center pt-4">
            <button onClick={handleEnableNotif} disabled={notifEnabled}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold text-gray-600 hover:text-gray-400 transition-all disabled:opacity-40 disabled:pointer-events-none">
              <span>{notifEnabled ? "🔔 Notifications Enabled" : "🔔 Enable Reminders (Add Frame)"}</span>
            </button>
          </div>
        </div>
      )}

      {activeTab === "board" && (
        <div className="max-w-sm mx-auto px-4 pt-5 pb-24">
          <div className="text-center mb-5">
            <h2 className="text-xl font-black text-yellow-400 tracking-wide">STREAK LEADERBOARD</h2>
            <p className="text-gray-500 text-[10px] uppercase tracking-widest mt-0.5">Top 100 Longest Active Claimers</p>
          </div>

          <div className="bg-white/4 border border-white/5 rounded-2xl overflow-hidden">
            <div className="bg-white/5 px-4 py-2.5 grid grid-cols-12 gap-1 text-[10px] font-black tracking-widest text-gray-500 uppercase border-b border-white/5">
              <span className="col-span-2">Rank</span>
              <span className="col-span-5">User</span>
              <span className="col-span-2 text-center">Days</span>
              <span className="col-span-3 text-right">Streak</span>
            </div>

            {lbLoading && liveLeaderboard.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-gray-500 text-xs tracking-wider animate-pulse">READING CONTRACT STATE...</p>
              </div>
            ) : lbError && liveLeaderboard.length === 0 ? (
              <div className="py-12 text-center px-4">
                <p className="text-red-400 text-xs font-medium">Failed to fetch leaderboard data.</p>
                <button onClick={() => setLbRetryKey(k => k + 1)} className="mt-3 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 font-bold text-xs py-1.5 px-3 rounded-xl transition-all">
                  🔄 Retry Load
                </button>
              </div>
            ) : liveLeaderboard.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-gray-500 text-xs">No active claims found on-chain yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {liveLeaderboard.slice((lbPage - 1) * 20, lbPage * 20).map((e) => {
                  const isMe = address && e.address.toLowerCase() === address.toLowerCase();
                  const pzClass = e.rank === 1 ? "prize-gold" : e.rank === 2 ? "prize-silver" : e.rank === 3 ? "prize-bronze" : "";
                  return (
                    <div key={e.rank} className={`px-4 py-3 grid grid-cols-12 gap-1 items-center text-xs transition-colors ${isMe ? "bg-yellow-500/10" : "hover:bg-white/2"}`}>
                      <div className="col-span-2 flex items-center">
                        {e.rank <= 3 ? (
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center font-black text-[10px] text-yellow-100 shadow-sm ${pzClass}`}>
                            {e.rank}
                          </span>
                        ) : (
                          <span className="text-gray-500 font-mono pl-1">{e.rank}</span>
                        )}
                      </div>
                      <div className="col-span-5 truncate pr-2">
                        <span className={`font-bold block truncate ${isMe ? "text-yellow-400 font-black" : "text-gray-200"}`}>
                          {e.handle.startsWith("@") ? e.handle : e.handle}
                        </span>
                      </div>
                      <div className="col-span-2 text-center font-black text-gray-300 font-mono">
                        {e.totalDays}
                      </div>
                      <div className="col-span-3 text-right font-bold text-gray-400 font-mono">
                        {e.streak}d 🔥
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {liveLeaderboard.length > 20 && (
            <div className="flex items-center justify-between mt-4 px-1">
              <button disabled={lbPage === 1} onClick={() => setLbPage(p => p - 1)} className="bg-white/4 border border-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-gray-300 text-xs font-bold py-1.5 px-3 rounded-xl transition-all">
                ← Previous
              </button>
              <span className="text-[11px] text-gray-500 font-medium">Page {lbPage} of {Math.ceil(liveLeaderboard.length / 20)}</span>
              <button disabled={lbPage >= Math.ceil(liveLeaderboard.length / 20)} onClick={() => setLbPage(p => p + 1)} className="bg-white/4 border border-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-gray-300 text-xs font-bold py-1.5 px-3 rounded-xl transition-all">
                Next →
              </button>
            </div>
          )}

          {lbUpdatedAt > 0 && (
            <div className="text-center mt-5 flex items-center justify-center gap-2">
              <p className="text-[9.5px] text-gray-600 font-medium">
                Updated: {new Date(lbUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <button onClick={() => setLbRetryKey(k => k + 1)} disabled={lbLoading} className="text-[9.5px] text-yellow-500/80 hover:text-yellow-400 underline font-bold transition-all disabled:opacity-40">
                {lbLoading ? "Refreshing..." : "Refresh Now"}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === "rewards" && (
        <div className="max-w-sm mx-auto px-4 pt-5 pb-8 space-y-4">
          <div className="text-center mb-1">
            <h2 className="text-xl font-black text-purple-400 tracking-wide">REWARDS HUB</h2>
            <p className="text-gray-500 text-[10px] uppercase tracking-widest mt-0.5">Bonus Pools & Ecosystem Milestones</p>
          </div>

          {/* Referral Reward Claims */}
          <div className="bg-white/4 border border-white/5 rounded-2xl p-4 relative overflow-hidden">
            <p className="text-gray-500 text-[9px] uppercase tracking-widest font-black mb-0.5">Referral Earnings Pool</p>
            <div className="flex justify-between items-baseline mb-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-purple-400">
                  {pendingRefData ? formatAmount(pendingRefData) : "0"}
                </span>
                <span className="text-gray-500 text-xs font-bold">$TYSM</span>
              </div>
              <div className="text-right">
                <p className="text-gray-500 text-[9px] uppercase tracking-widest mb-0.5">Total Invited</p>
                <p className="text-white font-black text-sm">
                  {refLoading ? "..." : refCount !== null ? `${refCount} users` : "—"}
                </p>
              </div>
            </div>

            <div className="pt-1.5">
              <button onClick={() => writeRefClaim?.({ address: REFERRAL_ADDRESS, abi: REFERRAL_ABI, functionName: "claimRewards", chainId: base.id })} disabled={isRefClaimPending || isRefClaimLoading || !pendingRefData || pendingRefData === 0n}
                className="w-full bg-purple-500 hover:bg-purple-600 text-white font-black py-3 px-4 rounded-xl text-xs uppercase tracking-widest transition-all disabled:opacity-40 disabled:pointer-events-none shadow-[0_4px_12px_rgba(139,92,246,0.15)]">
                {isRefClaimPending ? "✍️ APPROVE IN WALLET..." : isRefClaimLoading ? "⏳ CLAIMING REWARDS..." : "🎁 CLAIM REFERRAL BALANCE"}
              </button>
            </div>

            <div className="mt-3.5 pt-3 border-t border-white/5 flex flex-col gap-1.5">
              <p className="text-gray-500 text-[10px] leading-normal">
                Your unique invitation link for tracking and rewards:
              </p>
              <button onClick={handleCopyRefLink} className="w-full bg-white/5 border border-white/5 hover:bg-white/10 text-purple-300 font-mono text-[10px] py-2 px-3 rounded-lg transition-all text-left truncate flex items-center justify-between">
                <span className="truncate">{address ? `${APP_URL}?ref=${address.slice(0,6)}...` : APP_URL}</span>
                <span className="text-purple-400 font-bold uppercase text-[9px] ml-2 shrink-0">
                  {refCopied ? "Copied!" : "Copy"}
                </span>
              </button>
            </div>
          </div>

          {/* Detailed Program Structure */}
          <div className="space-y-2.5">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1">Program Details</h3>

            <div className="bg-white/4 border border-white/5 rounded-2xl p-3.5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-xs font-bold text-yellow-400 shrink-0 mt-0.5">📅</div>
                <div>
                  <h4 className="text-white font-black text-xs">Daily Reward Structure</h4>
                  <p className="text-gray-500 text-[11px] leading-normal mt-0.5">
                    Standard rate of <span className="text-yellow-400/90 font-bold">2,000 $TYSM</span> per day. Milestone multipliers unlock automatically at set day counts within your 30-day cycle.
                  </p>
                </div>
              </div>

              <div className="border-t border-white/5 pt-3 flex items-start gap-3">
                <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-400 shrink-0 mt-0.5">🔥</div>
                <div>
                  <h4 className="text-white font-black text-xs">Special Loyalty Bonus Pool · Planned</h4>
                  <p className="text-gray-500 text-[11px] leading-normal mt-0.5">
                    Separate one-time milestone claims available to long-term claimers who maintain high streaks across month rollouts.
                  </p>
                  <p className="text-gray-600 text-[9.5px] leading-snug">
                    Not paid by the daily faucet contract · Each milestone claimed once · Unlock
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white/4 border border-purple-400/25 rounded-2xl overflow-hidden">
              <div className="bg-purple-400/10 px-3 py-2.5 flex items-center justify-between">
                <span className="text-purple-300 font-black text-xs">✨ C3 / C4 Phases · Coming Later</span>
                <span className="text-purple-400 font-bold text-xs">Planned</span>
              </div>
              <div className="px-3 py-3">
                <p className="text-gray-600 text-[9.5px] leading-snug text-center">
                  Future Special Loyalty Bonus phases for long-term claimers · Milestones and dates TBD · Support fee may apply
                </p>
              </div>
            </div>

          </div>

          <p className="text-gray-700 text-[9px] text-center mt-3">
            Daily faucet cycle repeats every 30 days · Special Loyalty Bonuses are separate one-time claims
          </p>
        </div>
      )}

      {activeTab === "board" && (
        <div className="fixed bottom-0 left-0 right-0 z-50 leaderboard-me px-4 py-2.5 backdrop-blur-sm">
          <div className="max-w-sm mx-auto grid grid-cols-12 gap-1 items-center">
            <p className="col-span-1 text-yellow-400 font-black text-sm">{myRank ? `#${myRank}` : "—"}</p>
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
              <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5 tracking-wider uppercase text-center truncate max-w-full"
                style={{
                  color: myRank && myRank <= 3 ? '#fcd34d' : '#9ca3af',
                  border: `1px solid ${myRank && myRank <= 3 ? '#f59e0b50' : '#ffffff15'}`,
                  background: myRank && myRank <= 3 ? '#f59e0b15' : '#ffffff05'
                }}>
                {myRank ? (myRank <= 3 ? "PRO CLAIMER" : "ACTIVE") : "UNRANKED"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Reset Global Counter Banner */}
      <div className="max-w-sm mx-auto px-4 pb-20 text-center text-gray-600 text-[10px] font-medium tracking-wide space-y-1">
        <p className="uppercase tracking-[0.2em] text-gray-500/80">Ecosystem Cycle Counter</p>
        <p className="font-mono text-gray-400">
          {mDays}d {mHrs}h {mMins}m {mSecs}s until next monthly update
        </p>
      </div>
    </main>
  );
}
