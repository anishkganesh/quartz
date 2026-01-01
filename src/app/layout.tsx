import type { Metadata } from "next";
import { Source_Serif_4, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import PostAuthHandler from "@/components/PostAuthHandler";
import "./globals.css";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Quartz - AI-Powered Encyclopedia",
  description: "Infinite knowledge, zero jargon. Click any concept to explore deeper.",
  keywords: ["encyclopedia", "learn", "education", "articles", "interactive learning", "knowledge"],
  authors: [{ name: "Quartz" }],
  creator: "Quartz",
  publisher: "Quartz",
  icons: {
    icon: "/favicon.svg",
  },
  metadataBase: new URL("https://tryquartz.wiki"),
  openGraph: {
    title: "Quartz - AI-Powered Encyclopedia",
    description: "Infinite knowledge, zero jargon. Click any concept to explore deeper.",
    url: "https://tryquartz.wiki",
    siteName: "Quartz",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Quartz - AI-Powered Encyclopedia",
    description: "Infinite knowledge, zero jargon. Click any concept to explore deeper.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${sourceSerif.variable} ${inter.variable} font-sans antialiased bg-background text-foreground`}
      >
        {children}
        <PostAuthHandler />
        <Analytics />
      </body>
    </html>
  );
}
