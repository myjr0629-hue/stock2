import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { GuardianProvider } from "@/components/guardian/GuardianProvider";

// Plus Jakarta Sans for premium English/numeric typography
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "SIGNUM HQ",
  description: "Market Signal Command Center - 옵션 · 다크풀 · 고래 통합 분석",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={plusJakarta.variable} suppressHydrationWarning>
      <head>
        {/* Pretendard from CDN */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body
        className="antialiased"
      >
        <GuardianProvider>
          {children}
        </GuardianProvider>
      </body>
    </html>
  );
}

