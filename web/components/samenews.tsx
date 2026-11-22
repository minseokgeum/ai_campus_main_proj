"use client";
// 뉴스 상세 '같은 소식, 다른 매체'(배포용 새 기능, 피그마 769:9319 · 펼친 상태 919:1714): 회색 카드 한 장 안에 기사 줄, 2건까지 보이고 'n건 더 보기 ⌄' → 펼침 · '접기 ⌃'.
import { useState } from "react";

export type SameRow = { key: string; outlet: string; time: string; lang: string; title: string; link: string };

export function SameNews({ rows }: { rows: SameRow[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, 2);
  return (
    <section className="same">
      <h2>같은 소식, 다른 매체</h2>
      <p className="sub">매체 {new Set(rows.map((r) => r.outlet)).size + 1}곳에서 같은 소식을 다뤘어요</p>
      <div className="samecard">
        {shown.map((r) => (
          <a key={r.key} href={r.link} target="_blank" rel="noreferrer noopener" className="samerow">
            <span className="sm"><i aria-hidden>{r.outlet.slice(0, 1).toUpperCase()}</i><b>{r.outlet}</b><span> · {r.time} · {r.lang}</span></span>
            <span className="st">{r.title}</span>
            <svg className="ext" aria-hidden width="16" height="16" viewBox="0 0 16 16"><path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
        ))}
        {rows.length > 2 ? (
          <button type="button" className="samemore" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "접기 ⌃" : `${rows.length - 2}건 더 보기 ⌄`}</button>
        ) : null}
      </div>
    </section>
  );
}
