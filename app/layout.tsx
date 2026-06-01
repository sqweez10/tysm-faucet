import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

const miniapp = {
  version: "1",
  imageUrl: "https://tysm-faucet.vercel.app/og.png",
  button: {
    title: "Claim TYSM",
    action: {
      type: "launch_miniapp",
      name: "TYSM Daily Faucet",
      url: "https://tysm-faucet.vercel.app/",
      splashImageUrl: "https://tysm-faucet.vercel.app/Tysm-Logo.png",
      splashBackgroundColor: "#0d0d1a"
    }
  }
};

export const metadata: Metadata = {
  title: "TYSM Daily Faucet",
  description: "Claim 2,000 TYSM every day! Free faucet by tops87 on Base Chain.",
  openGraph: {
    title: "TYSM Daily Faucet",
    description: "Claim your FREE TYSM every day. 7-day streak = +500 bonus!",
    siteName: "TYSM Faucet",
    images: ["https://tysm-faucet.vercel.app/og.png"]
  },
  other: {
    "fc:miniapp": JSON.stringify(miniapp),
    "fc:frame": JSON.stringify(miniapp)
  }
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
      </head>
      <body className="bg-[#0d0d1a]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
