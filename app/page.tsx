"use client";

import { useEffect, useState, useCallback } from "react";
import sdk from "@farcaster/frame-sdk";
import { sdk as miniappSdk } from "@farcaster/miniapp-sdk";
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

const FAUCET_ADDRESS = (process.env.NEXT_PUBLIC_FAUCET_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://tysm-faucet.vercel.app";

const FAUCET_ABI = [
  { name: "claim", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "getTimeLeft", type: "function", stateMutability: "view", inputs: [{ name: "_user", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "canClaim", type: "function", stateMutability: "view", inputs: [{ name: "_user", type: "address" }], outputs: [{ type: "bool" }] },
  { name: "faucetBalance", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "userInfo", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "lastClaim", type: "uint256" }, { name: "streak", type: "uint256" }, { name: "totalClaimed", type: "uint256" }] },
  { name: "totalClaimsCount", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

function formatCountdown(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}

function formatAmount(amount: bigint): string {
  return Number(formatUnits(amount, 18)).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function Flames({ streak }: { streak: number }) {
  if (streak <= 0) return null;
  if (streak >= 7) return <span>🔥🔥🔥</span>;
  if (streak >= 3) return <span>🔥🔥</span>;
  return <span>🔥</span>;
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const contractReady = FAUCET_ADDRESS !== ZERO_ADDR;

export default function Home() {
  const [sdkReady, setSdkReady] = useState(false);
  const [userCtx, setUserCtx] = useState<any>(null);
  const [countdown, setCountdown] = useState(0);
  const [justClaimed, setJustClaimed] = useState(false);
  const [txError, setTxError] = useState("");

  const { address, isConnected } = useAccount();
  const { connect } = useConnect();

  const baseQ = { query: { enabled: contractReady && !!address } };

  const { data: canClaimData, refetch: refetchCanClaim } = useReadContract({
    address: FAUCET_ADDRESS,
    abi: FAUCET_ABI,
    functionName: "canClaim",
    args: [address!],
    ...baseQ,
  });

  const { data: timeLeftData, refetch: refetchTimeLeft } = useReadContract({
    address: FAUCET_ADDRESS,
    abi: FAUCET_ABI,
    functionName: "getTimeLeft",
    args: [address!],
    ...baseQ,
  });

  const { data: userInfoData, refetch: refetchUserInfo } = useReadContract({
    address: FAUCET_ADDRESS,
    abi: FAUCET_ABI,
    functionName: "userInfo",
    args: [address!],
    ...baseQ,
  });

  const { data: faucetBalData, refetch: refetchBalance } = useReadContract({
    address: FAUCET_ADDRESS,
    abi: FAUCET_ABI,
    functionName: "faucetBalance",
    query: { enabled: contractReady },
  });

  const { data: totalClaimsData } = useReadContract({
    address: FAUCET_ADDRESS,
    abi: FAUCET_ABI,
    functionName: "totalClaimsCount",
    query: { enabled: contractReady },
  });

  const {
    writeContract,
    data: txHash,
    isPending: isWritePending,
    error: writeError,
  } = useWriteContract();

  const { isLoading: isTxLoading, isSuccess: isTxSuccess } =
    useWaitForTransactionReceipt({ hash: txHash });

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
        if (p <= 1) {
          refetchCanClaim();
          refetchTimeLeft();
          return 0;
        }

        return p - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [countdown, refetchCanClaim, refetchTimeLeft]);

  useEffect(() => {
    if (!isTxSuccess) return;

    setJustClaimed(true);
    refetchCanClaim();
    refetchTimeLeft();
    refetchUserInfo();
    refetchBalance();
  }, [
    isTxSuccess,
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
    const totalClaimedAmount = userInfoData ? formatAmount(userInfoData[2]) : "0";
    const reward = streak >= 7 ? "2,500" : "2,000";

    const displayName =
      userCtx?.user?.displayName ||
      userCtx?.user?.username ||
      "Someone";

    // สร้างลิงก์ Dynamic ไปยังหน้า /share พร้อมแนบข้อมูลสถิติ
    const dynamicShareUrl = `${APP_URL}/share?user=${encodeURIComponent(
      displayName
    )}&streak=${encodeURIComponent(String(streak))}&claimed=${encodeURIComponent(
      totalClaimedAmount
    )}`;

    const text = justClaimed
      ? `${displayName} just claimed ${reward} TYSM 🙏

Current streak: ${streak} day${streak === 1 ? "" : "s"} 🔥
Total claimed: ${totalClaimedAmount} TYSM

Claim yours from TYSM Daily Faucet:
${dynamicShareUrl}`
      : `I'm using TYSM Daily Faucet 🙏

Claim 2,000 TYSM every 24 hours.
Keep a 7-day streak to unlock the +500 bonus 🔥

Try it here:
${dynamicShareUrl}`;

    try {
      await miniappSdk.actions.composeCast({
        text,
        embeds: [dynamicShareUrl],
      });
    } catch (e) {
      console.warn("composeCast:", e);

      const fallbackUrl = `https://farcaster.xyz/~/compose?text=${encodeURIComponent(
        text
      )}&embeds[]=${encodeURIComponent(dynamicShareUrl)}`;

      await sdk.actions.openUrl(fallbackUrl);
    }
  }, [userInfoData, justClaimed, userCtx]);

  const streak = userInfoData ? Number(userInfoData[1]) : 0;
  const totalClaimed = userInfoData ? userInfoData[2] : BigInt(0);
  const faucetBal = faucetBalData ?? BigInt(0);
  const totalClaims = Number(totalClaimsData ?? BigInt(0));
  const canClaim = canClaimData ?? false;
  const isBusy = isWritePending || isTxLoading;
  const rewardLabel = streak >= 7 ? "2,500" : "2,000";
  const streakPct = Math.min((streak / 7) * 100, 100);

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

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0a0a18] via-[#0f1425] to-[#0a0a18] text-white">
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}`}</style>

      <div className="max-w-sm mx-auto px-4 pt-5 pb-8 space-y-3">
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

          <div className="bg-white/5 border border-yellow-800/30 rounded-xl px-3 py-1.5 text-right">
            <p className="text-gray-500 text-[9px] uppercase tracking-widest">
              Streak
            </p>

            <p className="text-yellow-400 font-black text-lg leading-tight">
              {streak}d <Flames streak={streak} />
            </p>
          </div>
        </div>

        <div className="text-center py-2">
          <div
            className="text-5xl mb-1.5"
            style={{ animation: "float 3s ease-in-out infinite" }}
          >
            🙏
          </div>

          <h1
            className="text-5xl font-black leading-none mb-0.5"
            style={{
              background: "linear-gradient(135deg,#fcd34d,#f59e0b,#d97706)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            $TYSM
          </h1>

          <p className="text-gray-500 text-[10px] tracking-[0.4em] uppercase">
            Daily Faucet · by tops87
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/4 border border-yellow-900/20 rounded-2xl p-3">
            <p className="text-gray-500 text-[9px] uppercase tracking-widest mb-0.5">
              Faucet Pool
            </p>

            <p className="text-yellow-400 font-black text-base leading-tight">
              {contractReady ? formatAmount(faucetBal) : "—"}
            </p>

            <p className="text-gray-600 text-[10px]">$TYSM left</p>
          </div>

          <div className="bg-white/4 border border-green-900/20 rounded-2xl p-3">
            <p className="text-gray-500 text-[9px] uppercase tracking-widest mb-0.5">
              You Claimed
            </p>

            <p className="text-green-400 font-black text-base leading-tight">
              {totalClaimed > BigInt(0) ? formatAmount(totalClaimed) : "0"}
            </p>

            <p className="text-gray-600 text-[10px]">$TYSM total</p>
          </div>
        </div>

        <div className="bg-white/4 border border-yellow-900/20 rounded-2xl p-3.5">
          <div className="flex justify-between items-center mb-2">
            <p className="text-gray-400 text-xs font-medium">
              Streak Progress
            </p>

            <p className="text-yellow-400 text-xs font-black">
              {streak}/7 {streak >= 7 ? "🔥 BONUS!" : "days"}
            </p>
          </div>

          <div className="w-full bg-gray-800/80 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-2.5 rounded-full transition-all duration-700"
              style={{
                width: `${streakPct}%`,
                background:
                  streak >= 7
                    ? "linear-gradient(90deg,#ef4444,#f59e0b)"
                    : "linear-gradient(90deg,#78350f,#f59e0b)",
              }}
            />
          </div>

          <p className="text-gray-600 text-[10px] mt-1.5">
            {streak >= 7
              ? "🎉 +500 bonus every day!"
              : `${7 - streak} more days → +500 $TYSM bonus`}
          </p>
        </div>

        <div
          className="bg-white/4 border border-yellow-900/20 rounded-2xl p-4 text-center"
          style={{ boxShadow: "0 0 28px rgba(245,158,11,0.12)" }}
        >
          {!contractReady ? (
            <p className="text-gray-600 text-sm py-4">
              Deploy contract first...
            </p>
          ) : canClaim ? (
            <>
              <div className="inline-flex items-center gap-1.5 bg-green-950/60 border border-green-700/30 rounded-full px-3 py-1 mb-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <p className="text-green-400 text-[11px] font-bold">
                  READY TO CLAIM
                </p>
              </div>

              <p
                className="font-black text-yellow-400 leading-none mb-0.5"
                style={{ fontSize: 52 }}
              >
                {rewardLabel}
              </p>

              <p className="text-gray-500 text-sm mb-3">$TYSM tokens</p>

              {streak >= 7 && (
                <div className="bg-orange-950/40 border border-orange-700/30 rounded-xl py-1.5 px-3 mb-3">
                  <p className="text-orange-400 text-[11px] font-bold">
                    🔥 +500 streak bonus included!
                  </p>
                </div>
              )}

              {txError && (
                <p className="text-red-400 text-xs mb-2">{txError}</p>
              )}

              {isTxSuccess && justClaimed && (
                <p className="text-green-400 text-xs mb-2 font-semibold">
                  ✅ Claimed! Check your wallet.
                </p>
              )}

              <button
                onClick={handleClaim}
                disabled={isBusy || !isConnected}
                className="w-full font-black py-4 rounded-xl text-lg transition-all active:scale-95"
                style={{
                  background:
                    isBusy || !isConnected
                      ? "#374151"
                      : "linear-gradient(90deg,#f59e0b,#fcd34d,#f59e0b)",
                  color: isBusy || !isConnected ? "#6b7280" : "#000",
                }}
              >
                {isBusy
                  ? "⏳ Sending..."
                  : !isConnected
                  ? "🔌 Connecting..."
                  : "🙏 Claim $TYSM"}
              </button>
            </>
          ) : (
            <>
              <p className="text-gray-500 text-[11px] uppercase tracking-widest mb-1">
                Next claim in
              </p>

              <p
                className="font-black text-yellow-400 font-mono"
                style={{ fontSize: 40, letterSpacing: "0.06em" }}
              >
                {countdown > 0 ? formatCountdown(countdown) : "00:00:00"}
              </p>

              <p className="text-gray-600 text-xs mt-1">
                Come back in ~{Math.ceil(countdown / 3600)}h
              </p>
            </>
          )}
        </div>

        <div className="bg-white/4 border border-purple-900/20 rounded-2xl p-3">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-gray-500 text-[9px] uppercase tracking-widest">
                Community Claims
              </p>

              <p className="text-purple-400 font-black text-xl">
                {totalClaims.toLocaleString()}
              </p>
            </div>

            <div className="text-right">
              <p className="text-gray-500 text-[9px] uppercase tracking-widest">
                Daily Reward
              </p>

              <p className="text-yellow-400 font-black text-xl">2,000+</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleShare}
          className="w-full text-white font-black py-4 rounded-2xl text-base transition-all active:scale-95 flex items-center justify-center gap-2"
          style={{
            background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
            boxShadow: "0 0 24px rgba(139,92,246,0.2)",
          }}
        >
          ⚡ {justClaimed ? "Share Your Claim! Cast it!" : "Tell your friends! Cast it! ⚡"}
        </button>

        <div className="bg-white/3 border border-white/5 rounded-2xl p-3.5 space-y-1.5">
          <p className="text-gray-400 text-xs font-bold mb-2">
            📖 How it works
          </p>

          {[
            "🙏 Claim 2,000 $TYSM every 24 hours",
            "🔥 7-day streak → +500 $TYSM bonus daily",
            "⚡ Share to grow the TYSM community",
            "🔒 Smart Contract on Base Chain",
          ].map((t, i) => (
            <p key={i} className="text-gray-600 text-[11px]">
              {t}
            </p>
          ))}
        </div>

        <p className="text-center text-gray-700 text-[10px] pt-1">
          $TYSM Faucet · tops87 · Base Chain
        </p>
      </div>
    </main>
  );
}

