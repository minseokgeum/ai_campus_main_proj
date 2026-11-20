"use client";
// 미국시장 지표 차트(피그마 230:181): 정규장 5분봉, 전일 종가 점선, 고·저 표시. 누르거나 끌면 그 시점의 값이 보인다.
import { useState } from "react";

export function UsChart({ points, prev, digits }: { points: { t: string; p: number }[]; prev: number; digits: number }) {
  const [k, setK] = useState<number | null>(null);
  if (points.length < 2) return <p className="fine">5분봉 자료가 아직 없어요.</p>;
  const W = 342, H = 150, ps = points.map((x) => x.p);
  const lo = Math.min(prev, ...ps), hi = Math.max(prev, ...ps), span = hi - lo || 1;
  const X = (i: number) => (i / (points.length - 1)) * W, Y = (v: number) => 8 + (1 - (v - lo) / span) * (H - 16);
  const up = ps[ps.length - 1] >= prev;
  const line = points.map((x, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(x.p).toFixed(1)}`).join("");
  const iHi = ps.indexOf(Math.max(...ps)), iLo = ps.indexOf(Math.min(...ps));
  const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const et = (t: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(t));
  const pick = (clientX: number, el: Element) => {
    const b = el.getBoundingClientRect();
    setK(Math.max(0, Math.min(points.length - 1, Math.round(((clientX - b.left) / b.width) * (points.length - 1)))));
  };
  const y0 = Y(prev), area = `${line}L${X(points.length - 1).toFixed(1)},${y0.toFixed(1)}L0,${y0.toFixed(1)}Z`;
  const id = `us${Math.round(prev * 100) % 100000}`;
  const anchor = (x: number) => (x < 60 ? "start" : x > W - 60 ? "end" : "middle");
  return (
    <div className="uschart">
      {k != null ? <p className="uspick"><b>{fmt(points[k].p)}</b> {et(points[k].t)} (미 동부)</p> : null}
      {/* 전일 종가 위는 빨강, 아래는 파랑(피그마 230:467). 고·저와 전일 값은 그래프 위에 */}
      <svg width="100%" viewBox={`0 -14 ${W} ${H + 28}`} style={{ touchAction: "none", display: "block" }}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)} onPointerMove={(e) => e.buttons && pick(e.clientX, e.currentTarget)}>
        <defs>
          <clipPath id={`${id}u`}><rect x={0} y={-14} width={W} height={y0 + 14} /></clipPath>
          <clipPath id={`${id}d`}><rect x={0} y={y0} width={W} height={H + 14 - y0} /></clipPath>
        </defs>
        <path d={area} fill="rgba(211,93,102,.10)" clipPath={`url(#${id}u)`} />
        <path d={area} fill="rgba(76,111,195,.10)" clipPath={`url(#${id}d)`} />
        <line x1={0} x2={W} y1={y0} y2={y0} stroke="#b8c0c3" strokeDasharray="3 3" />
        <path d={line} fill="none" stroke="#d35d66" strokeWidth={1.6} clipPath={`url(#${id}u)`} />
        <path d={line} fill="none" stroke="#4c6fc3" strokeWidth={1.6} clipPath={`url(#${id}d)`} />
        <circle cx={X(points.length - 1)} cy={Y(ps[ps.length - 1])} r={3} fill={up ? "#d35d66" : "#4c6fc3"} />
        <text x={W} y={y0 - 5} textAnchor="end" fontSize={10} fill="#66777a">전일 {fmt(prev)}</text>
        {ps[iHi] > prev ? <text x={X(iHi)} y={Y(ps[iHi]) - 6} textAnchor={anchor(X(iHi))} fontSize={10} fill="#45555a">고 {fmt(ps[iHi])}</text> : null}
        {ps[iLo] < prev ? <text x={X(iLo)} y={Y(ps[iLo]) + 14} textAnchor={anchor(X(iLo))} fontSize={10} fill="#45555a">저 {fmt(ps[iLo])}</text> : null}
        {k != null ? <line x1={X(k)} x2={X(k)} y1={-14} y2={H + 14} stroke="#192d31" strokeWidth={1} /> : null}
      </svg>
      <div className="usax"><span>09:30</span><span>12:00</span><span>16:00 (미 동부)</span></div>
    </div>
  );
}
