import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { PostHogProvider } from "./providers";
import Header from "@/components/Header";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NPM Leaderboard",
  description: "Best dashboard for tracking popular and rising packages",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/npm.ico" />
      </head>
      <body className={`${geistMono.variable} font-mono antialiased`}>
        {/* Server-rendered Header */}
        <Header />
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
