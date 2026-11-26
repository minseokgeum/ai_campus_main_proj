"use client";
// 종목 창 안쪽(피그마 400:5083 종목 창, 572:7057·572:7244 수량 바꿈, 2026-11-25 노란 띠 시안):
// 수량 −/+·되돌리기(목록이 기억, 실제 주문 없음), 노란 띠(components/yband: ①·② 번호 원과 실제 시가 표식 · 아래 세 칸 · 양 끝 금액 · 끌어 보기).
import Link from "next/link";
import { type ReactNode } from "react";
import { YBand } from "@/components/yband";
import { expAmt } from "@/lib/tick";

const MINUS = "−";
export const pctText = (v: number) => { const r = Math.round(v * 10000) / 100; return r === 0 ? "0.00%" : `${r > 0 ? "+" : MINUS}${Math.abs(r).toFixed(2)}%`; };
export const swonText = (v: number) => { const r = Math.round(v); return `${r > 0 ? "+" : r < 0 ? MINUS : ""}${Math.abs(r).toLocaleString("ko-KR")}원`; };
export const wonText = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;
export const colorOf = (v: number) => (v > 0 ? "#d35d66" : v < 0 ? "#4c6fc3" : "#8a9598");
const pct1 = (v: number) => { const r = Math.round(v * 1000) / 10; return `${r > 0 ? "+" : r < 0 ? MINUS : ""}${Math.abs(r).toFixed(1)}%`; };

export type PanelStock = {
  code: string; name: string; qty: number; pc: number; h: number; l80: number; u80: number; l90: number; u90: number;
  nxtG: number | null; y: number | null; open: number | null; avg?: number | null;
};

/** qty·setQty는 목록(NightBoard)이 쥐고 있다. acctAmount·acctValue는 바뀐 수량까지 넣은 계좌 값 */
export function StockPanel({ s, icon, phase, after0811 = false, qty, setQty, acctAmount, acctValue, status, onPick, clearKey, start }: {
  s: PanelStock; icon: ReactNode; phase: "pre" | "post"; after0811?: boolean; qty: number; setQty: (q: number) => void; acctAmount: number; acctValue: number;
  status?: ReactNode;   // 큰 숫자 아래 상태 한 줄(장전 방향 등급 · 띠 안/밖 · 실적 태그)
  onPick?: (v: number | null) => void; clearKey?: number; start?: number | null;   // start = 이 종목에서 전에 고른 값(옆 종목에서 돌아오면 손잡이를 그 자리에)   // 띠에서 고른 값 → 밤사이 계산기(components/calcdrop.tsx), 계산기 '되돌리기'로 손잡이 지우기
}) {
  const nxt = phase === "pre" ? s.nxtG : null;
  const base = phase === "post" && s.y != null ? s.y : nxt ?? s.h;
  // 장후 금액은 수량 × (실제 시가 − 어제 종가)(2026-11-24, 등락률 y는 잘린 값). 계산은 정확히, 표시할 때만 1원 반올림
  const exact = phase === "post" && s.y != null && s.open != null;
  const per = (q: number) => (exact ? q * (s.open! - s.pc) : expAmt(q, s.pc, base));   // 예상 가격은 호가 단위로 맞춰 셈(lib/tick.ts)
  const perPick = (q: number) => (start != null ? expAmt(q, s.pc, start) : per(q));   // 회색 칸 오른쪽: 계산기에서 띠로 고른 가격이 있으면 그 가격으로
  const amountNow = per(qty);
  const acct = acctAmount;
  const acctPct = acctValue > 0 ? acct / acctValue : 0;
  const dq = qty - s.qty;
  const base0 = s.avg ? s.avg / s.pc - 1 : null;   // 평단을 어제 종가 대비 %로(띠 위 청록 선과 '평단' 글씨)

  return (
    <div className="panel">
      <div className="pacct">
        <span>계좌 예상 <b className="amt tot" style={{ color: colorOf(acct) }}>{swonText(acct)}</b> <small style={{ color: colorOf(acct) }}>{pctText(acctPct)}</small></span>
        <span className="r">{dq !== 0 ? <b className="teal">수량 바꿔서 <span className="amt">{swonText(perPick(qty) - perPick(s.qty))}</span></b> : <>이 종목 <b className="amt">{swonText(perPick(qty))}</b></>}</span>
      </div>
      {/* 수량을 바꾸면 끼어 들던 '필요 현금 / 예수금' 칸은 위에서 내려오는 계산기로 옮김(2026-11-26, components/calcdrop.tsx) */}

      <div className="qrow">
        {icon}
        <span className="ql"><b>{s.name}</b><span>{dq !== 0 ? <span className="teal">{qty}주로 계산 중</span> : s.qty ? `보유 ${s.qty.toLocaleString("ko-KR")}주` : "관심 종목"}</span></span>
        {dq !== 0 ? <button type="button" className="rst" aria-label="원래 수량으로" onClick={() => setQty(s.qty)}>↺</button> : null}
        <button type="button" aria-label="1주 줄이기" onClick={() => setQty(Math.max(0, qty - 1))}>−</button>
        <b className="qn">{qty}주</b>
        <button type="button" aria-label="1주 늘리기" onClick={() => setQty(qty + 1)}>+</button>
      </div>

      {/* 2026-11-25 사용자 시안 '줄글 없는 버전': 큰 숫자 → 상태 한 줄 → 노란 띠(표식 · 아래 세 칸 · 양 끝 금액 · 끌어 보기). 범례·90% 문장·'이 가격이면?'은 아래 세 칸·'예상 범위 ?' 창·말풍선으로 */}
      <p className="slabel">{phase === "post" ? "실제 시작" : nxt != null ? "장전 거래 기준" : "예상 시작"}</p>
      <div className="sbig2"><b style={{ color: colorOf(base) }}>{pct1(base)}</b><span className="amt" style={{ color: colorOf(amountNow) }}>{swonText(amountNow)}</span></div>
      {status ? <p className="sstat">{status}</p> : null}
      <YBand name={s.name} l={s.l80} u={s.u80} h={s.h} nxt={s.nxtG} y={phase === "post" ? s.y : null} avg={base0} phase={phase === "post" && s.y != null ? "post" : nxt != null ? "nxt" : "pre"} after0811={after0811}
        qty={qty} pc={s.pc} l90={s.l90} u90={s.u90} play={phase !== "post"} onPick={onPick} clearKey={clearKey} start={start} bubble={false} />
      {s.avg ? (
        <div className="avgline"><span>평단 <span className="avgwon">{wonText(s.avg)} </span>대비</span>
          <b><span style={{ color: colorOf(s.pc * (1 + s.l80) / s.avg - 1) }}>{pctText(s.pc * (1 + s.l80) / s.avg - 1)}</span> ~ <span style={{ color: colorOf(s.pc * (1 + s.u80) / s.avg - 1) }}>{pctText(s.pc * (1 + s.u80) / s.avg - 1)}</span></b></div>
      ) : s.qty > 0 ? (
        <div className="avgline ask"><span>평단을 넣으면 내 기준선을 함께 볼 수 있어요</span><Link href={`/mine/${s.code}/edit`}>평단 넣기 ›</Link></div>
      ) : null}
    </div>
  );
}
