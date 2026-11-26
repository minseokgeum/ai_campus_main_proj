"use client";
// 홈 맨 위 '밤사이' 카드의 눌러 보라는 움직임(2026-11-26 사용자 결정 D안 + '계속 주기적으로'):
// 카드 둘레에 청록 물결이 퍼진다(모양은 globals.css '.nightcard.nudge'). 화살표 단추가 좌우로 흔들리던 것은 2026-11-26 사용자 결정으로 뺌.
// 처음 0.6초 뒤 한 번, 그 뒤 2.5초마다(2026-11-26, 예전 8초 → 5초). 카드가 화면에 보이고 앱 창이 앞에 있을 때만 움직이고, 움직임 줄이기 설정을 켠 사람에게는 움직이지 않는다.
import { useEffect, useRef } from "react";

const FIRST = 600, EVERY = 2500, PLAY = 1200;   // 2026-11-26: 8초 → 5초 → 2.5초(사용자 요청: 계속 이어지는 느낌으로)

export function Nudge({ className, children }: { className: string; children: React.ReactNode }) {
  const el = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = el.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let seen = false, timer = 0, off = 0;
    const play = () => {
      if (!seen || document.visibilityState !== "visible") return;
      node.classList.remove("nudge"); void node.offsetWidth; node.classList.add("nudge");
      window.clearTimeout(off); off = window.setTimeout(() => node.classList.remove("nudge"), PLAY);
    };
    const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting && e.intersectionRatio >= 0.6; }, { threshold: [0, 0.6, 1] });
    io.observe(node);
    const first = window.setTimeout(() => { play(); timer = window.setInterval(play, EVERY); }, FIRST);
    return () => { io.disconnect(); window.clearTimeout(first); window.clearInterval(timer); window.clearTimeout(off); };
  }, []);
  return <section ref={el} className={className}>{children}</section>;
}
