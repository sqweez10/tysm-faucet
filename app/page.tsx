"use client";

import { useState, useEffect } from "react";

export default function FaucetPage() {
  // สเตตัสเบื้องต้นจำลองตามหน้าจอจริงของคุณท็อปคัป
  const [dayCount, setDayCount] = useState(0);
  const [faucetPool, setFaucetPool] = useState(557000);
  const [communityClaims, setCommunityClaims] = useState(0);
  const [isShared, setIsShared] = useState(false);

  return (
    <main className="min-h-screen bg-[#0d0e12] text-white flex flex-col items-center justify-center p-4 font-sans selection:bg-purple-500/30">
      
      {/* Container หลักควบคุมขนาดหน้าจอมือถือตามภาพ */}
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
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-full w-[2%]" />
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
            Ready to Claim
          </div>
          
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold tracking-tight text-yellow-500 bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-500 bg-clip-text text-transparent">
              2,000
            </h1>
            <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase">
              $TYSM tokens
            </p>
          </div>

          {/* Action Button & Subtext */}
          <div className="space-y-2.5 pt-2">
            <button className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-[0.98] transition-all text-white font-bold text-sm rounded-xl shadow-lg shadow-purple-900/20 flex items-center justify-center gap-1.5">
              <span>⚡</span> Share First ➡️ Unlock Claim!
            </button>
            <p className="text-[11px] text-gray-400/80 italic font-medium">
              Please share first to unlock Claim 🙏
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
