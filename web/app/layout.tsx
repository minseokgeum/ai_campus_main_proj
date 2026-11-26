// 모든 화면을 감싸는 틀: 글꼴(Noto Sans KR), 탭 제목·아이콘, 시연·체험 계정의 시계 단추(DemoBar → components/timefab.tsx),
// 화면 넘김 진행 막대와 제자리 나타나기(Motion, components/motion.tsx).
import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { DemoBar } from "@/components/demobar";
import { Motion } from "@/components/motion";

const kr = Noto_Sans_KR({ weight: ["400", "500", "700"], subsets: ["latin"], variable: "--font-kr", display: "swap" });

export const metadata: Metadata = {
  title: "당신이 잠든 사이에",   // 2026-11-26 사용자 결정(예전 "투자 브리핑 · 당신이 잠든 사이에"). 탭 아이콘 = app/icon.svg(홈 밤사이 카드의 달), 홈 화면 아이콘 = app/apple-icon.png
  description: "밤사이 미국 뉴스를 내 종목 기준으로 모아 아침에 보여 주는 브리핑(시연판)",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={kr.variable}>
      <body>
        <div className="app"><DemoBar />{children}</div>
        <Suspense fallback={null}><Motion /></Suspense>
      </body>
    </html>
  );
}
