"use client";

import { useEffect, useState, useCallback } from "react";
import sdk from "@farcaster/frame-sdk";
import {
  useAccount,
  useConnect,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { farcasterFrame } from "@farcaster/frame-wagmi-connector";
import { formatUnits } from "viem";
import { base } from "wagmi/chains";

// =========================================================
//  CONFIG — แก้ไข 2 บรรทัดนี้หลัง Deploy Contract แล้ว
// =========================================================
const FAUCET_ADDRESS = (process.env.NEXT_PUBLIC_FAUCET_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://tysm-faucet.vercel.app";

// =========================================================
//  ABI — รายการฟังก์ชันของ Smart Contract
// =========================================================
const FAUCET_ABI = [
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "getTimeLeft",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "canClaim",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_user", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "faucetBalance",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "userInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "lastClaim", type: "uint256" },
      { name: "streak", type: "uint256" },
      { name: "totalClaimed", type: "uint256" },
    ],
  },
  {
    name: "totalClaimsCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

// =========================================================
//  HELPERS
// =========================================================

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function formatAmount(amount: bigint): string {
  return Number(formatUnits(amount, 18)).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function StreakFlames({ streak }: { streak: number }) {
  if (streak === 0) return null;
  if (streak >= 7) return <span>🔥🔥🔥</span>;
  if (streak >= 3) return <span>🔥🔥</span>;
  return <span>🔥</span>;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const isContractReady = FAUCET_ADDRESS !== ZERO_ADDRESS;

// =========================================================
//  MAIN COMPONENT
// =========================================================

export default function Home() {
  const [sdkReady, setSdkReady]     = useState(false);
  const [userCtx, setUserCtx]       = useState<any>(null);
  const [countdown, setCountdown]   = useState(0);
  const [justClaimed, setJustClaimed] = useState(false);
  const [txError, setTxError]       = useState("");

  const { address, isConnected } = useAccount();
  const { connect } = useConnect();

  // ── Contract Reads ────────────────────────────────────────
  const baseQuery = {
    query: { enabled: isContractReady && !!address },
  };

  const { data: canClaimData, refetch: refetchCanClaim } = useReadContract({
    address: FAUCET_ADDRESS,
    abi: FAUCET_ABI,
    functionName: "canClaim",
    args: [address!],
    ...baseQuery,
  });

  const { data: timeLeftData, refetch: refetchTimeLeft } = useReadContract({
    address: FAUCET_ADDRESS,
    abi: FAUCET_ABI,
    functionName: "getTimeLeft",
    args: [address!],
    ...baseQuery,
  });

  const { data: userInfoData, refetch: refetchUserInfo } = useReadContract({
    address: FAUCET_ADDRESS,
    abi: FAUCET_ABI,
    functionName: "userInfo",
    args: [address!],
    ...baseQuery,
  });

  const { data: faucetBalData, refetch: refetchBalance } = useReadContract({
    address: FAUCET_ADDRESS,
    abi: FAUCET_ABI,
    functionName: "faucetBalance",
    query: { enabled: isContractReady },
  });

  const { data: totalClaimsData } = useReadContract({
    address: FAUCET_ADDRESS,
    abi: FAUCET_ABI,
    functionName: "totalClaimsCount",
    query: { enabled: isContractReady },
  });

  // ── Contract Write ────────────────────────────────────────
  const {
    writeContract,
    data: txHash,
    isPending: isWritePending,
    error: writeError,
  } = useWriteContract();

  const { isLoading: isTxLoading, isSuccess: isTxSuccess } =
    useWaitForTransactionReceipt({ hash: txHash });

  // ── SDK Init ──────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const ctx = await sdk.context;
        setUserCtx(ctx);
        connect({ connector: farcasterFrame() });
        await sdk.actions.ready();
      } catch (e) {
        console.warn("SDK init:", e);
      } finally {
        setSdkReady(true);
      }
    };
    if (!sdkReady) load();
  }, [sdkReady, connect]);

  // ── Sync countdown ───────────────────────────────────────
  useEffect(() => {
    if (timeLeftData !== undefined) setCountdown(Number(timeLeftData));
  }, [timeLeftData]);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { refetchCanClaim(); refetchTimeLeft(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [countdown, refetchCanClaim, refetchTimeLeft]);

  // ── After claim success ───────────────────────────────────
  useEffect(() => {
    if (!isTxSuccess) return;
    setJustClaimed(true);
    refetchCanClaim();
    refetchTimeLeft();
    refetchUserInfo();
    refetchBalance();
  }, [isTxSuccess, refetchCanClaim, refetchTimeLeft, refetchUserInfo, refetchBalance]);

  // ── Tx error ─────────────────────────────────────────────
  useEffect(() => {
    if (!writeError) return;
    setTxError("Transaction failed. Try again.");
    const id = setTimeout(() => setTxError(""), 4000);
    return () => clearTimeout(id);
  }, [writeError]);

  // ── Actions ───────────────────────────────────────────────
  const handleClaim = useCallback(() => {
    setTxError("");
    writeContract({
      address: FAUCET_ADDRESS,
      abi: FAUCET_ABI,
      functionName: "claim",
      chainId: base.id,
    });
  }, [writeContract]);

  const handleShare = useCallback(async () => {
    const streak = userInfoData ? Number(userInfoData[1]) : 0;
    const reward = streak >= 7 ? "2,500" : "2,000";
    const text = justClaimed
      ? `🙏 Just claimed ${reward} $TYSM!\nDay ${streak} streak 🔥\n\nGet yours from @tops87's TYSM Daily Faucet — free every 24h!`
      : `🙏 Claiming my daily $TYSM from tops87's faucet!\nFree 2,000 $TYSM every day + streak bonus 🔥`;

    try {
      await sdk.actions.composeCast({ text, embeds: [APP_URL] });
    } catch (e) {
      console.warn("composeCast:", e);
    }
  }, [userInfoData, justClaimed]);

  // ── Derived values ────────────────────────────────────────
  const streak       = userInfoData ? Number(userInfoData[1]) : 0;
  const totalClaimed = userInfoData ? userInfoData[2] : BigInt(0);
  const faucetBal    = faucetBalData ?? BigInt(0);
  const totalClaims  = Number(totalClaimsData ?? BigInt(0));
  const canClaim     = canClaimData ?? false;
  const isBusy       = isWritePending || isTxLoading;
  const rewardLabel  = streak >= 7 ? "2,500" : "2,000";
  const streakPct    = Math.min((streak / 7) * 100, 100);

  // ── Loading screen ────────────────────────────────────────
  if (!sdkReady) {
    return (
      <div className="min-h-screen bg-[#0d0d1a] flex flex-col items-center justify-center gap-4">
        <div className="text-6xl animate-bounce">🙏</div>
        <p className="text-yellow-400 text-sm animate-pulse tracking-widest">
          LOADING TYSM FAUCET...
        </p>
      </div>
    );
  }

  // ── Main UI ───────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0a0a18] via-[#0f1425] to-[#0a0a18] text-white">
      <div className="max-w-sm mx-auto px-4 pt-5 pb-8 space-y-3">

        {/* ── User Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {userCtx?.user?.pfpUrl ? (
              <img
                src={userCtx.user.pfpUrl}
                alt="avatar"
                className="w-10 h-10 rounded-full border-2 border-yellow-500/40 object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-yellow-900/20 border-2 border-yellow-700/30 flex items-center justify-center text-xl">
                🙏
              </div>
            )}
            <div>
              <p className="text-yellow-300 font-bold text-sm leading-tight">
                {userCtx?.user?.displayName ||
                  userCtx?.user?.username ||
                  "Farcaster User"}
              </p>
              <p className="text-gray-600 text-[11px]">
                {address
                  ? `${address.slice(0, 6)}...${address.slice(-4)}`
                  : "Connecting..."}
              </p>
            </div>
          </div>

          {/* Streak badge */}
          <div className="bg-[#141428] border border-yellow-800/30 rounded-xl px-3 py-1.5 text-right">
            <p className="text-gray-500 text-[10px] uppercase tracking-wider">Streak</p>
            <p className="text-yellow-400 font-black text-lg leading-tight">
              {streak}d <StreakFlames streak={streak} />
            </p>
          </div>
        </div>

        {/* ── Title ── */}
        <div className="text-center py-2">
          <p className="text-5xl mb-1">🙏</p>
          <h1 className="text-4xl font-black bg-gradient-to-r from-yellow-300 via-yellow-400 to-yellow-200 bg-clip-text text-transparent tracking-tight">
            $TYSM
          </h1>
          <p className="text-gray-500 text-[11px] tracking-[0.35em] uppercase mt-0.5">
            Daily Faucet · by tops87
          </p>
        </div>

        {/* ── Contract not deployed yet ── */}
        {!isContractReady && (
          <div className="bg-red-950/50 border border-red-700/40 rounded-xl p-3 text-center">
            <p className="text-red-400 text-xs font-bold">⚠️ Contract Not Deployed Yet</p>
            <p className="text-gray-500 text-[11px] mt-0.5">
              Deploy TYSMFaucet.sol ก่อน แล้วใส่ address ใน Vercel
            </p>
          </div>
        )}

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#141428] border border-yellow-900/20 rounded-xl p-3">
            <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-0.5">
              Faucet Pool
            </p>
            <p className="text-lg font-black text-yellow-400 leading-tight">
              {isContractReady ? formatAmount(faucetBal) : "—"}
            </p>
            <p className="text-gray-600 text-[10px]">$TYSM remaining</p>
          </div>
          <div className="bg-[#141428] border border-yellow-900/20 rounded-xl p-3">
            <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-0.5">
              You Claimed
            </p>
            <p className="text-lg font-black text-green-400 leading-tight">
              {totalClaimed > BigInt(0) ? formatAmount(totalClaimed) : "0"}
            </p>
            <p className="text-gray-600 text-[10px]">$TYSM total</p>
          </div>
        </div>

        {/* ── Streak Progress Bar ── */}
        <div className="bg-[#141428] border border-yellow-900/20 rounded-xl p-3.5">
          <div className="flex justify-between items-center mb-2">
            <p className="text-gray-400 text-xs font-medium">Streak Progress</p>
            <p className="text-xs font-bold text-yellow-400">
              {streak}/7 {streak >= 7 ? "🔥 BONUS!" : "days"}
            </p>
          </div>
          <div className="w-full bg-gray-800/80 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-2.5 rounded-full transition-all duration-500"
              style={{
                width: `${streakPct}%`,
                background:
                  streak >= 7
                    ? "linear-gradient(90deg, #f59e0b, #ef4444)"
                    : "linear-gradient(90deg, #78350f, #f59e0b)",
              }}
            />
          </div>
          <p className="text-gray-600 text-[10px] mt-1.5">
            {streak >= 7
              ? "🎉 Bonus active! You get +500 $TYSM every day!"
              : `${7 - streak} more days → unlock +500 $TYSM daily bonus`}
          </p>
        </div>

        {/* ── Main Claim Card ── */}
        <div className="bg-[#141428] border border-yellow-900/20 rounded-xl p-4 text-center">
          {!isContractReady ? (
            <div className="py-6">
              <p className="text-gray-600 text-sm">Waiting for contract deploy...</p>
            </div>
          ) : canClaim ? (
            <>
              <div className="inline-flex items-center gap-1.5 bg-green-950/60 border border-green-700/30 rounded-full px-3 py-1 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <p className="text-green-400 text-xs font-semibold">Ready to claim!</p>
              </div>

              <p className="text-5xl font-black text-yellow-400 leading-none mb-0.5">
                {rewardLabel}
              </p>
              <p className="text-gray-500 text-sm mb-3">$TYSM tokens</p>

              {streak >= 7 && (
                <div className="bg-orange-950/40 border border-orange-700/30 rounded-lg py-1.5 px-3 mb-3">
                  <p className="text-orange-400 text-xs">
                    🔥 +500 streak bonus included!
                  </p>
                </div>
              )}

              {txError && (
                <p className="text-red-400 text-xs mb-2 bg-red-950/40 rounded-lg py-1.5 px-3">
                  {txError}
                </p>
              )}

              {isTxSuccess && justClaimed && (
                <p className="text-green-400 text-xs mb-2 font-semibold">
                  ✅ Claimed successfully! Check your wallet.
                </p>
              )}

              <button
                onClick={handleClaim}
                disabled={isBusy || !isConnected}
                className="w-full font-black py-4 rounded-xl text-lg transition-all active:scale-95 shadow-lg
                  bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 text-black
                  disabled:bg-gray-700 disabled:text-gray-500 disabled:shadow-none"
              >
                {isBusy
                  ? "⏳ Sending Transaction..."
                  : !isConnected
                  ? "🔌 Connecting Wallet..."
                  : "🙏 Claim $TYSM"}
              </button>
            </>
          ) : (
            <>
              <p className="text-gray-500 text-xs mb-1 tracking-wider uppercase">
                Next claim in
              </p>
              <p className="text-4xl font-black text-yellow-400 font-mono tracking-widest mb-1">
                {countdown > 0 ? formatCountdown(countdown) : "00:00:00"}
              </p>
              <p className="text-gray-600 text-xs">
                Come back in ~{Math.ceil(countdown / 3600)}h ·{" "}
                <span className="text-yellow-700">streak safe if you claim within 48h</span>
              </p>
            </>
          )}
        </div>

        {/* ── Global Stats ── */}
        <div className="bg-[#141428] border border-purple-900/20 rounded-xl p-3">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-gray-500 text-[10px] uppercase tracking-wider">
                Community Claims
              </p>
              <p className="text-xl font-black text-purple-400">
                {totalClaims.toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-gray-500 text-[10px] uppercase tracking-wider">
                Daily Reward
              </p>
              <p className="text-xl font-black text-yellow-400">2,000+</p>
            </div>
          </div>
        </div>

        {/* ── Share / Cast Button ── */}
        <button
          onClick={handleShare}
          className="w-full bg-purple-700 hover:bg-purple-600 active:bg-purple-800
            text-white font-black py-4 rounded-xl text-base transition-all active:scale-95
            flex items-center justify-center gap-2 shadow-lg shadow-purple-950/50"
        >
          ⚡{" "}
          {justClaimed
            ? "Share Your Claim! Cast it! ⚡"
            : "Tell your friends! Cast it! ⚡"}
        </button>

        {/* ── How it works ── */}
        <div className="bg-[#141428]/60 border border-gray-800/50 rounded-xl p-3.5 space-y-1.5">
          <p className="text-gray-400 text-xs font-bold mb-2">📖 How it works</p>
          <p className="text-gray-600 text-[11px]">🙏 Claim 2,000 $TYSM every 24 hours</p>
          <p className="text-gray-600 text-[11px]">🔥 7-day streak → +500 $TYSM bonus daily</p>
          <p className="text-gray-600 text-[11px]">⚡ Share to earn more with your community</p>
          <p className="text-gray-600 text-[11px]">🔒 Powered by Smart Contract on Base Chain</p>
        </div>

        <p className="text-center text-gray-700 text-[10px] pt-1">
          $TYSM Faucet · tops87 · Base Chain · Not Financial Advice
        </p>
      </div>
    </main>
  );
  }

