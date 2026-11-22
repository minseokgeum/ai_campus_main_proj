"use client";
// 홈 보기 전환(2026-11-22): '나눠 보기'(피그마 홈) ↔ '한 화면에 보기'(원래 버전처럼 밤사이 정보를 한 화면에 모아 보기). 고른 값은 쿠키에 1년 기억
import { useRouter } from "next/navigation";

export function ViewToggle({ all }: { all: boolean }) {
  const router = useRouter();
  const set = (v: "split" | "all") => {
    document.cookie = `home_view=${v}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return (
    <div className="seg viewseg" role="radiogroup" aria-label="홈 보기 방식">
      <button type="button" role="radio" aria-checked={!all} className={all ? "" : "on"} onClick={() => set("split")}>나눠 보기</button>
      <button type="button" role="radio" aria-checked={all} className={all ? "on" : ""} onClick={() => set("all")}>한 화면에 보기</button>
    </div>
  );
}
