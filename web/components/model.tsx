// 밤사이 화면 부품: 작은 범위 띠(목록), 큰 범위 띠(종목 창), 야간선물 흐름 차트. 피그마 '밤사이 v4'(448:6559 · 400:5083 · 410:6525)를 데이터로 그린다.
// 띠 색은 피그마 지금 값 #FFD970(저채도 시안 A·B는 결정 전). 오름 빨강 #d35d66 · 내림 파랑 #4c6fc3.
import type { Night } from "@/lib/model";

const BAND = "#FFD970";
const UP = "#d35d66", DOWN = "#4c6fc3", FLAT = "#8a9598";
export const signColor = (v: number) => (v > 0 ? UP : v < 0 ? DOWN : FLAT);

function scale(vals: number[], w: number, pad: number) {
  const m = Math.max(0.01, ...vals.map((v) => Math.abs(v))) * 1.15;
  return (v: number) => pad + ((v + m) / (2 * m)) * (w - 2 * pad);
}

/** 목록 줄의 64×14 띠: 회색 선, 노란 80% 범위, 0(어제 종가) 눈금, 점(장전: 예상 시가 · 장후: 실제 시가) */
export function BandMini({ l, u, dot, hollow }: { l: number; u: number; dot: number; hollow?: number | null }) {
  const w = 64, h = 14, x = scale([l, u, dot, hollow ?? 0], w, 4);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="bandmini">
      <line x1={2} x2={w - 2} y1={7} y2={7} stroke="#e4ebeb" strokeWidth={2} strokeLinecap="round" />
      <rect x={x(l)} y={3} width={Math.max(2, x(u) - x(l))} height={8} rx={4} fill={BAND} />
      <line x1={x(0)} x2={x(0)} y1={1} y2={13} stroke="#192d31" strokeWidth={1.2} />
      {hollow != null ? <circle cx={x(hollow)} cy={7} r={3} fill="#fff" stroke="#192d31" strokeWidth={1.2} /> : null}
      <circle cx={x(dot)} cy={7} r={3.5} fill="#192d31" />
    </svg>
  );
}

/** 종목 창의 큰 띠: 어제 종가 눈금과 80% 범위 양 끝 숫자 */
export function BandBar({ l, u, dot, nxt, label }: { l: number; u: number; dot: number; nxt?: number | null; label: (v: number) => string }) {
  const w = 342, x = scale([l, u, dot, nxt ?? 0], w, 8);
  return (
    <svg width="100%" viewBox={`0 0 ${w} 58`} role="img" aria-label={`예상 범위 ${label(l)} ~ ${label(u)}`} className="bandbar">
      <text x={x(0)} y={10} textAnchor="middle" fontSize={10} fill="#66777a">어제 종가</text>
      <rect x={8} y={22} width={w - 16} height={8} rx={4} fill="#eef1f2" />
      <rect x={x(l)} y={20} width={Math.max(3, x(u) - x(l))} height={12} rx={6} fill={BAND} />
      <line x1={x(0)} x2={x(0)} y1={14} y2={38} stroke="#192d31" strokeWidth={1.4} />
      {nxt != null ? <circle cx={x(nxt)} cy={26} r={5} fill="#fff" stroke="#192d31" strokeWidth={1.6} /> : null}
      <circle cx={x(dot)} cy={26} r={6} fill="#192d31" />
      <text x={x(l)} y={52} textAnchor="middle" fontSize={11} fill={signColor(l)}>{label(l)}</text>
      <text x={x(u)} y={52} textAnchor="middle" fontSize={11} fill={signColor(u)}>{label(u)}</text>
    </svg>
  );
}

/** 야간선물 흐름(18:00 ~ 06:00, 전일 주간 종가 대비). 23:30 미국 개장 표시 */
export function NightChart({ night, h = 62, detail }: { night: Night; h?: number; detail?: boolean }) {
  // 어제 마감(0%) 위는 빨강, 아래는 파랑으로 나눠 칠한다(피그마 363:2 · 야간선물 카드). detail이면 고·저와 어제 마감 값을 그래프 위에 적는다
  const w = 310, pts = night.points;
  if (!pts.length) return <p className="fine">야간선물 1분봉이 아직 없어요.</p>;
  const top = detail ? 22 : 4, bot = detail ? 22 : 4;
  const lo = Math.min(0, ...pts.map((p) => p.r)), hi = Math.max(0, ...pts.map((p) => p.r));
  const span = hi - lo || 0.001;
  const X = (m: number) => (m / 720) * w, Y = (r: number) => top + (1 - (r - lo) / span) * (h - top - bot);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p.m).toFixed(1)},${Y(p.r).toFixed(1)}`).join("");
  const y0 = Y(0), x1 = X(pts[pts.length - 1].m), xs = X(pts[0].m);
  const area = `${d}L${x1.toFixed(1)},${y0.toFixed(1)}L${xs.toFixed(1)},${y0.toFixed(1)}Z`;
  const id = `nc${Math.round(h)}${detail ? "d" : ""}`;
  const pHi = pts.reduce((a, p) => (p.r > a.r ? p : a), pts[0]), pLo = pts.reduce((a, p) => (p.r < a.r ? p : a), pts[0]);
  const lv = (r: number) => (night.dayClose * (1 + r)).toFixed(2);
  const hm = (m: number) => { const t = (18 * 60 + m) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
  const anchor = (x: number) => (x < 60 ? "start" : x > w - 60 ? "end" : "middle");
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio={detail ? "xMidYMid meet" : "none"} role="img" aria-label="야간선물 흐름" className="nchart">
      <defs>
        <clipPath id={`${id}u`}><rect x={0} y={0} width={w} height={y0} /></clipPath>
        <clipPath id={`${id}d`}><rect x={0} y={y0} width={w} height={h - y0} /></clipPath>
      </defs>
      <path d={area} fill="rgba(211,93,102,.10)" clipPath={`url(#${id}u)`} />
      <path d={area} fill="rgba(76,111,195,.10)" clipPath={`url(#${id}d)`} />
      <line x1={0} x2={w} y1={y0} y2={y0} stroke="#b8c0c3" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      {detail ? null : <line x1={X(330)} x2={X(330)} y1={0} y2={h} stroke="#e4ebeb" vectorEffect="non-scaling-stroke" />}
      <path d={d} fill="none" stroke="#d35d66" strokeWidth={1.6} vectorEffect="non-scaling-stroke" clipPath={`url(#${id}u)`} />
      <path d={d} fill="none" stroke="#4c6fc3" strokeWidth={1.6} vectorEffect="non-scaling-stroke" clipPath={`url(#${id}d)`} />
      {detail ? <>
        <circle cx={x1} cy={Y(pts[pts.length - 1].r)} r={3} fill={signColor(pts[pts.length - 1].r)} />
        <text x={w} y={y0 - 5} textAnchor="end" fontSize={10} fill="#66777a">어제 마감 {night.dayClose.toFixed(2)}</text>
        {pHi.r > 0 ? <text x={X(pHi.m)} y={Y(pHi.r) - 6} textAnchor={anchor(X(pHi.m))} fontSize={10} fill="#45555a">고 {lv(pHi.r)} · {hm(pHi.m)}</text> : null}
        {pLo.r < 0 ? <text x={X(pLo.m)} y={Y(pLo.r) + 14} textAnchor={anchor(X(pLo.m))} fontSize={10} fill="#45555a">저 {lv(pLo.r)} · {hm(pLo.m)}</text> : null}
      </> : null}
    </svg>
  );
}
