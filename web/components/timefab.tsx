"use client";
// 시점 이동 시계 단추(2026-11-26 사용자 결정 시안 time3 1번): 오른쪽 아래(아래 탭 위)에 '⏱ 11/26 06:30'. 누르면 그날 아침 시각 다섯 칸, 하나를 누르면
// 보던 화면 그대로 그 시각으로 바뀐다(/demo-time이 쿠키를 바꾸고 돌아옴). 날짜는 시연 날짜(lib/clock DEMO_DAY) 고정. 시연·체험 계정에만(components/demobar.tsx).
import { useEffect, useRef, useState } from "react";

export type Slot = { hm: string; label: string; sub: string };

const Clock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="13" r="8" fill="none" stroke="#e9a92a" strokeWidth="2.4" /><path d="M12 9v4l2.5 2M10 2h4" stroke="#e9a92a" strokeWidth="2.4" strokeLinecap="round" /></svg>
);

export function TimeFab({ day, dayLabel, slots, current }: { day: string; dayLabel: string; slots: Slot[]; current: string | null }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", off, true);
    return () => document.removeEventListener("pointerdown", off, true);
  }, [open]);
  const curHm = current?.startsWith(day) ? current.slice(8) : null;
  const go = (hm: string) => {
    const back = window.location.pathname + window.location.search;
    window.location.href = `/demo-time?at=${day}${hm}&back=${encodeURIComponent(back)}`;   // 보통 이동: 미리 불러오기가 쿠키를 바꾸지 않게
  };
  const label = current ? `${Number(current.slice(4, 6))}/${Number(current.slice(6, 8))} ${current.slice(8, 10)}:${current.slice(10, 12)}` : "지금";
  return (
    <div className="tfab-wrap" ref={box}>
      {open ? (
        <div className="tfab-pop" role="dialog" aria-label="시연 시각 고르기">
          <div className="tfab-h"><b>{dayLabel} 아침</b><span>누르면 그 시각 화면으로</span></div>
          <div className="tfab-tl">
            {slots.map((s) => (
              <button key={s.hm} type="button" className={curHm === s.hm ? "on" : ""} aria-pressed={curHm === s.hm} onClick={() => go(s.hm)}><b>{s.label}</b>{s.sub}</button>
            ))}
          </div>
        </div>
      ) : null}
      <button type="button" className="tfab" aria-label={`시연 시각 ${label} · 바꾸기`} aria-expanded={open} onClick={() => setOpen(!open)}><Clock />{label}</button>
    </div>
  );
}
