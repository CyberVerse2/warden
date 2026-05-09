import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Warden · Spend control",
  description:
    "Programmable spend-control layer for autonomous AI agents using x402 payments on Solana.",
  icons: {
    icon: "/brand/warden-logo.png",
    apple: "/brand/warden-logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
