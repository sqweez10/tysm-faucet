"use client";

import { useState, useEffect } from "react";
import sdk from "@farcaster/frame-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits } from "viem";

const FAUCET_ABI = [
  { name: "claim", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "faucetBalance", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "totalClaimsCount", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "userInfo", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "lastClaim", type: "uint256" }, { name: "streak", type: "uint256" }, { name: "totalClaimed", type: "uint256" }, { name: "totalDays", type: "uint256" }] }
] as const;

const CONTRACT_ADDRESS = "0x43B68e86F6D6B3ED8d94c2A51015602c7338f124";

export default function FaucetPage() {
  const { address } = useAccount();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    sdk.actions.ready().then(() => setIsReady(true)).catch(console.error);
  }, []);

  const { data: userInfo } = useReadContract({ address: CONTRACT_ADDRESS, abi: FAUCET_ABI, functionName: "userInfo", args: address ? [address] : undefined });
  const { data: poolBalance } = useReadContract({ address: CONTRACT_ADDRESS, abi: FAUCET_ABI, functionName: "faucetBalance" });
  const { data: totalClaims } = useReadContract({ address: CONTRACT_ADDRESS, abi: FAUCET_ABI, functionName: "totalClaimsCount" });

  const { writeContract } = useWriteContract();

  return (
    <main className="min-h-screen bg-[#0d0e12] text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#13161f] border border-gray-800 rounded-2xl p-6 text-center space-y-4">
        <h1 className="text-2xl font-bold text-yellow-500">TYSM Faucet</h1>
        <p className="text-gray-400">Day Streak: {userInfo ? Number(userInfo[1]) : 0}</p>
        <p className="text-gray-400">Pool: {poolBalance ? Number(formatUnits(poolBalance, 18)).toFixed(0) : "..."}</p>
        <button 
          onClick={() => writeContract({ address: CONTRACT_ADDRESS, abi: FAUCET_ABI, functionName: "claim" })}
          className="w-full py-3 bg-purple-600 rounded-xl font-bold"
        >
          Claim Daily $TYSM
        </button>
      </div>
    </main>
  );
}
