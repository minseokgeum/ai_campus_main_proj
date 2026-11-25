"use client";
// 옆으로 넘기는 카드 묶음(2026-11-24): 홈 나눠 보기와 내 종목 탭에서 '오늘 아침 내 종목 지도'와 '업종별 투자 비중'을 넘겨 본다.
// 칸 높이는 둘 중 긴 쪽에 맞춘다(넘길 때 아래 내용이 움직이지 않게). 아래 점은 지금 보는 장, 누르면 그 장으로.
import { Children, useRef, useState, type ReactNode } from "react";

export function Swipe({ labels, children }: { labels: string[]; children: ReactNode }) {
  const slides = Children.toArray(children).filter(Boolean);
  const box = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(0);
  if (slides.length < 2) return <>{slides}</>;
  // 한 장 폭 = 두 장의 시작 위치 차이(장 사이 간격 포함)
  const step = (el: HTMLDivElement) => { const a = el.children[0] as HTMLElement, b = el.children[1] as HTMLElement; return b.offsetLeft - a.offsetLeft || el.clientWidth || 1; };
  const onScroll = () => {
    const el = box.current;
    if (el) setCur(Math.max(0, Math.min(slides.length - 1, Math.round(el.scrollLeft / step(el)))));
  };
  const go = (i: number) => { const el = box.current; if (el) el.scrollTo({ left: i * step(el), behavior: "smooth" }); };
  return (
    <div className="pswipewrap">
      <div className="pswipe" ref={box} onScroll={onScroll} role="group" aria-roledescription="넘기는 카드">
        {slides.map((s, i) => <div key={i} className="pslide" aria-label={labels[i]}>{s}</div>)}
      </div>
      <div className="pdots" role="tablist">
        {slides.map((_, i) => <button key={i} type="button" role="tab" aria-selected={i === cur} aria-label={labels[i]} className={i === cur ? "on" : ""} onClick={() => go(i)} />)}
      </div>
    </div>
  );
}
