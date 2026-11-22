import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import { DemoBar } from "@/components/demobar";

const kr = Noto_Sans_KR({ weight: ["400", "500", "700"], subsets: ["latin"], variable: "--font-kr", display: "swap" });

export const metadata: Metadata = {
  title: "투자 브리핑 · 당신이 잠든 사이에",
  description: "밤사이 미국 뉴스를 내 종목 기준으로 모아 아침에 보여 주는 브리핑(시연판)",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={kr.variable}>
      <body>
        <div className="app"><DemoBar />{children}</div>
      </body>
    </html>
  );
}
