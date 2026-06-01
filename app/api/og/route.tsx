import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const user = searchParams.get("user") || "Someone";
  const streak = searchParams.get("streak") || "0";
  const claimed = searchParams.get("claimed") || "0";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "800px",
          background:
            "linear-gradient(135deg, #0d0d1a 0%, #17172f 50%, #0d0d1a 100%)",
          color: "white",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "70px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: "72px",
            marginBottom: "20px",
          }}
        >
          🙏
        </div>

        <div
          style={{
            fontSize: "76px",
            fontWeight: 900,
            color: "#facc15",
            marginBottom: "20px",
          }}
        >
          TYSM Daily Faucet
        </div>

        <div
          style={{
            fontSize: "44px",
            fontWeight: 700,
            marginBottom: "42px",
          }}
        >
          {user} just claimed TYSM
        </div>

        <div
          style={{
            display: "flex",
            gap: "32px",
            marginBottom: "44px",
          }}
        >
          <div
            style={{
              background: "rgba(250, 204, 21, 0.12)",
              border: "2px solid rgba(250, 204, 21, 0.35)",
              borderRadius: "32px",
              padding: "32px 44px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: "32px", color: "#a1a1aa" }}>
              Current Streak
            </div>
            <div
              style={{
                fontSize: "64px",
                fontWeight: 900,
                color: "#facc15",
              }}
            >
              {streak} Days 🔥
            </div>
          </div>

          <div
            style={{
              background: "rgba(34, 197, 94, 0.12)",
              border: "2px solid rgba(34, 197, 94, 0.35)",
              borderRadius: "32px",
              padding: "32px 44px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: "32px", color: "#a1a1aa" }}>
              Total Claimed
            </div>
            <div
              style={{
                fontSize: "64px",
                fontWeight: 900,
                color: "#4ade80",
              }}
            >
              {claimed} TYSM
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: "34px",
            color: "#d4d4d8",
          }}
        >
          Claim yours at tysm-faucet.vercel.app
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 800,
    }
  );
}

