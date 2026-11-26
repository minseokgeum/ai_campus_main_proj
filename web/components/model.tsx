// 밤사이 화면 부품: 목록의 작은 범위 띠(BandMini), 야간선물 흐름 차트(NightChart), 오름·내림 색(signColor). 피그마 '밤사이 v4'(448:6559 · 400:5083 · 410:6525)를 데이터로 그린다.
// 띠 색은 피그마 지금 값 #FFD970(저채도 시안 A·B는 결정 전). 오름 빨강 #d35d66 · 내림 파랑 #4c6fc3.
import type { Night } from "@/lib/model";

const BAND = "#FFD970";
const UP = "#d35d66", DOWN = "#4c6fc3", FLAT = "#8a9598";
export const signColor = (v: number) => (v > 0 ? UP : v < 0 ? DOWN : FLAT);

function scale(vals: number[], w: number, pad: number) {
  const m = Math.max(0.01, ...vals.map((v) => Math.abs(v))) * 1.15;
  return (v: number) => pad + ((v + m) / (2 * m)) * (w - 2 * pad);
}

/** 목록 줄의 64×14 띠: 회색 선, 노란 80% 범위, 어제 종가 회색 점선, 08:10 실제 거래 빨간 세로선(라벨 없음), 점(장전: 예상 시가 · 장후: 실제 시가). 배포용 변경 기록 12 */
/** 목록 작은 띠(2026-11-26 사용자 결정: 노란 띠와 같은 색 규칙, 폭이 좁아 지금 값 하나만): 06:30 첫 예상 = 진회색 점 · 08:11 2차 예상 = 청록 점 · 장후 실제 시가 = 속 빈 빨간 원.
 *  예전 빨간 세로 선(2차 예상)은 '빨강 = 실제 시가' 규칙과 어긋나서 없앰 */
export function BandMini({ l, u, dot, kind = "pre" }: { l: number; u: number; dot: number; kind?: "pre" | "nxt" | "post" }) {
  const w = 64, h = 14, x = scale([l, u, dot], w, 4);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="bandmini">
      <line x1={2} x2={w - 2} y1={7} y2={7} stroke="#e4ebeb" strokeWidth={2} strokeLinecap="round" />
      <rect x={x(l)} y={3} width={Math.max(2, x(u) - x(l))} height={8} rx={4} fill={BAND} />
      <line x1={x(0)} x2={x(0)} y1={1} y2={13} stroke="#8a9598" strokeWidth={1.2} strokeDasharray="2 1.5" />
      {kind === "post" ? <circle cx={x(dot)} cy={7} r={3.6} fill="#fff" stroke="#e5484d" strokeWidth={2.2} />
        : <circle cx={x(dot)} cy={7} r={4} fill={kind === "nxt" ? "#2e8a7e" : "#2f3437"} stroke="#fff" strokeWidth={1.5} />}
    </svg>
  );
}

/** 야간선물 흐름(18:00 ~ 06:00, 전일 주간 종가 대비). 23:30 미국 개장 표시 */
export function NightChart({ night, h = 62, detail }: { night: Night; h?: number; detail?: boolean }) {
  // 어제 마감(0%) 위는 빨강, 아래는 파랑으로 나눠 칠한다(피그마 363:2 · 야간선물 카드). detail이면 고·저와 어제 마감 값을 그래프 위에 적는다
  // 2026-11-25 사용자 결정(종목 상세 그래프와 같은 모양): 바탕은 가격선에서 바닥까지 칠하고 진하기는 색과 상관없이 위에서 아래로 한 번에 옅어진다
  //   (예전엔 어제 마감선과 가격선 사이를 칠해서 내린 날엔 위에서 매달린 모양이었다). 선 색은 0%를 지나는 점을 계산해 위·아래 조각을 따로 그린다
  //   (잘라 그리기는 굵기 고정 선과 함께 쓰면 Safari에서 선 일부가 사라졌다)
  const w = 310, pts = night.points;
  if (!pts.length) return <p className="fine">야간선물 1분봉이 아직 없어요.</p>;
  const top = detail ? 22 : 4, bot = detail ? 22 : 4;
  const lo = Math.min(0, ...pts.map((p) => p.r)), hi = Math.max(0, ...pts.map((p) => p.r));
  const span = hi - lo || 0.001;
  const X = (m: number) => (m / 720) * w, Y = (r: number) => top + (1 - (r - lo) / span) * (h - top - bot);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p.m).toFixed(1)},${Y(p.r).toFixed(1)}`).join("");
  const y0 = Y(0), x1 = X(pts[pts.length - 1].m), xs = X(pts[0].m);
  const area = `${d}L${x1.toFixed(1)},${h}L${xs.toFixed(1)},${h}Z`;
  const yTop = Math.min(...pts.map((p) => Y(p.r)));
  const cut = Math.max(0, Math.min(1, y0 / h));
  const at = (m: number, r: number) => `${X(m).toFixed(1)},${Y(r).toFixed(1)}`;
  const seg = { u: [] as string[], d: [] as string[] };
  let side: "u" | "d" | null = null;
  const push = (sd: "u" | "d", a: string, b: string) => { if (side !== sd) seg[sd].push(`M${a}`); seg[sd].push(`L${b}`); side = sd; };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], sa = a.r >= 0 ? "u" : "d", sb = b.r >= 0 ? "u" : "d";
    if (sa === sb) { push(sa, at(a.m, a.r), at(b.m, b.r)); continue; }
    const cm = a.m + (b.m - a.m) * ((0 - a.r) / (b.r - a.r));   // 0%를 지나는 점
    push(sa, at(a.m, a.r), at(cm, 0)); push(sb, at(cm, 0), at(b.m, b.r));
  }
  if (pts.length === 1) seg[pts[0].r >= 0 ? "u" : "d"].push(`M${at(pts[0].m, pts[0].r)}`);
  const id = `nc${Math.round(h)}${detail ? "d" : ""}`;
  const pHi = pts.reduce((a, p) => (p.r > a.r ? p : a), pts[0]), pLo = pts.reduce((a, p) => (p.r < a.r ? p : a), pts[0]);
  const lv = (r: number) => (night.dayClose * (1 + r)).toFixed(2);
  const hm = (m: number) => { const t = (18 * 60 + m) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
  const anchor = (x: number) => (x < 60 ? "start" : x > w - 60 ? "end" : "middle");
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio={detail ? "xMidYMid meet" : "none"} role="img" aria-label="야간선물 흐름" className="nchart">
      <defs>
        <linearGradient id={`${id}s`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={h}>
          <stop offset={cut} stopColor="#d35d66" /><stop offset={cut} stopColor="#4c6fc3" />
        </linearGradient>
        <linearGradient id={`${id}g`} x1={0} y1={0} x2={0} y2={1}>
          <stop offset={0} stopColor="#fff" stopOpacity={0.18} /><stop offset={1} stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x={0} y={0} width={w} height={h}>
          <rect x={0} y={yTop} width={w} height={Math.max(1, h - yTop)} fill={`url(#${id}g)`} />
        </mask>
      </defs>
      <path d={area} fill={`url(#${id}s)`} mask={`url(#${id}m)`} />
      <line x1={0} x2={w} y1={y0} y2={y0} stroke="#b8c0c3" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      {detail ? null : <line x1={X(330)} x2={X(330)} y1={0} y2={h} stroke="#e4ebeb" vectorEffect="non-scaling-stroke" />}
      {seg.u.length ? <path d={seg.u.join("")} fill="none" stroke="#d35d66" strokeWidth={1.6} vectorEffect="non-scaling-stroke" /> : null}
      {seg.d.length ? <path d={seg.d.join("")} fill="none" stroke="#4c6fc3" strokeWidth={1.6} vectorEffect="non-scaling-stroke" /> : null}
      {detail ? <>
        <circle cx={x1} cy={Y(pts[pts.length - 1].r)} r={3} fill={signColor(pts[pts.length - 1].r)} />
        <text x={w} y={y0 - 5} textAnchor="end" fontSize={10} fill="#66777a">어제 마감 {night.dayClose.toFixed(2)}</text>
        {pHi.r > 0 ? <text x={X(pHi.m)} y={Y(pHi.r) - 6} textAnchor={anchor(X(pHi.m))} fontSize={10} fill="#45555a">고 {lv(pHi.r)} · {hm(pHi.m)}</text> : null}
        {pLo.r < 0 ? <text x={X(pLo.m)} y={Y(pLo.r) + 14} textAnchor={anchor(X(pLo.m))} fontSize={10} fill="#45555a">저 {lv(pLo.r)} · {hm(pLo.m)}</text> : null}
      </> : null}
    </svg>
  );
}
