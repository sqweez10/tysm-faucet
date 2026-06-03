"use client";

import { useState, useEffect, useCallback } from "react";
import sdk from "@farcaster/frame-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits } from "viem";
import { base } from "wagmi/chains";

// 1. อัปเดต ABI ตรงตามตัวสัญญาจริงที่คุณท็อปใช้งานออนเชนคัป
const FAUCET_ABI = [
  { name: "claim", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "getTimeLeft", type: "function", stateMutability: "view", inputs: [{ name: "_user", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "canClaim", type: "function", stateMutability: "view", inputs: [{ name: "_user", type: "address" }], outputs: [{ type: "bool" }] },
  { name: "faucetBalance", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "userInfo", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "lastClaim", type: "uint256" }, { name: "streak", type: "uint256" }, { name: "totalClaimed", type: "uint256" }, { name: "totalDays", type: "uint256" }] },
  { name: "totalClaimsCount", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }
] as const;

const CONTRACT_ADDRESS = "0x43B68e86F6D6B3ED8d94c2A51015602c7338f124"; 

// ฟังก์ชันแปลงหน่วยให้อ่านง่ายขึ้น
function formatAmount(value: bigint | undefined): string {
  if (!value) return "0";
  const num = Number(formatUnits(value, 18));
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function FaucetPage() {
  const { address, isConnected } = useAccount();
  const [isShared, setIsShared] = useState(false);
  const [countdown, setCountdown] = useState<number>(0);

  // 2. สั่งปิดตัวโหลดค้างทันทีเมื่อรันบน Warpcast
  useEffect(() => {
    const initFarcaster = async () => {
      try {
        await sdk.actions.ready();
      } catch (err) {
        console.warn("Farcaster SDK startup warning:", err);
      }
    };
    initFarcaster();
  }, []);

  const baseQuery = { query: { enabled: !!address } };

  // 3. เรียกดึงข้อมูล Real-time ออนเชนตรงจากสัญญาตัวใหม่
  const { data: canClaimData, refetch: refetchCanClaim } = useReadContract({ address: CONTRACT_ADDRESS, abi: FAUCET_ABI, functionName: "canClaim", args: address ? [address] : undefined, ...baseQuery });
  const { data: timeLeftData, refetch: refetchTimeLeft } = useReadContract({ address: CONTRACT_ADDRESS, abi: FAUCET_ABI, functionName: "getTimeLeft", args: address ? [address] : undefined, ...baseQuery });
  const { data: userInfoData, refetch: refetchUserInfo } = useReadContract({ address: CONTRACT_ADDRESS, abi: FAUCET_ABI, functionName: "userInfo", args: address ? [address] : undefined, ...baseQuery });
  const { data: faucetBalData, refetch: refetchBalance } = useReadContract({ address: CONTRACT_ADDRESS, abi: FAUCET_ABI, functionName: "faucetBalance" });
  const { data: totalClaimsData, refetch: refetchTotalClaims } = useReadContract({ address: CONTRACT_ADDRESS, abi: FAUCET_ABI, functionName: "totalClaimsCount" });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // จัดการเวลานับถอยหลังเคลม
  useEffect(() => { if (timeLeftData !== undefined) setCountdown(Number(timeLeftData)); }, [timeLeftData]);
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => setCountdown((p) => { if (p <= 1) { refetchCanClaim(); refetchTimeLeft(); return 0; } return p - 1; }), 1000);
    return () => clearInterval(id);
  }, [countdown, refetchCanClaim, refetchTimeLeft]);

  // อัปเดตรีเฟรชสถานะเมื่อเคลมเหรียญสำเร็จ
  useEffect(() => {
    if (isSuccess) {
      setIsShared(false);
      refetchCanClaim(); refetchTimeLeft(); refetchUserInfo(); refetchBalance(); refetchTotalClaims();
    }
  }, [isSuccess, refetchCanClaim, refetchTimeLeft, refetchUserInfo, refetchBalance, refetchTotalClaims]);

  const handleShare = async () => {
    try {
      await sdk.actions.shareText({
        text: "I am claiming my daily $TYSM rewards! 🎁 Join the streak on Farcaster now!",
      });
      setIsShared(true);
    } catch (err) {
      setIsShared(true);
    }
  };

  const handleClaim = () => {
    if (!isConnected) return;
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: FAUCET_ABI,
      functionName: "claim",
      chainId: base.id,
    });
  };

  // แตกข้อมูลชุดสัญญาจริงเอามาแสดงผลบน UI
  const dayCount = userInfoData ? Number(userInfoData[1]) : 0; // index 1 คือ streak 
  const communityClaims = totalClaimsData ? Number(totalClaimsData) : 0;
  const isAvailableToClaim = canClaimData ?? false;

  return (
    <main className="min-h-screen bg-[#0d0e12] text-white flex flex-col items-center justify-center p-4 font-sans selection:bg-purple-500/30">
      <div className="w-full max-w-md bg-[#13161f] border border-gray-800/60 rounded-2xl p-6 shadow-2xl space-y-6">
        
        {/* Header Section: 30-Day Cycle */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm font-semibold tracking-wide text-gray-400">
            <span>30-Day Cycle</span>
            <span className="text-yellow-500 font-bold">Day {dayCount}/30</span>
          </div>
          
          {/* Progress Bar & Markers */}
          <div className="relative pt-2">
            <div className="w-full bg-gray-800 h-2.5 rounded-full overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-500 to-purple-600 h-full transition-all duration-300" 
                style={{ width: `${Math.min(((dayCount % 30) / 30) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 mt-1.5 font-medium px-0.5">
              <div className="text-center">🎁<br/>D1</div>
              <div className="text-center">🎁🎁<br/>D15</div>
              <div className="text-center">🎁🎁🎁<br/>D30</div>
            </div>
          </div>
        </div>

        {/* Next Milestone Box */}
        <div className="bg-[#1a1f2c] border border-blue-900/30 rounded-xl p-3 text-center text-xs font-medium text-yellow-400/90 shadow-inner flex items-center justify-center gap-1">
          <span>Next Milestone</span>
          <span>🎁 Day 7 ➔ 10,000 $TYSM</span>
        </div>

        {/* Claim Main Section */}
        <div className="bg-[#161a26] border border-gray-800/80 rounded-xl p-6 text-center space-y-4 shadow-lg">
          <div className="inline-flex items-center gap-1.5 bg-green-950/40 border border-green-500/30 text-green-400 text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            {!isConnected ? "Wallet Disconnected" : isAvailableToClaim ? "Ready to Claim" : countdown > 0 ? "On Countdown" : "Ready"}
          </div>
          
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold tracking-tight text-yellow-500 bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-500 bg-clip-text text-transparent">
              {dayCount === 29 ? "90,000" : dayCount === 14 ? "40,000" : dayCount === 6 ? "10,000" : "2,000"}
            </h1>
            <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase">
              $TYSM tokens
            </p>
          </div>

          {/* ปุ่มกดแสดงตามเงื่อนไขความพร้อมของการนับเวลาและการแชร์ */}
          <div className="space-y-2.5 pt-2">
            {!isConnected ? (
              <p className="text-sm font-semibold text-red-400">Please connect wallet in Frame</p>
            ) : countdown > 0 ? (
              <button disabled className="w-full py-3.5 bg-gray-800 text-gray-500 font-bold text-sm rounded-xl cursor-not-allowed">
                ⏳ Wait {Math.floor(countdown / 3600)}h {Math.floor((countdown % 3600) / 60)}m to Next Claim
              </button>
            ) : !isShared ? (
              <button 
                onClick={handleShare}
                className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-[0.98] transition-all text-white font-bold text-sm rounded-xl shadow-lg shadow-purple-900/20 flex items-center justify-center gap-1.5"
              >
                <span>⚡</span> Share First ➡️ Unlock Claim!
              </button>
            ) : (
              <button 
                onClick={handleClaim}
                disabled={isPending || isConfirming}
                className="w-full py-3.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 active:scale-[0.98] transition-all text-white font-bold text-sm rounded-xl shadow-lg shadow-green-900/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isPending || isConfirming ? "Processing..." : "🎁 Click to Claim $TYSM"}
              </button>
            )}
            
            <p className="text-[11px] text-gray-400/80 italic font-medium">
              {!isShared && countdown === 0 ? "Please share first to unlock Claim 🙏" : "Interact with Base Blockchain"}
            </p>
          </div>
        </div>

        {/* Dashboard Stats */}
        <div className="grid grid-cols-2 gap-4 pt-1">
          <div className="bg-[#161a26]/60 border border-gray-800/40 rounded-xl p-3">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Community Claims</p>
            <p className="text-xl font-black text-purple-400 mt-0.5">{communityClaims}</p>
          </div>
          <div className="bg-[#161a26]/60 border border-gray-800/40 rounded-xl p-3 text-right">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Faucet Pool</p>
            <p className="text-xl font-black text-yellow-500 mt-0.5">{formatAmount(faucetBalData)}</p>
          </div>
        </div>

        {/* Footer Info: Milestone Rewards List */}
        <div className="border-t border-gray-800/60 pt-4 space-y-2.5 text-xs">
          <h3 className="font-bold text-gray-300 flex items-center gap-1.5 text-[13px]">
            <span>🎁</span> Milestone Rewards
          </h3>
          
          <div className="space-y-2 text-gray-400 font-medium bg-[#11141d] p-3 rounded-xl border border-gray-800/40">
            <div className="flex justify-between items-center">
              <span>🗓️ Day 7</span>
              <span className="font-bold text-yellow-500">10,000 $TYSM</span>
            </div>
            <div className="flex justify-between items-center">
              <span>🎁🎁 Day 15</span>
              <span className="font-bold text-green-400">40,000 $TYSM</span>
            </div>
            <div className="flex justify-between items-center">
              <span>🎁🎁🎁 Day 30</span>
              <span className="font-bold text-purple-400">90,000 $TYSM</span>
            </div>
          </div>

          <div className="text-[11px] text-gray-500 space-y-1 pl-1 pt-1 font-medium">
            <p className="flex items-center gap-1">
              <span>🔄</span> Reach Day 30 ➔ Reset New Cycle
            </p>
            <p className="flex items-center gap-1">
              <span>📌</span> Share required before claiming
            </p>
          </div>
        </div>

      </div>
    </main>
  );
}  const communityClaims = claimsData ? Number(claimsData) : 0;

  return (
    <main className="min-h-screen bg-[#0d0e12] text-white flex flex-col items-center justify-center p-4 font-sans selection:bg-purple-500/30">
      <div className="w-full max-w-md bg-[#13161f] border border-gray-800/60 rounded-2xl p-6 shadow-2xl space-y-6">
        
        {/* Header Section: 30-Day Cycle */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm font-semibold tracking-wide text-gray-400">
            <span>30-Day Cycle</span>
            <span className="text-yellow-500 font-bold">Day {dayCount}/30</span>
          </div>
          
          {/* Progress Bar & Markers */}
          <div className="relative pt-2">
            <div className="w-full bg-gray-800 h-2.5 rounded-full overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-500 to-purple-600 h-full transition-all duration-300" 
                style={{ width: `${Math.min((dayCount / 30) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 mt-1.5 font-medium px-0.5">
              <div className="text-center">🎁<br/>D1</div>
              <div className="text-center">🎁🎁<br/>D15</div>
              <div className="text-center">🎁🎁🎁<br/>D30</div>
            </div>
          </div>
        </div>

        {/* Next Milestone Box */}
        <div className="bg-[#1a1f2c] border border-blue-900/30 rounded-xl p-3 text-center text-xs font-medium text-yellow-400/90 shadow-inner flex items-center justify-center gap-1">
          <span>Next Milestone</span>
          <span>🎁 Day 7 ➔ 10,000 $TYSM</span>
        </div>

        {/* Claim Main Section */}
        <div className="bg-[#161a26] border border-gray-800/80 rounded-xl p-6 text-center space-y-4 shadow-lg">
          <div className="inline-flex items-center gap-1.5 bg-green-950/40 border border-green-500/30 text-green-400 text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            {isConnected ? "Ready to Claim" : "Wallet Disconnected"}
          </div>
          
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold tracking-tight text-yellow-500 bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-500 bg-clip-text text-transparent">
              2,000
            </h1>
            <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase">
              $TYSM tokens
            </p>
          </div>

          {/* ปุ่มกดอัจฉริยะตามเงื่อนไขแชร์และเคลม */}
          <div className="space-y-2.5 pt-2">
            {!isShared ? (
              <button 
                onClick={handleShare}
                className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-[0.98] transition-all text-white font-bold text-sm rounded-xl shadow-lg shadow-purple-900/20 flex items-center justify-center gap-1.5"
              >
                <span>⚡</span> Share First ➡️ Unlock Claim!
              </button>
            ) : (
              <button 
                onClick={handleClaim}
                disabled={isPending || isConfirming}
                className="w-full py-3.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 active:scale-[0.98] transition-all text-white font-bold text-sm rounded-xl shadow-lg shadow-green-900/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isPending || isConfirming ? "Processing..." : "🎁 Click to Claim $TYSM"}
              </button>
            )}
            
            <p className="text-[11px] text-gray-400/80 italic font-medium">
              {!isShared ? "Please share first to unlock Claim 🙏" : "Awesome! Wallet signature required to claim"}
            </p>
          </div>
        </div>

        {/* Dashboard Stats */}
        <div className="grid grid-cols-2 gap-4 pt-1">
          <div className="bg-[#161a26]/60 border border-gray-800/40 rounded-xl p-3">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Community Claims</p>
            <p className="text-xl font-black text-purple-400 mt-0.5">{communityClaims}</p>
          </div>
          <div className="bg-[#161a26]/60 border border-gray-800/40 rounded-xl p-3 text-right">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Faucet Pool</p>
            <p className="text-xl font-black text-yellow-500 mt-0.5">{faucetPool.toLocaleString()}</p>
          </div>
        </div>

        {/* Footer Info: Milestone Rewards List */}
        <div className="border-t border-gray-800/60 pt-4 space-y-2.5 text-xs">
          <h3 className="font-bold text-gray-300 flex items-center gap-1.5 text-[13px]">
            <span>🎁</span> Milestone Rewards
          </h3>
          
          <div className="space-y-2 text-gray-400 font-medium bg-[#11141d] p-3 rounded-xl border border-gray-800/40">
            <div className="flex justify-between items-center">
              <span>🗓️ Day 7</span>
              <span className="font-bold text-yellow-500">10,000 $TYSM</span>
            </div>
            <div className="flex justify-between items-center">
              <span>🎁🎁 Day 15</span>
              <span className="font-bold text-green-400">40,000 $TYSM</span>
            </div>
            <div className="flex justify-between items-center">
              <span>🎁🎁🎁 Day 30</span>
              <span className="font-bold text-purple-400">90,000 $TYSM</span>
            </div>
          </div>

          {/* Rules/Notes */}
          <div className="text-[11px] text-gray-500 space-y-1 pl-1 pt-1 font-medium">
            <p className="flex items-center gap-1">
              <span>🔄</span> Reach Day 30 ➔ Reset New Cycle
            </p>
            <p className="flex items-center gap-1">
              <span>📌</span> Share required before claiming
            </p>
          </div>
        </div>

      </div>
    </main>
  );
}
