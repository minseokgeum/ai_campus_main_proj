"use client";
// 시연 시각 고르기(2026-11-22): 거래일 날짜 + 그날 아침 흐름의 시각을 골라, 지금 보던 화면을 그 시점으로 바꾼다(시연 계정만, /demo-time이 쿠키를 바꿈).
// 날짜마다 그날 자료(예측만 / 예측·뉴스 / 예측·뉴스·AI 요약)를 적어, 뉴스·AI가 없는 날을 미리 알 수 있게 한다.
import { useState, type ReactNode } from "react";
import { Sheet } from "@/components/sheet";

type Day = { t: string; label: string; news: boolean; ai: boolean; chk: [string, string] };   // chk: 그날 채점 시각 [글자, 값]
// 2026-11-24: 시간대 안의 아무 시각이 아니라 화면이 바뀌는 경계 시각으로. 채점은 날마다 실제 채점 시각
type Key = "0600" | "0630" | "0811" | "chk" | "1800";
const slotsOf = (d?: Day): [Key, string, string, string][] => [   // [고르는 값, 이동할 HHMM, 글자, 설명]
  ["0600", "0600", "06:00", "야간장 마감 · 예상 준비 중"],
  ["0630", "0630", "06:30", "예상 공개"],
  ["0811", "0811", "08:11", "장전 거래 반영"],
  ["chk", d?.chk[1] ?? "0905", d?.chk[0] ?? "09:05", "채점 결과 공개"],
  ["1800", "1800", "18:00", "야간선물 시작"],
];
const kind = (d?: Day) => (!d ? "" : d.ai ? "예측·뉴스·AI 요약" : d.news ? "예측·뉴스" : "예측만");

export function DemoPicker({ days, current, today, nowHm, trigger, className }: {
  days: Day[]; current: string | null; today: string; nowHm: string; trigger: ReactNode; className?: string;
}) {
  const [d, setD] = useState(current?.slice(0, 8) && days.some((x) => x.t === current.slice(0, 8)) ? current.slice(0, 8) : days[0]?.t ?? "");
  const [s, setS] = useState<Key>(() => {
    const cd = days.find((x) => x.t === current?.slice(0, 8)), hm = current?.slice(8);
    return slotsOf(cd).find((x) => x[1] === hm)?.[0] ?? "0811";
  });
  const day = days.find((x) => x.t === d);
  const slots = slotsOf(day), at = (k: Key) => slots.find((x) => x[0] === k)![1];
  const future = (k: Key) => d === today && at(k) > nowHm;   // 지금보다 뒤 시각은 고를 수 없음(공개 전 예상이 보이지 않게)
  const back = () => (typeof window === "undefined" ? "/" : window.location.pathname + window.location.search);
  const go = () => { window.location.href = `/demo-time?at=${d}${at(s)}&back=${encodeURIComponent(back())}`; };
  const off = () => { window.location.href = `/demo-time?at=off&back=${encodeURIComponent(back())}`; };
  return (
    <Sheet className={className} title="시연 시각 고르기" sub="고른 날짜·시각의 화면으로 바뀌어요" trigger={trigger}>
      <div className="dpk">
        <label className="dpk-l"><span>날짜</span>
          <select value={d} onChange={(e) => setD(e.target.value)}>
            {days.map((x) => <option key={x.t} value={x.t}>{x.label} · {kind(x)}</option>)}
          </select>
        </label>
        <p className="dpk-note">{day ? (day.ai ? "이날은 예측·채점·야간선물·뉴스·AI 요약이 모두 있어요." : day.news ? "이날은 예측·채점·뉴스가 있어요. AI 요약은 없어요." : "이날은 예측·채점·야간선물·미국 지수만 있어요. 뉴스와 AI 요약 칸은 비어 있어요.") : "고를 수 있는 날짜가 없어요."}</p>
        <span className="dpk-l"><span>시각</span></span>
        <div className="dpk-slots" role="radiogroup" aria-label="시각">
          {slots.map(([v, , t, sub]) => (
            <button key={v} type="button" role="radio" aria-checked={s === v} className={s === v ? "on" : ""} disabled={future(v)} onClick={() => setS(v)}>
              <b>{t}</b><small>{future(v) ? "아직 오지 않은 시각" : sub}</small>
            </button>
          ))}
        </div>
        <button type="button" className="primary dpk-go" disabled={!d || future(s)} onClick={go}>이 시각으로 보기</button>
        {current ? <button type="button" className="dpk-off" onClick={off}>지금 시각으로 돌아가기</button> : null}
      </div>
    </Sheet>
  );
}
