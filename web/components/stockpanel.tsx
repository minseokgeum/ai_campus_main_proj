"use client";
// 종목 창 안쪽(피그마 400:5083 종목 창, 462:8998 처음 안내, 572:7057·572:7244 수량 바꿈):
// 수량 −/+·되돌리기(목록이 기억, 실제 주문 없음), 점 끌어 "이 가격이면?" 가정, 예수금·필요 현금.
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

const MINUS = "−";
export const pctText = (v: number) => { const r = Math.round(v * 10000) / 100; return r === 0 ? "0.00%" : `${r > 0 ? "+" : MINUS}${Math.abs(r).toFixed(2)}%`; };
export const swonText = (v: number) => { const r = Math.round(v); return `${r > 0 ? "+" : r < 0 ? MINUS : ""}${Math.abs(r).toLocaleString("ko-KR")}원`; };
export const wonText = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;
export const colorOf = (v: number) => (v > 0 ? "#d35d66" : v < 0 ? "#4c6fc3" : "#8a9598");

export type PanelStock = {
  code: string; name: string; qty: number; pc: number; h: number; l80: number; u80: number; l90: number; u90: number;
  nxtG: number | null; y: number | null; open: number | null; avg?: number | null;
  adj?: [number, number] | null;   // 08:11 보정 범위(lib/trust.ts). 있으면 h는 보정 예상 시가이고, 노란 띠는 07:30 예상 범위 그대로
  h0730?: number | null;           // 07:30 예상 시가(보정 전 위치를 회색 점으로)
};

/** qty·setQty는 목록(NightBoard)이 쥐고 있다. acctAmount·acctValue는 바뀐 수량까지 넣은 계좌 값 */
export function StockPanel({ s, icon, phase, qty, setQty, acctAmount, acctValue }: {
  s: PanelStock; icon: ReactNode; phase: "pre" | "post"; qty: number; setQty: (q: number) => void; acctAmount: number; acctValue: number;
}) {
  const [what, setWhat] = useState<number | null>(null);
  const [hint, setHint] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem("hint-drag") !== "1") setHint(true); } catch { /* 저장소 없으면 안내 생략 */ }
  }, []);
  useEffect(() => setWhat(null), [s.code]);
  const closeHint = () => { setHint(false); try { localStorage.setItem("hint-drag", "1"); } catch { /* 무시 */ } };

  const base = phase === "post" && s.y != null ? s.y : s.h;
  const r = what ?? base;
  // 장후 금액은 수량 × (실제 시가 − 어제 종가)(2026-11-24, 등락률 y는 잘린 값). 계산은 정확히, 표시할 때만 1원 반올림
  const exact = phase === "post" && s.y != null && s.open != null;
  const per = (q: number) => (exact ? q * (s.open! - s.pc) : q * s.pc * base);
  const amountNow = per(qty);
  const amount = what == null ? amountNow : qty * s.pc * r;
  const acct = acctAmount - amountNow + amount;
  const acctPct = acctValue > 0 ? acct / acctValue : 0;
  const dq = qty - s.qty;
  const price = what == null && exact ? s.open! : s.pc * (1 + r);
  const base0 = s.avg ? s.avg / s.pc - 1 : null;   // 평단을 어제 종가 대비 %로(띠 위 '내 기준선')

  const adj = phase === "pre" ? s.adj ?? null : null;
  const m = Math.max(0.01, Math.abs(s.l90), Math.abs(s.u90), Math.abs(base), Math.abs(s.nxtG ?? 0), Math.abs(adj?.[0] ?? 0), Math.abs(adj?.[1] ?? 0)) * 1.2;
  const W = 342, pad = 10, X = (v: number) => pad + ((v + m) / (2 * m)) * (W - 2 * pad);
  const nxt = phase === "pre" ? s.nxtG : null;
  // 08:10 라벨과 띠 양 끝 %가 겹치면 %를 바깥쪽으로 비킨다
  const lx = nxt != null && Math.abs(X(s.l80) - X(nxt)) < 34 ? Math.max(18, X(nxt) - 34) : X(s.l80);
  const ux = nxt != null && Math.abs(X(s.u80) - X(nxt)) < 34 ? Math.min(W - 18, X(nxt) + 34) : X(s.u80);
  const svg = useRef<SVGSVGElement>(null);
  const drag = (clientX: number) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const x = ((clientX - box.left) / box.width) * W;
    const v = ((x - pad) / (W - 2 * pad)) * 2 * m - m;
    setWhat(Math.max(-m, Math.min(m, Math.round(v * 1000) / 1000)));
  };

  return (
    <div className="panel">
      <div className="pacct">
        <span>계좌 예상 <b className="amt tot" style={{ color: colorOf(acct) }}>{swonText(acct)}</b> <small style={{ color: colorOf(acct) }}>{pctText(acctPct)}</small></span>
        <span className="r">{dq !== 0 ? <b className="teal">수량 바꿔서 <span className="amt">{swonText(per(qty - s.qty))}</span></b> : <>이 종목 <b className="amt">{swonText(amount)}</b></>}</span>
      </div>
      {dq !== 0 ? (
        <div className="cash">
          <div><b>{dq < 0 ? "예수금" : "필요 현금"}</b><span className="amt">{dq < 0 ? "+" : ""}{wonText(Math.abs(dq) * s.pc * (1 + base))}</span></div>
          <p>{Math.abs(dq)}주를 오늘 {phase === "post" ? "시가" : "예상 시가"}에 {dq < 0 ? "판다고" : "산다고"} 가정했어요. 실제 주문은 나가지 않아요.</p>
        </div>
      ) : null}

      <div className="qrow">
        {icon}
        <span className="ql"><b>{s.name}</b><span>{dq !== 0 ? <span className="teal">{qty}주로 계산 중</span> : s.qty ? `보유 ${s.qty.toLocaleString("ko-KR")}주` : "관심 종목"}</span></span>
        {dq !== 0 ? <button type="button" className="rst" aria-label="원래 수량으로" onClick={() => setQty(s.qty)}>↺</button> : null}
        <button type="button" aria-label="1주 줄이기" onClick={() => setQty(Math.max(0, qty - 1))}>−</button>
        <b className="qn">{qty}주</b>
        <button type="button" aria-label="1주 늘리기" onClick={() => setQty(qty + 1)}>+</button>
      </div>

      <p className="slabel">{what != null ? "이 가격이면?" : phase === "post" ? "오늘 실제 시가" : adj ? "오늘 예상 시가 · 08:11 2차 예측" : "오늘 예상 시가 범위"}</p>
      <div className="sbig" style={{ color: colorOf(r) }}>
        <b>{pctText(r)}</b>
        <span>{what != null ? `가정 ${wonText(price)}` : phase === "post" && s.open ? `시가 ${wonText(s.open)}` : `예상 ${wonText(price)}`} · 어제 {wonText(s.pc)}</span>
        {what != null ? <button type="button" className="back" onClick={() => setWhat(null)}>예상으로</button> : null}
      </div>

      <div className="dragwrap">
        {hint ? (
          <div className="draghint" role="dialog">
            <b>점을 끌어서 &quot;이 가격이면?&quot;을 가정해 볼 수 있어요</b>
            <p>끌면 아래 예상 금액과 계좌 예상이 바로 바뀌어요. 실제 주문은 나가지 않아요.</p>
            <button type="button" onClick={closeHint}>좋아요</button>
          </div>
        ) : null}
        <svg ref={svg} width="100%" viewBox={`0 0 ${W} 60`} className="dragband" role="slider" aria-label="가정할 시가 변화" aria-valuenow={Math.round(r * 10000) / 100}
          tabIndex={0} onKeyDown={(e) => { if (e.key === "ArrowLeft") setWhat(Math.max(-m, r - 0.001)); if (e.key === "ArrowRight") setWhat(Math.min(m, r + 0.001)); }}
          onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag(e.clientX); closeHint(); }}
          onPointerMove={(e) => { if (e.buttons) drag(e.clientX); }}>
          <text x={X(0)} y={10} textAnchor="middle" fontSize={10} fill="#66777a">어제 종가</text>
          <rect x={pad} y={23} width={W - 2 * pad} height={8} rx={4} fill="#eef1f2" />
          <rect x={X(s.l80)} y={21} width={Math.max(3, X(s.u80) - X(s.l80))} height={12} rx={6} fill="#FFD970" />
          {adj ? <rect x={X(adj[0])} y={18} width={Math.max(3, X(adj[1]) - X(adj[0]))} height={18} rx={7} fill="none" stroke="#008c82" strokeWidth={1.6} /> : null}
          {adj && s.h0730 != null && what == null ? <circle cx={X(s.h0730)} cy={27} r={3.5} fill="#b8c0c3" /> : null}
          {/* 세로선 셋을 색·모양으로 구분(배포용 변경 기록 12·05): 어제 종가 회색 점선, 평단 청록 실선, 08:10 실제 거래 빨간 실선 */}
          <line x1={X(0)} x2={X(0)} y1={15} y2={39} stroke="#8a9598" strokeWidth={1.5} strokeDasharray="3 3" />
          {base0 != null && Math.abs(base0) <= m ? <>
            <rect x={X(base0) - 1} y={15} width={2} height={22} fill="#008c82" />
            <text x={Math.abs(X(base0) - X(0)) < 44 ? X(base0) + (base0 >= 0 ? 4 : -4) : X(base0)} y={10} textAnchor={Math.abs(X(base0) - X(0)) < 44 ? (base0 >= 0 ? "start" : "end") : "middle"} fontSize={10} fontWeight={700} fill="#008c82">평단</text>
          </> : base0 != null ? (
            <text x={base0 < 0 ? pad : W - pad} y={10} textAnchor={base0 < 0 ? "start" : "end"} fontSize={10} fontWeight={700} fill="#008c82">{base0 < 0 ? `◀ 평단 ${pctText(base0)}` : `평단 ${pctText(base0)} ▶`}</text>
          ) : null}
          {nxt != null ? <><rect x={X(nxt) - 1} y={16} width={2} height={22} fill="#d35d66" /><text x={X(nxt)} y={49} textAnchor="middle" fontSize={10} fontWeight={700} fill="#d35d66">08:10</text></> : null}
          {what != null ? <circle cx={X(base)} cy={27} r={4} fill="#b8c0c3" /> : null}
          <circle cx={X(r)} cy={27} r={what != null ? 9 : 6} fill={what != null ? "rgba(0,140,130,.25)" : "#2f3437"} stroke={what != null ? "#008c82" : "#fff"} strokeWidth={2} />
          <text x={lx} y={54} textAnchor="middle" fontSize={11} fill={colorOf(s.l80)}>{pctText(s.l80)}</text>
          <text x={ux} y={54} textAnchor="middle" fontSize={11} fill={colorOf(s.u80)}>{pctText(s.u80)}</text>
        </svg>
      </div>

      <p className="blegend"><span><i className="ldot" />{adj ? "08:11 2차 예측" : "모델 예상"}</span>{nxt != null ? <span><i className="lnxt" />08:10 실제 거래</span> : null}{adj ? <span>노란 띠 07:30 범위 · 청록 테두리 2차 예측 범위</span> : null}</p>
      {s.avg ? (
        <div className="avgline"><span>평단 <span className="avgwon">{wonText(s.avg)} </span>대비</span>
          <b><span style={{ color: colorOf(s.pc * (1 + s.l80) / s.avg - 1) }}>{pctText(s.pc * (1 + s.l80) / s.avg - 1)}</span> ~ <span style={{ color: colorOf(s.pc * (1 + s.u80) / s.avg - 1) }}>{pctText(s.pc * (1 + s.u80) / s.avg - 1)}</span></b></div>
      ) : s.qty > 0 ? (
        <div className="avgline ask"><span>평단을 넣으면 내 기준선을 함께 볼 수 있어요</span><Link href={`/mine/${s.code}/edit`}>평단 넣기 ›</Link></div>
      ) : null}

      <div className="samt">
        <span>{what != null ? "이 가격일 때 금액 변화" : phase === "post" ? "실제 금액 변화" : "예상 금액 변화"}</span>
        <b className="amt" style={{ color: colorOf(amount) }}>{swonText(amount)}</b>
        <small>({qty.toLocaleString("ko-KR")}주 기준)</small>
      </div>
    </div>
  );
}
