"use client";
// 줄여 보이는 종목 이름 목록(예: '크래프톤 · 아모레퍼시픽 · 농심 · 대…'): 누르면 전체 목록을 작은 말풍선으로, PC는 마우스를 올려도 보인다(2026-11-22 팀원 개선 사항).
import { useEffect, useRef, useState } from "react";

export function NamesTip({ names }: { names: string[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  return (
    <span ref={box} className={`ntip ${open ? "on" : ""}`}>
      <button type="button" aria-expanded={open} aria-label={`종목 ${names.length}개 모두 보기`} onClick={() => setOpen(!open)}>{names.join(" · ")}</button>
      <span role="tooltip" className="ntipbox">{names.join(", ")}</span>
    </span>
  );
}
