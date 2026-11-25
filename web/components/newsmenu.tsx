"use client";
// 뉴스 브리핑 맨 위 큰 제목 = 보기 전환 단추(2026-11-24 사용자 결정, 시안 '2안 · 제목 누름').
// 제목을 누르면 아래에 작은 메뉴: 내 종목 뉴스 · 산업별 뉴스 · 시장 뉴스, 고른 것에 ✓, 오른쪽에 밤사이 소식 수. 바깥을 누르거나 Esc면 닫힌다.
// 내 종목 뉴스의 종목 고르기 · 산업별 뉴스의 업종 고르기에도 같은 메뉴를 쓴다(2026-11-24). 이때는 box(앞 이름표 '종목'·'업종')를 줘서
// 제목과 다른 고르기 칸 모양(회색 테두리 상자: 이름표 · 고른 것 · 뉴스 n건 · ⌄)으로 그린다. 제목 아래에 같은 모양 펼침 단추가 겹쳐 보이지 않게(2안, 2026-11-24)
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type NewsView = { key: string; label: string; n: number; href: string; dot?: boolean };   // dot: 메뉴 줄 앞 • (산업별: 내 종목이 있는 업종)

export function NewsMenu({ views, on, box }: { views: NewsView[]; on: string; box?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);   // 제목(h1) 안이라 div 대신 span
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", out);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", out); document.removeEventListener("keydown", esc); };
  }, [open]);
  const cur = views.find((v) => v.key === on) ?? views[0];
  return (
    <span className={`nmenu${box ? " nm-boxwrap" : ""}`} ref={wrap}>
      <button type="button" className={box ? "nm-box" : "nm-t"} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((x) => !x)}>
        {box ? <><small>{box}</small><b>{cur.label}</b><span>뉴스 {cur.n}건</span></> : cur.label}
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className={open ? "up" : ""}><path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open ? (
        <span className="nm-list" role="menu">
          {views.map((v) => (
            <Link key={v.key} href={v.href} role="menuitemradio" aria-checked={v.key === cur.key} className={v.key === cur.key ? "on" : ""} onClick={() => setOpen(false)}>
              <i aria-hidden>{v.key === cur.key ? "✓" : ""}</i><span>{v.dot ? <b className="mydot" aria-label="내 종목이 있는 업종">• </b> : null}{v.label}</span><em>{v.n}</em>
            </Link>
          ))}
        </span>
      ) : null}
    </span>
  );
}
