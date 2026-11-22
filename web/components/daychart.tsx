// 종목 상세 '1일' 그래프(2026-11-22): 가로축은 그날 개장~마감 고정(장중이면 지금까지만 선이 그려짐).
// 모양은 1주·1달 그래프와 같다: 선 하나(전 거래일 종가보다 위면 빨강·아래면 파랑), 같은 옅은 바탕, 평단 점선(그날 가격 범위 근처일 때만), 마지막 가격에 점. 선은 5분마다 한 점.
// 1일에만 전 거래일 종가를 옅은 점선으로 둔다(등락률 기준). 자료는 lib/prices.ts intraday().
import type { Intraday } from "@/lib/prices";
import { signColor } from "@/components/model";

const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

// 1분봉은 호가 단위 때문에 계단처럼 꺾여서 5분마다 한 점(그 5분의 마지막 가격)으로 그린다. 첫 점과 마지막(지금) 점은 늘 넣는다
function points(d: Intraday) {
  const by5 = new Map<number, Intraday["points"][number]>();
  for (const p of d.points) by5.set(Math.floor(p.m / 5), p);
  return [d.points[0], ...[...by5.values()].filter((p) => p !== d.points[0])];
}

/** 평단을 그래프 안에 그릴 수 있나: 넣어도 하루 움직임이 그림의 35%보다 납작해지지 않으면 "in", 아니면 평단이 그날 가격보다 위("top")·아래("bottom").
 *  "top"·"bottom"이면 선을 그리지 않고 그래프 아래 '내 평단' 줄에 글로만 적는다(2026-11-22: 끝에 붙여 그리면 전 거래일 종가 선과 겹쳐 점선 두 개로 보였음) */
export function avgPlace(d: Intraday, avg: number | null): "in" | "top" | "bottom" | null {
  if (avg == null || !d.points.length) return null;
  const prices = points(d).map((p) => p.p), base = d.prev ?? prices[0];
  const lo0 = Math.min(base, ...prices), hi0 = Math.max(base, ...prices);
  const wLo = Math.min(lo0, avg), wHi = Math.max(hi0, avg);
  return (hi0 - lo0 || base * 0.01) / (wHi - wLo) >= 0.35 ? "in" : avg > hi0 ? "top" : "bottom";
}

export function DayChart({ d, avg }: { d: Intraday; avg: number | null }) {
  const W = 342, H = 140;
  const span = Math.max(1, mins(d.closeAt) - mins(d.openAt));
  const pts = points(d);
  const prices = pts.map((p) => p.p);
  const base = d.prev ?? prices[0];
  let lo = Math.min(base, ...prices), hi = Math.max(base, ...prices);
  const avgY = avgPlace(d, avg);
  if (avgY === "in") { lo = Math.min(lo, avg!); hi = Math.max(hi, avg!); }
  const pad = (hi - lo || base * 0.01) * 0.08;
  lo -= pad; hi += pad;
  const X = (m: number) => (Math.max(0, Math.min(span, m)) / span) * W;
  const Y = (v: number) => (1 - (v - lo) / (hi - lo)) * H;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p.m).toFixed(1)},${Y(p.p).toFixed(1)}`).join("");
  const x0 = X(pts[0].m), x1 = X(pts[pts.length - 1].m);
  const lastP = pts[pts.length - 1].p;
  const color = signColor(lastP / base - 1);
  const ay = avgY === "in" ? Y(avg!) : null;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pchart" role="img"
      aria-label={`${d.day.slice(4, 6)}월 ${d.day.slice(6)}일 ${d.openAt}부터 ${pts[pts.length - 1].hhmm}까지 가격`}>
      <path d={`${line}L${x1.toFixed(1)},${H}L${x0.toFixed(1)},${H}Z`} fill="rgba(211,93,102,.08)" />
      <line x1={0} x2={W} y1={Y(base)} y2={Y(base)} stroke="#d8dfe0" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      {ay != null ? <line x1={0} x2={W} y1={ay} y2={ay} stroke="#8a9598" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" /> : null}
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x1} cy={Y(lastP)} r={3.5} fill={color} stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
