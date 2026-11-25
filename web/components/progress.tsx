"use client";
// 오늘 아침 진행 창(피그마 시트 · 오늘 아침 진행 448:7030, 장 후 454:8516): 단계 점을 누르면 그 단계 설명으로 바뀐다.
import { useState } from "react";
import { Sheet } from "@/components/sheet";

const stepsOf = (chk: string) => [["06:00", "야간 마감"], ["06:30", "예상 범위 고정"], ["08:11", "장전 가격·방향 등급"], [chk, "시가 채점"]] as const;

export function ProgressSheet({ stage, slotTitle, slotSub, details, chk = "09:05" }: {
  stage: 0 | 1 | 2 | 3; slotTitle: string; slotSub: string; details: [string, string, boolean][];   // [제목, 설명, 끝남]
  chk?: string;   // 그날 채점 시각(10시 개장일은 10:05)
}) {
  const STEPS = stepsOf(chk);
  const [pick, setPick] = useState<number>(stage);
  const [t, d, done] = details[pick];
  return (
    <Sheet className="nprog" title="오늘 아침 진행" sub="점을 누르면 단계별 설명을 볼 수 있어요" trigger={
      <>
        <i />
        <span className="col"><b>{slotTitle}</b><span>{slotSub}</span></span>
        <span className="dots" aria-hidden>{STEPS.map((_, k) => <i key={k} className={k < stage ? "d" : k === stage ? "c" : ""} />)}</span>
        <em>›</em>
      </>
    }>
      <ol className="steps">
        {STEPS.map(([time, label], k) => (
          <li key={time} className={`${k < stage ? "d" : k === stage ? "c" : ""} ${k === pick ? "pick" : ""}`}>
            <button type="button" onClick={() => setPick(k)} aria-pressed={k === pick}><b>{time}</b><span>{label}</span></button>
          </li>
        ))}
      </ol>
      <div className="stepbox c">
        <b>{t}</b>{done ? <span className="done">완료</span> : pick === stage ? <span className="wait">진행 중</span> : <span className="wait">예정</span>}
        <p>{d}</p>
      </div>
    </Sheet>
  );
}
