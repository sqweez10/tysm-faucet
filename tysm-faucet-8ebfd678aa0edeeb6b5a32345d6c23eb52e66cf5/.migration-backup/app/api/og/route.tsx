import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const user    = searchParams.get("user")    || "Farcaster User";
  const streak  = parseInt(searchParams.get("streak")  || "0");
  const claimed = searchParams.get("claimed") || "0";

  // Reward for current streak
  const reward =
    streak === 30 ? "90,000" :
    streak === 15 ? "40,000" :
    streak === 7  ? "10,000" : "2,000";

  const isMile = streak === 7 || streak === 15 || streak === 30;

  // Next milestone
  const next =
    streak < 7  ? { day: 7,  reward: "10,000", left: 7  - streak } :
    streak < 15 ? { day: 15, reward: "40,000", left: 15 - streak } :
    streak < 30 ? { day: 30, reward: "90,000", left: 30 - streak } : null;

  // Progress % within 30-day cycle
  const cyclePos = streak === 0 ? 0 : streak % 30 === 0 ? 30 : streak % 30;
  const pct      = Math.round((cyclePos / 30) * 100);

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "linear-gradient(135deg,#0a0a18 0%,#0f1425 50%,#0a0a18 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Arial Black, Arial, sans-serif",
          color: "white",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Top glow */}
        <div style={{
          position: "absolute", top: "-80px", left: "50%",
          width: "700px", height: "400px",
          background: "radial-gradient(circle,rgba(245,158,11,0.18) 0%,transparent 70%)",
          transform: "translateX(-50%)",
        }} />

        {/* Border */}
        <div style={{
          position: "absolute", inset: "3px",
          border: "1px solid rgba(245,158,11,0.2)",
          borderRadius: "20px",
        }} />

        {/* Milestone glow */}
        {isMile && (
          <div style={{
            position: "absolute", inset: "3px",
            border: "2px solid rgba(245,158,11,0.5)",
            borderRadius: "20px",
            boxShadow: "0 0 40px rgba(245,158,11,0.2)",
          }} />
        )}

        {/* Main content */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", zIndex: 1, padding: "40px" }}>

          {/* Logo + title */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
            <div style={{ fontSize: "24px", color: "#f59e0b", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase" }}>WELCOME TO</div>
            <div style={{
              fontSize: "72px", fontWeight: 900, lineHeight: 1,
              background: "linear-gradient(135deg,#fcd34d,#f59e0b,#d97706)",
              backgroundClip: "text", color: "transparent",
            }}>$TYSM</div>
            <div style={{ fontSize: "16px", color: "#6b7280", letterSpacing: "4px", textTransform: "uppercase" }}>
              Daily Faucet · by tops87
            </div>
          </div>

          {/* Username */}
          <div style={{
            fontSize: "28px", fontWeight: 700, color: "#fcd34d",
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
            borderRadius: "100px",
            padding: "6px 24px",
          }}>
            {user}
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: "16px" }}>

            {/* Streak */}
            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(245,158,11,0.25)",
              borderRadius: "16px",
              padding: "14px 28px",
              textAlign: "center",
              minWidth: "160px",
            }}>
              <div style={{ fontSize: "12px", color: "#9ca3af", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "4px" }}>Streak</div>
              <div style={{ fontSize: "44px", fontWeight: 900, color: "#f59e0b", lineHeight: 1 }}>{streak}d</div>
              <div style={{ fontSize: "14px", color: "#f59e0b", fontWeight: 700, textTransform: "uppercase", marginTop: "4px" }}>ACTIVE</div>
            </div>

            {/* Today's reward */}
            <div style={{
              background: isMile ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.04)",
              border: isMile ? "1px solid rgba(245,158,11,0.5)" : "1px solid rgba(245,158,11,0.25)",
              borderRadius: "16px",
              padding: "14px 28px",
              textAlign: "center",
              minWidth: "180px",
            }}>
              <div style={{ fontSize: "12px", color: "#9ca3af", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "4px" }}>
                {isMile ? "Milestone!" : "Today"}
              </div>
              <div style={{ fontSize: "36px", fontWeight: 900, color: isMile ? "#fcd34d" : "#f59e0b", lineHeight: 1 }}>
                {reward}
              </div>
              <div style={{ fontSize: "14px", color: "#9ca3af" }}>$TYSM</div>
            </div>

            {/* Total claimed */}
            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(34,197,94,0.25)",
              borderRadius: "16px",
              padding: "14px 28px",
              textAlign: "center",
              minWidth: "180px",
            }}>
              <div style={{ fontSize: "12px", color: "#9ca3af", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "4px" }}>Total Earned</div>
              <div style={{ fontSize: "36px", fontWeight: 900, color: "#4ade80", lineHeight: 1 }}>{claimed}</div>
              <div style={{ fontSize: "14px", color: "#9ca3af" }}>$TYSM</div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ width: "600px", display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", color: "#6b7280" }}>30-Day Cycle</span>
              <span style={{ fontSize: "12px", color: "#f59e0b", fontWeight: 700 }}>Day {cyclePos}/30</span>
            </div>
            <div style={{ width: "600px", height: "10px", background: "rgba(255,255,255,0.08)", borderRadius: "100px", overflow: "hidden" }}>
              <div style={{
                width: `${pct}%`, height: "10px",
                background: "linear-gradient(90deg,#f59e0b,#fcd34d)",
                borderRadius: "100px",
              }} />
            </div>
            {/* Milestone markers label */}
            <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "128px", paddingRight: "0px" }}>
              <span style={{ fontSize: "11px", color: cyclePos >= 7 ? "#f59e0b" : "#4b5563" }}>D7 REWARD</span>
              <span style={{ fontSize: "11px", color: cyclePos >= 15 ? "#10b981" : "#4b5563", marginLeft: "90px" }}>D15 REWARD</span>
              <span style={{ fontSize: "11px", color: cyclePos >= 30 ? "#8b5cf6" : "#4b5563" }}>D30 REWARD</span>
            </div>
          </div>

          {/* Next milestone */}
          {next && (
            <div style={{
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.25)",
              borderRadius: "100px",
              padding: "8px 28px",
              fontSize: "16px", color: "#fcd34d",
            }}>
              NEXT: {next.left} more days to Day {next.day} ({next.reward} $TYSM)
            </div>
          )}

          {/* URL */}
          <div style={{ fontSize: "16px", color: "#4b5563" }}>tysm-faucet.vercel.app</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
