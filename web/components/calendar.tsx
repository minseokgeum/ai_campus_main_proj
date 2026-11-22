"use client";
// 보관 달력 창(피그마 287:491 · 287:654): 월 이동, 날짜마다 채점 점(범위 안 비율 80% 이상 · 60~80% · 60% 미만, 2026-11-22 비율 기준으로 바꿈), 고른 날짜 보기.
import Link from "next/link";
import { useState } from "react";
import { Layer } from "@/components/sheet";

const WD = ["일", "월", "화", "수", "목", "금", "토"];

export function CalendarSheet({ selected, today, marks, records, closed }: { selected: string; today: string; marks: Record<string, "ok" | "one" | "many">; records: string[];
  closed: Record<string, [string, string]> }) {   // closed: 평일 휴장일 [공휴일|휴장, 이름](서버가 special_days.csv에서 넘김)
  const KRX_CLOSED = closed;
  const [open, setOpen] = useState(false);
  const [ym, setYm] = useState(selected.slice(0, 6));
  const [pick, setPick] = useState(selected);
  const y = Number(ym.slice(0, 4)), mo = Number(ym.slice(4, 6));
  const first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => `${ym}${String(i + 1).padStart(2, "0")}`)];
  const move = (n: number) => { const d = new Date(Date.UTC(y, mo - 1 + n, 1)); setYm(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`); };
  const has = new Set(records);
  const off = (d: string) => { const w = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6))).getUTCDay(); return w === 0 || w === 6 || !!KRX_CLOSED[d]; };
  const label = (t: string) => `${Number(t.slice(4, 6))}월 ${Number(t.slice(6))}일 (${WD[new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6))).getUTCDay()]})`;
  return (
    <>
      <button type="button" className="calbtn" onClick={() => setOpen(true)}>▦ 달력</button>
      {open ? (
        <Layer><div className="sheet-back" onClick={() => setOpen(false)}>
          <section className="sheet-box" role="dialog" aria-modal="true" aria-label="달력" onClick={(e) => e.stopPropagation()}>
            <i className="grab" />
            <div className="calhead">
              <button type="button" onClick={() => move(-1)} aria-label="이전 달">‹</button><b>{y}년 {mo}월</b><button type="button" onClick={() => move(1)} aria-label="다음 달">›</button>
              <button type="button" className="x" onClick={() => setOpen(false)} aria-label="닫기">✕</button>
            </div>
            <div className="calgrid">
              {WD.map((w) => <span key={w} className="wd">{w}</span>)}
              {cells.map((d, i) => d == null ? <span key={`e${i}`} /> : (
                d <= today ? (
                  // 규칙표 331:1379 날짜 상태: 주말·공휴일·휴장 = 회색(아래에 '공휴일'·'휴장'), 기록 없는 지난 거래일 = 진한 회색, 선택 = 차콜, 오늘 = 테두리
                  <Link key={d} href={`/saved?d=${d}`} onClick={() => setOpen(false)}
                    className={`${d === pick ? "pick" : ""} ${d === today ? "today" : ""} ${has.has(d) ? "rec" : off(d) ? "off" : "norec"}`}>
                    <span className="n">{Number(d.slice(6))}</span>{KRX_CLOSED[d] ? <small>{KRX_CLOSED[d][0]}</small> : marks[d] ? <i className={marks[d]} /> : <i className="none" />}
                  </Link>
                ) : <button key={d} type="button" disabled><span className="n">{Number(d.slice(6))}</span>{KRX_CLOSED[d] ? <small>{KRX_CLOSED[d][0]}</small> : <i className="none" />}</button>
              ))}
            </div>
            <div className="legend"><span><i className="ok" />80% 이상 범위 안</span><span><i className="one" />60~80%</span><span><i className="many" />60% 미만</span></div>
            <p className="fine">주말과 휴장일, 아직 오지 않은 날은 기록이 없어요. 오늘({Number(today.slice(4, 6))}/{Number(today.slice(6))})은 테두리로 표시해요.</p>
            <Link href={`/saved?d=${pick}`} className="cta bmore" onClick={() => setOpen(false)}>{label(pick)} 보기</Link>
          </section>
        </div></Layer>
      ) : null}
    </>
  );
}
