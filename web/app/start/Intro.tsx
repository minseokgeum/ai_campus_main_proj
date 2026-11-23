"use client";
// 소개 3장(옆으로 넘기기·점 누르기)
import { useState } from "react";

const SLIDES = [
  { k: "밤사이 미국 시장", rows: [["S&P 500", "+0.60%", "up"], ["나스닥", "+0.85%", "up"], ["코스피200 야간", "−0.82%", "down"]],
    t: "밤사이 미국 시장,\n내 종목엔 어떤 일이?", d: "미국 장이 열린 밤사이 일어난 일을\n아침에 내 종목 기준으로 정리해 드려요." },
  { k: "오늘 시가 예상", rows: [["SK하이닉스", "+1.4%", "up"], ["LG에너지솔루션", "−2.6%", "down"], ["내 계좌", "+139,866원", "up"]],
    t: "오늘 시가에\n내 계좌는 얼마나?", d: "야간선물로 종목마다 예상 시가와\n예상 범위(노란 띠)를 07:30에 보여 드려요." },
  { k: "확인이 필요한 종목", rows: [["믿을 정도 낮음", "2종목", "warn"], ["08:11 2차 예측", "장전 거래로 다시 계산", "up"], ["09:05 채점", "12 / 14", "up"]],
    t: "꼭 볼 종목만\n먼저 올려 드려요", d: "08:11 장전 거래로 예상을 다시 계산하고,\n07:30 예상과 크게 달라진 종목을 먼저 보여 드려요." },
];

export function Intro() {
  const [i, setI] = useState(0);
  const s = SLIDES[i];
  let x0 = 0;
  return (
    <div className="intro" onTouchStart={(e) => { x0 = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - x0; if (dx < -40) setI(Math.min(2, i + 1)); if (dx > 40) setI(Math.max(0, i - 1)); }}>
      <button type="button" className="ibox" aria-label="다음 소개" onClick={() => setI((i + 1) % 3)}>
        <div className="icard"><b>{s.k}</b>{s.rows.map(([a, b, c]) => <p key={a}><span>{a}</span><em className={c}>{b}</em></p>)}</div>
      </button>
      <h1>{s.t}</h1>
      <p className="lead">{s.d}</p>
      <div className="idots">{SLIDES.map((_, k) => <button key={k} type="button" aria-label={`${k + 1}번째 소개`} className={k === i ? "on" : ""} onClick={() => setI(k)} />)}</div>
    </div>
  );
}
