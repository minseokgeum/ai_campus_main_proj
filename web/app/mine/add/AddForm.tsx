"use client";
// 종목 추가(피그마 541:8111) · 첫 사용 · 보유 종목 등록(531:6228). 검색칸을 누르면 종목 찾기 창(567:8670)이 아래에서 올라온다.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Layer } from "@/components/sheet";

type S = { code: string; name: string; sector?: string };
type D = S & { qty: number };

export default function AddForm({ universe, initial, save, first, owned = [] }: { universe: S[]; initial: D[]; save: (f: FormData) => Promise<void>; first?: boolean; owned?: string[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<D[]>(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  const found = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return [];
    return universe.filter((s) => s.name.toLowerCase().includes(k) || s.code.includes(k)).slice(0, 20);
  }, [q, universe]);
  const has = new Set([...draft.map((d) => d.code), ...owned]);   // 이미 가진 종목도 '추가됨'
  const step = (code: string, d: number) => setDraft((x) => x.map((r) => (r.code === code ? { ...r, qty: Math.max(0, r.qty + d) } : r)));
  const hi = (name: string) => { const i = name.toLowerCase().indexOf(q.trim().toLowerCase()); return i < 0 || !q.trim() ? name : <>{name.slice(0, i)}<b className="hl">{name.slice(i, i + q.trim().length)}</b>{name.slice(i + q.trim().length)}</>; };

  return (
    <main className="addpage">
      <div className="addtop"><Link href={first ? "/start" : "/mine"} aria-label="뒤로">‹</Link><b>{first ? "" : "종목 추가"}</b></div>
      <h1>{first ? <>어떤 종목을<br />갖고 계세요?</> : <>추가할 종목을<br />찾아보세요</>}</h1>
      <p className="lead">{first ? "등록한 종목 기준으로 매일 아침 오늘 시가 예상을 알려드려요. 나중에 바꿀 수 있어요." : "보유 종목은 수량을 넣고, 관심 종목은 수량 없이 추가하면 돼요."}</p>
      <button type="button" className="search" onClick={() => setOpen(true)}><span aria-hidden>⌕</span><span className="ph">종목명이나 코드로 찾기</span></button>
      <p className="dhead">추가한 종목 {draft.length}</p>
      <ul className="draft">
        {draft.map((d) => (
          <li key={d.code}>
            <b>{d.name}</b>
            <span className="qty">
              <button type="button" aria-label="1주 줄이기" onClick={() => step(d.code, -1)}>−</button>
              <input inputMode="numeric" aria-label={`${d.name} 수량(0이면 관심)`} value={d.qty || ""} placeholder="관심"
                onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")) || 0; setDraft((x) => x.map((r) => (r.code === d.code ? { ...r, qty: Math.min(n, 10_000_000) } : r))); }} />
              <small>주</small>
              <button type="button" aria-label="1주 늘리기" onClick={() => step(d.code, 1)}>+</button>
            </span>
            <button type="button" className="x" aria-label="빼기" onClick={() => setDraft((x) => x.filter((r) => r.code !== d.code))}>×</button>
          </li>
        ))}
      </ul>
      <p className="fine">수량을 넣으면 내 계좌 기준 금액으로, 비워 두면 %로만 보여드려요.</p>
      <form action={save} className="addsave">
        <input type="hidden" name="items" value={JSON.stringify(draft.map(({ code, qty }) => ({ code, qty })))} />
        <button type="submit" className="cta">{first ? `${draft.length}종목으로 시작하기` : `${draft.length}종목 추가하기`}</button>
        {first ? <Link href="/onboard/alerts" className="later">나중에 할게요</Link> : null}
      </form>

      {open ? (
        <Layer><div className="sheet-back" onClick={() => setOpen(false)}>
          <section className="sheet-box tall" role="dialog" aria-modal="true" aria-label="종목 찾기" onClick={(e) => e.stopPropagation()}>
            <i className="grab" />
            <div className="sheet-head"><div><h2>종목 찾기</h2></div><button type="button" className="txt" onClick={() => setOpen(false)}>닫기</button></div>
            <label className="search on">
              <span aria-hidden>⌕</span>
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="종목명이나 코드로 찾기" aria-label="종목 찾기" />
              {q ? <button type="button" aria-label="지우기" onClick={() => setQ("")}>✕</button> : null}
            </label>
            {q.trim() ? <p className="dhead">검색 결과 {found.length}</p> : null}
            <ul className="found">
              {found.map((s) => (
                <li key={s.code}>
                  <span>{hi(s.name)}<small>{s.code}{s.sector ? ` · ${s.sector}` : ""}</small></span>
                  {has.has(s.code) ? <em>추가됨 ✓</em> : <button type="button" onClick={() => setDraft((x) => [...x, { ...s, qty: 0 }])}>+ 추가</button>}
                </li>
              ))}
            </ul>
            <p className="fine">예상 범위는 코스피 전체와 코스닥150 종목만 계산해요. 다른 종목은 밤사이 소식만 보여드려요.</p>
          </section>
        </div></Layer>
      ) : null}
    </main>
  );
}
