"use client";
// 옆으로 넘치는 버튼 줄(예: 기록 → 종목별 보기의 종목 선택 줄): 넘칠 때만 양 끝을 흐리게 하고 좌우 화살표를 보여 준다.
// 고른 버튼(.on)이 처음부터 보이게 그 자리로 옮겨 둔다(2026-11-22 팀원 개선 사항).
import { useEffect, useRef, useState, type ReactNode } from "react";

export function HScroll({ className, children }: { className: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const check = () => setEdge({ l: el.scrollLeft > 2, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    const on = el.querySelector<HTMLElement>(".on");
    if (on && on.offsetLeft + on.offsetWidth > el.clientWidth) el.scrollLeft = on.offsetLeft - 40;
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => { el.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
  }, []);
  const go = (d: number) => row.current?.scrollBy({ left: d * row.current.clientWidth * 0.7, behavior: "smooth" });
  return (
    <div className={`hscroll ${edge.l ? "l" : ""} ${edge.r ? "r" : ""}`}>
      <div ref={row} className={className}>{children}</div>
      {edge.l ? <button type="button" className="harrow left" aria-label="왼쪽 더 보기" onClick={() => go(-1)}>‹</button> : null}
      {edge.r ? <button type="button" className="harrow right" aria-label="오른쪽 더 보기" onClick={() => go(1)}>›</button> : null}
    </div>
  );
}
