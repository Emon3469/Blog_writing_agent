import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { Providers } from "@/components/Providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Draftsmith — AI Blog Writing Studio",
    template: "%s · Draftsmith",
  },
  description:
    "Draftsmith researches, outlines and writes publish-ready blog posts with a multi-step AI agent, plus a streaming writing assistant and rewrite tools.",
  applicationName: "Draftsmith",
  keywords: ["blog writer", "AI writing assistant", "content generation", "LangGraph", "Next.js"],
  openGraph: {
    title: "Draftsmith — AI Blog Writing Studio",
    description: "Research, outline and write publish-ready blog posts in seconds.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f7" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <body className="font-sans">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
