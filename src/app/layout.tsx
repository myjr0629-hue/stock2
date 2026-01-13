import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import { GuardianProvider } from "@/components/guardian/GuardianProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-kr",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Alpha (Tier 0.1)",
  description: "Real-time US Stock Quote Site",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSansKR.variable} antialiased font-sans`}
        style={{ fontFamily: 'var(--font-noto-kr), var(--font-geist-sans), sans-serif' }}
      >
        <GuardianProvider>
          {children}
        </GuardianProvider>
      </body>
    </html>
  );
}
