"use client";
// 밤사이 종목 창 계산기(2026-11-26 사용자 요청): 수량 −/+를 바꾸거나 노란 띠를 눌러·끌어 가격을 고르면, 종목 창 위 빈 곳으로 위에서 내려온다.
// 같은 날 사용자 결정으로 하나의 모양으로 통일: 수량이든 가격이든 바꿔 본 종목이 한 줄씩 쌓이고(지금 보는 종목은 ▶ 청록), 아래에 합계와 계좌 손익.
//  · 종목 줄: 원래 수량 → 바꾼 수량(그대로면 'n주 그대로') · 가정 가격(띠에서 고른 가격 / 예상 시가 / 장전 거래 기준 / 실제 시가) · 필요한 돈 또는 들어올 돈
//  · 합계: 바꾼 수량 × 가정 가격의 합(+면 필요한 돈, −면 들어올 돈). 예수금은 받지 않는다(사용자 결정: 필요 금액만), 수수료·세금 제외
//  · 계좌 오늘 손익: 바꾼 수량·고른 가격으로 다시 센 값과 원래 값
//  · 옆 종목으로 넘겨도 바꾼 것이 있으면 계속 떠 있고, '↺ 모두 되돌리기'를 누르면 모든 종목 수량·고른 가격이 원래대로. 밤사이 종목 창에서만 쓴다
// 가정 가격은 한국거래소 호가 단위로 맞춘다(lib/tick.ts, 다른 화면 금액과 같은 규칙)
import { useLayoutEffect, useRef } from "react";

const MINUS = "−";
const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;
const swon = (v: number) => { const r = Math.round(v); return `${r > 0 ? "+" : r < 0 ? MINUS : ""}${Math.abs(r).toLocaleString("ko-KR")}원`; };
const tone = (v: number) => (v > 0 ? "#d35d66" : v < 0 ? "#4c6fc3" : "#8a9598");

export type CalcRow = { code: string; name: string; q0: number; q: number; price: number; label: string; cur: boolean };

export function CalcDrop({ rows, pnlNow, pnlOrig, onReset }: { rows: CalcRow[]; pnlNow: number; pnlOrig: number; onReset: () => void }) {
  const MAX = 3;
  // 계산기 아래끝 + 10px를 종목 창 위끝으로(CSS --calc-b): 줄 수가 늘어도 종목 창과 겹치지 않게
  const box = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = box.current, root = document.documentElement;
    if (!el) return;
    const set = () => root.style.setProperty("--calc-b", `${el.offsetTop + el.offsetHeight + 10}px`);   // 내려오는 움직임(transform)과 상관없는 제자리 기준
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty("--calc-b"); };
  }, []);
  const list = [...rows.filter((r) => r.cur), ...rows.filter((r) => !r.cur)];   // 지금 보는 종목을 맨 위에
  const cash = rows.reduce((a, r) => a + (r.q - r.q0) * r.price, 0);
  return (
    <section ref={box} className="calcdrop" role="status" aria-live="polite" onClick={(e) => e.stopPropagation()}>
      <div className="cd-h"><b>바꿔 본 계산 · {rows.length}종목</b><button type="button" onClick={onReset}>↺ 모두 되돌리기</button></div>
      <ul>{list.slice(0, MAX).map((r) => {
        const dq = r.q - r.q0;
        return (
          <li key={r.code} className={r.cur ? "on" : ""}>
            <span className="cd-n">{r.cur ? "▶ " : ""}{r.name}</span>
            <span className="cd-d">{dq ? `${r.q0.toLocaleString("ko-KR")} → ${r.q.toLocaleString("ko-KR")}주` : `${r.q.toLocaleString("ko-KR")}주 그대로`} · {r.label} {won(r.price)}</span>
            <span className="cd-v">{dq > 0 ? `필요 ${won(dq * r.price)}` : dq < 0 ? `들어올 ${won(-dq * r.price)}` : "—"}</span>
          </li>
        );
      })}</ul>
      {list.length > MAX ? <p className="cd-more">외 {list.length - MAX}종목</p> : null}
      <p className="cd-sum"><span>합계</span><b>{cash > 0 ? `필요한 돈 ${won(cash)}` : cash < 0 ? `들어올 돈 ${won(-cash)}` : "사고파는 돈 없음"}</b></p>
      <p className="cd-row"><span>바꾼 대로 계좌 오늘 손익</span><b style={{ color: tone(pnlNow) }}>{swon(pnlNow)}</b><small>(원래 {swon(pnlOrig)})</small></p>
      <p className="cd-note">수수료·세금 제외 · 실제 주문은 나가지 않아요</p>
    </section>
  );
}
