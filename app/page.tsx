"use client";

import { useState, useEffect } from "react";
import sdk from "@farcaster/frame-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits } from "viem";

// 1. ใส่ ABI เท่าที่จำเป็นสำหรับการใช้งาน (ดึงสเตตัส และเคลม)
const FAUCET_ABI = [
  {
    "inputs": [],
    "name": "claimTokens",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "faucetPool",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalClaims",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "name": "userStreak",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// ที่อยู่สัญญาใหม่ของคุณท็อปคัป
const CONTRACT_ADDRESS = "0x43B68e86F6D6B3ED8d94c2A51015602c7338f124"; 

export default function FaucetPage() {
  const { address, isConnected } = useAccount();
  const [isShared, setIsShared] = useState(false);

  // 2. แก้ปัญหาเปิดแอปค้างใน Warpcast
  useEffect(() => {
    const initFarcaster = async () => {
      try {
        await sdk.actions.ready();
      } catch (err) {
        console.error("Farcaster SDK startup error:", err);
      }
    };
    initFarcaster();
  }, []);

  // 3. อ่านค่า Real-time จาก Smart Contract 
  const { data: poolData, refetch: refetchPool } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: FAUCET_ABI,
    functionName: "faucetPool",
  });

  const { data: claimsData, refetch: refetchClaims } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: FAUCET_ABI,
    functionName: "totalClaims",
  });

  const { data: streakData, refetch: refetchStreak } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: FAUCET_ABI,
    functionName: "userStreak",
    args: address ? [address] : undefined,
  });

  // 4. คำสั่งสำหรับส่งธุรกรรมเคลมเหรียญ ($TYSM)
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // อัปเดตข้อมูลหน้าจอเมื่อทำรายการสำเร็จ
  useEffect(() => {
    if (isSuccess) {
      refetchPool();
      refetchClaims();
      refetchStreak();
    }
  }, [isSuccess]);

  // ฟังก์ชันสลับเพื่อจำลองการแชร์เพื่อปลดล็อคปุ่ม
  const handleShare = async () => {
    try {
      // สั่งเปิดตัวแชร์ข้อความบน Warpcast จริง
      await sdk.actions.shareText({
        text: "I am claiming my daily $TYSM rewards! 🎁 Join the streak on Farcaster now!",
      });
      setIsShared(true); // ปลดล็อคปุ่มเคลม
    } catch (err) {
      // fallback กรณีเปิดนอกแอปให้กดผ่านได้
      setIsShared(true);
    }
  };

  const handleClaim = () => {
    if (!isConnected) {
      alert("Please connect your wallet first!");
      return;
    }
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: FAUCET_ABI,
      functionName: "claimTokens",
    });
  };

  // จัดการแปลงค่าตัวเลขที่อ่านได้จากสัญญา
  const dayCount = streakData ? Number(streakData) : 0;
  const faucetPool = poolData ? Math.floor(Number(formatUnits(poolData, 18))) : 557000;
  const communityClaims = claimsData ? Number(claimsData) : 0;

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
