import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "TYSM Daily Faucet",
  description: "Claim 2,000 $TYSM every day! Free faucet by tops87 on Base Chain.",
  openGraph: {
    title: "🙏 TYSM Daily Faucet",
    description: "Claim your FREE $TYSM every day. 7-day streak = +500 bonus!",
    siteName: "TYSM Faucet",
  },
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

