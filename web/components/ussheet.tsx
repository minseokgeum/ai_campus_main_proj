"use client";
// 홈 '미국 시장' 칸 4개(2026-11-24 사용자 결정): 누르면 새 화면(/us) 대신 아래에서 올라오는 창에 그 지표 하나(이름 · 마감 시각 · 값 · 등락 · 5분봉 그래프 · 시가/고가/저가/전일).
// 창 안에서 옆으로 넘기면 홈과 같은 순서(S&P 500 → 나스닥 → 다우 → 환율)로 다음 지표. 위 점은 지금 몇 번째인지, 누르면 그 지표로.
// 그래프 위에서 끌면 값 보기(그래프는 손가락 움직임을 직접 받음)라, 넘기기는 그래프 바깥을 민다. 자료는 홈 서버가 미리 읽어 넘긴다(lib/market usLatest · usIntraday).
import { useEffect, useRef, useState } from "react";
import { Layer } from "@/components/sheet";
import { UsChart } from "@/components/uschart";
import { signColor } from "@/components/model";

export type UsItem = {
  sym: string; short: string; name: string; when: string;   // when: '정규장 마감 · 11/23 16:00 (미 동부)'
  close: string;   // 그날 정규장 마감 시각(미 동부): 보통 '16:00', 조기 마감이면 '13:00'(2026-11-25)
  d: { open: number; high: number; low: number; close: number; prev: number; chg: number } | null;
  pts: { t: string; p: number }[];
};

const f = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctT = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(2)}%`;

export function UsChips({ items }: { items: UsItem[] }) {
  const [at, setAt] = useState<number | null>(null);
  const [cur, setCur] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const open = at != null;
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAt(null);
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [open]);
  // 열 때: 누른 지표 장으로 바로(애니메이션 없이). 창은 Layer가 한 박자 뒤에 그려서, 넘기는 칸이 화면에 붙는 순간(ref)에 맞춘다
  const setTrack = (el: HTMLDivElement | null) => {
    track.current = el;
    if (el && at != null && el.dataset.at !== String(at)) { el.dataset.at = String(at); el.scrollLeft = at * el.clientWidth; }
  };
  useEffect(() => { if (at != null) setCur(at); }, [at]);
  const onScroll = () => { const el = track.current; if (el) setCur(Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / (el.clientWidth || 1))))); };
  const go = (i: number) => track.current?.scrollTo({ left: i * track.current.clientWidth, behavior: "smooth" });

  return (
    <>
      <div className="uschips">
        {items.map((u, i) => (
          <button key={u.sym} type="button" className="uschip" onClick={() => setAt(i)} aria-label={`${u.name} 자세히`}>
            <span>{u.short}</span>
            <b style={{ color: signColor(u.d?.chg ?? 0) }}>{u.d ? pctT(u.d.chg) : "—"}</b>
          </button>
        ))}
      </div>
      {open ? (
        <Layer>
          <div className="sheet-back" onClick={() => setAt(null)}>
            <section className="sheet-box ussheet" role="dialog" aria-modal="true" aria-label="미국시장 지표" onClick={(e) => e.stopPropagation()}>
              <i className="grab" />
              <div className="sheet-head">
                <div><h2>미국시장 지표</h2><p>옆으로 넘기면 다음 지표예요</p></div>
                <button type="button" className="x" aria-label="닫기" onClick={() => setAt(null)}>✕</button>
              </div>
              <div className="usdots" role="tablist">
                {items.map((u, i) => <button key={u.sym} type="button" role="tab" aria-selected={i === cur} className={i === cur ? "on" : ""} onClick={() => go(i)}>{u.short}</button>)}
              </div>
              <div className="ustrack" ref={setTrack} onScroll={onScroll}>
                {items.map((u) => (
                  <div key={u.sym} className="uspage" aria-label={u.name}>
                    <h3>{u.name}</h3>
                    {!u.d ? <p className="fine">자료 준비 중이에요.</p> : <>
                      <p className="fine">{u.when}</p>
                      <p className="usbig">{f(u.d.close)}</p>
                      <p className="uschg" style={{ color: signColor(u.d.chg) }}>{u.d.chg >= 0 ? "▲" : "▼"} {f(Math.abs(u.d.close - u.d.prev))} ({pctT(u.d.chg)}) <span>전일 {f(u.d.prev)}</span></p>
                      <UsChart points={u.pts} prev={u.d.prev} digits={2} close={u.close} />
                      <div className="ohlc">
                        <span>시가</span><b>{f(u.d.open)}</b><span>전일 종가</span><b>{f(u.d.prev)}</b>
                        <span>고가</span><b style={{ color: "#d35d66" }}>{f(u.d.high)}</b><span>저가</span><b style={{ color: "#4c6fc3" }}>{f(u.d.low)}</b>
                      </div>
                    </>}
                  </div>
                ))}
              </div>
              <p className="fine usnote">자료: Yahoo Finance(yfinance) 정규장 5분봉, 실시간 시세가 아니에요.</p>
            </section>
          </div>
        </Layer>
      ) : null}
    </>
  );
}
