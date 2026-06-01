import type { Metadata } from "next";

const APP_URL = "https://tysm-faucet.vercel.app";

type SharePageProps = {
  searchParams: {
    user?: string;
    streak?: string;
    claimed?: string;
  };
};

export async function generateMetadata({
  searchParams,
}: SharePageProps): Promise<Metadata> {
  const user = searchParams.user || "Someone";
  const streak = searchParams.streak || "0";
  const claimed = searchParams.claimed || "0";

  const shareUrl = `${APP_URL}/share?user=${encodeURIComponent(
    user
  )}&streak=${encodeURIComponent(streak)}&claimed=${encodeURIComponent(
    claimed
  )}`;

  const imageUrl = `${APP_URL}/api/og?user=${encodeURIComponent(
    user
  )}&streak=${encodeURIComponent(streak)}&claimed=${encodeURIComponent(
    claimed
  )}`;

  const miniapp = {
    version: "1",
    imageUrl,
    button: {
      title: "Claim TYSM",
      action: {
        type: "launch_miniapp",
        name: "TYSM Daily Faucet",
        url: APP_URL,
        splashImageUrl: `${APP_URL}/Tysm-Logo.png`,
        splashBackgroundColor: "#0d0d1a",
      },
    },
  };

  return {
    title: `${user} claimed TYSM`,
    description: `${user} has a ${streak}-day TYSM streak and has claimed ${claimed} TYSM.`,
    openGraph: {
      title: `${user} claimed TYSM`,
      description: `${user} has a ${streak}-day TYSM streak and has claimed ${claimed} TYSM.`,
      images: [imageUrl],
    },
    other: {
      "fc:miniapp": JSON.stringify(miniapp),
      "fc:frame": JSON.stringify(miniapp),
    },
  };
}

export default function SharePage({ searchParams }: SharePageProps) {
  const user = searchParams.user || "Someone";
  const streak = searchParams.streak || "0";
  const claimed = searchParams.claimed || "0";

  return (
    <main className="min-h-screen bg-[#0d0d1a] text-white flex items-center justify-center px-6">
      <div className="max-w-sm w-full rounded-3xl border border-yellow-500/20 bg-white/5 p-6 text-center">
        <img
          src="/Tysm-Logo.png"
          alt="TYSM Logo"
          className="w-20 h-20 rounded-full mx-auto mb-4"
        />

        <h1 className="text-3xl font-black text-yellow-400 mb-2">
          TYSM Daily Faucet
        </h1>

        <p className="text-lg font-bold mb-2">{user}</p>

        <p className="text-gray-300 mb-1">
          Current streak:{" "}
          <span className="text-yellow-400 font-bold">{streak} days</span>
        </p>

        <p className="text-gray-300 mb-6">
          Total claimed:{" "}
          <span className="text-green-400 font-bold">{claimed} TYSM</span>
        </p>

        <a
          href="/"
          className="block w-full rounded-xl bg-yellow-400 px-4 py-3 font-black text-black"
        >
          Claim TYSM
        </a>
      </div>
    </main>
  );
}

