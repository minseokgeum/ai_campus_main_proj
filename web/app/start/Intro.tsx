"use client";
// 첫 화면 소개 4장(2026-11-26 사용자 결정: C안을 간결하게 — 민트 칸 안 카드 하나 + 두 줄 제목 + 짧은 설명, 점 누르기·옆으로 밀기·카드 누르면 다음 장).
// 카드는 4장 모두 같은 크기·같은 틀(맨 위 작은 제목 + 남은 공간 가운데 내용)로, 민트 칸을 안쪽 16px만 남기고 채운다(같은 날 사용자 요청: 장마다 제각각·좌우 빈 공간)
// 숫자·문장은 시연 날짜 11/26(목) 아침 실제 값(시연 계좌 C 기준)으로 고정. 1장의 야간선물 흐름선만 서버에서 11/25 밤 실제 1분 가격으로 그린다(app/start/page.tsx).
import { useState, type ReactNode } from "react";

const UP = "#d35d66", DN = "#4c6fc3";
const Ring = ({ x, k }: { x: number; k: 1 | 2 }) => {
  const c = k === 1 ? "#2f3437" : "#2e8a7e";
  return <g><circle cx={x} cy={13} r={7.5} fill="#fff" stroke={c} strokeWidth={1.8} /><text x={x} y={16.6} textAnchor="middle" fontSize={9.5} fontWeight={800} fill={c}>{k}</text></g>;
};

function Slides(spark: string): { v: ReactNode; t: string; d: string }[] {
  return [
    {
      v: (
        <div className="sv-card">
          <p className="sv-h">밤사이 미국 시장 → 코스피200 야간선물</p>
          <div className="sv-body">
            <div className="sv-us"><div>S&amp;P 500<b style={{ color: DN }}>−0.25%</b></div><div>나스닥<b style={{ color: DN }}>−0.62%</b></div></div>
            <p className="sv-arr">↓ 미국 장이 열리는 동안 한국에선</p>
            <div className="sv-kp"><span>코스피200<br />야간선물</span><svg viewBox="0 0 80 24" height="24" preserveAspectRatio="none" aria-hidden><polyline points={spark} fill="none" stroke={UP} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></svg><b style={{ color: UP }}>+0.35%</b></div>
          </div>
        </div>
      ),
      t: "밤사이 미국 시장,\n내 종목엔 어떤 일이?",
      d: "미국 장이 열리는 동안 한국에선 코스피200\n야간선물이 함께 움직여요. 그 변화로\n내 종목의 아침 시가를 예상해요.",
    },
    {
      v: (
        <div className="sv-card">
          <p className="sv-h">내 종목 · <span className="sv-ai">AI 요약</span></p>
          <div className="sv-body">
            <b className="sv-t">SK하이닉스 · 현대차</b>
            <p className="sv-sum">엔비디아 CEO 복귀 소식 뒤 반도체주가 랠리를 반납했고, TrendForce는 2027년 메모리 전망을 낮췄어요.</p>
            <p className="sv-ev">근거 <u>반도체주, Huang 복귀 랠리 반납</u></p>
          </div>
        </div>
      ),
      t: "내 종목과 이어진\n밤사이 뉴스를 요약해요",
      d: "거래처·경쟁사 소식까지 골라\nAI가 한국어로 짧게 정리해요.",
    },
    {
      v: (
        <div className="sv-card">
          <p className="sv-h">오늘 시가 예상 · 08:11</p>
          <div className="sv-body">
          <p className="sv-big">+153,500원<small>+0.45%</small></p>
          <svg viewBox="0 0 280 26" width="100%" height="26" aria-hidden>
            <line x1={2} x2={278} y1={13} y2={13} stroke="#c9d0d2" strokeWidth={2} strokeLinecap="round" />
            <rect x={74} y={9} width={124} height={8} rx={4} fill="#ffd970" />
            <line x1={130} x2={130} y1={4} y2={22} stroke="#8a9598" strokeWidth={1.2} />
            <Ring x={139} k={1} /><Ring x={171} k={2} />
          </svg>
          <p className="sv-row2"><span>SK하이닉스 ① 06:30 <b style={{ color: UP }}>+0.4%</b></span><span>② 08:11 <b style={{ color: UP }}>+2.0%</b></span></p>
          </div>
        </div>
      ),
      t: "오늘 시가에\n내 계좌는 얼마나?",
      d: "06:30에 예상 시가와 범위를,\n08:11에 장전 가격으로 한 번 더.",
    },
    {
      v: (
        <div className="sv-card">
          <p className="sv-h">그날의 적중률 · 09:00 실제 시가</p>
          <div className="sv-body">
          <p className="sv-score">9 / 10<small>범위 안에서 시작</small></p>
          <p className="sv-r"><span>SK하이닉스</span><b style={{ color: UP }}>+2.2% ✓</b></p>
          <p className="sv-r"><span>셀트리온</span><b style={{ color: DN }}>−0.7% ✓</b></p>
          <p className="sv-r"><span>유한양행</span><b style={{ color: DN }}>−1.4% ✕</b></p>
          </div>
        </div>
      ),
      t: "예상은\n얼마나 맞았을까?",
      d: "9시 실제 시가로 종목마다 예상 범위 안에서\n시작했는지 확인하고 기록해요.",
    },
  ];
}

export function Intro({ spark }: { spark: string }) {
  const S = Slides(spark), n = S.length;
  const [i, setI] = useState(0);
  const s = S[i];
  let x0 = 0;
  return (
    <div className="intro sv" onTouchStart={(e) => { x0 = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - x0; if (dx < -40) setI(Math.min(n - 1, i + 1)); if (dx > 40) setI(Math.max(0, i - 1)); }}>
      <button type="button" className="sv-vis" aria-label="다음 소개" onClick={() => setI((i + 1) % n)} key={i}>{s.v}</button>
      <h1>{s.t}</h1>
      <p className="lead">{s.d}</p>
      <div className="idots">{S.map((_, k) => <button key={k} type="button" aria-label={`${k + 1}번째 소개`} className={k === i ? "on" : ""} onClick={() => setI(k)} />)}</div>
    </div>
  );
}
