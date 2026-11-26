"use client";
// 뉴스 종목·업종 이름 줄(피그마 배포용 변경 기록 50, 2026-11-25 사용자 결정: 예전 '종목 ⌄'·'업종 ⌄' 상자 메뉴 대신).
// 글자만 가로로 나열(옆으로 넘김), 고른 것은 굵게 + 밑줄, 이름 옆 작은 숫자 = 그 종목·업종 밤사이 뉴스 수. 누르면 그 종목·업종 화면으로.
// 고른 이름이 줄 밖에 있으면 처음 열 때 보이게 옮긴다. 오른쪽 끝에 닿으면 흐림을 숨긴다(2026-11-26).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type NameItem = { key: string; label: string; n: number; href: string; dot?: boolean };   // dot: 내 종목이 있는 업종

export function NameRow({ items, on, label }: { items: NameItem[]; on: string; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [end, setEnd] = useState(false);
  useEffect(() => {   // 더 넘길 것이 남았는지: 끝에 닿았거나 넘칠 것이 없으면 end
    const b = box.current;
    if (!b) return;
    const check = () => setEnd(b.scrollLeft + b.clientWidth >= b.scrollWidth - 2);
    check();
    b.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => { b.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
  }, [items.length]);
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>("a.on");
    const b = box.current;
    if (el && b && (el.offsetLeft + el.offsetWidth > b.scrollLeft + b.clientWidth - 40 || el.offsetLeft < b.scrollLeft)) b.scrollLeft = el.offsetLeft - 24;
  }, [on]);
  return (
    <nav className={`namerow${end ? " end" : ""}`} aria-label={label}>
      <div className="nr-in" ref={box}>
        {items.map((x) => (
          <Link key={x.key} href={x.href} scroll={false} className={x.key === on ? "on" : ""} aria-current={x.key === on ? "page" : undefined}>
            {x.dot ? <i className="nrd" aria-label="내 종목이 있는 업종" /> : null}{x.label}{x.n ? <span className="nrn">{x.n}</span> : null}
          </Link>
        ))}
      </div>
    </nav>
  );
}
