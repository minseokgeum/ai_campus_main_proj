"use client";
// 장이 열려 있는 동안 화면을 sec초마다 다시 받아 그래프를 이어 그린다(종목 상세 '1일', 2026-11-22). 화면이 가려져 있으면 쉬었다가 돌아오면 바로 한 번.
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AutoRefresh({ sec }: { sec: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") router.refresh(); };
    const t = setInterval(tick, sec * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [router, sec]);
  return null;
}
