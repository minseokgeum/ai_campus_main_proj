// 종목 상세 가격 그래프. '1일'(2026-11-22)과 1주·1달·3달·1년(2026-11-24 같은 그림으로 모음)이 PriceLine 하나로 그린다.
// 선 색(2026-11-24): 평단이 있으면 평단 점선보다 위는 빨강·아래는 파랑으로 나눠 칠하고, 평단이 없으면 기간 등락률(1일은 전 거래일 종가 대비) 색 하나.
// 그리는 방식(2026-11-24, 증권 앱 기본형): 점을 곧은 선으로 잇고(둥글리기·곡선 없음), 바탕은 선 아래부터 바닥까지 선과 같은 색으로 아래로 갈수록 옅게.
// 바탕(2026-11-25): 선에서 바닥까지, 평단 위는 빨강 · 아래는 파랑, 옅어지는 정도는 색과 상관없이 위에서 아래로 한 번에. 평단 선은 청록 점선.
// 점 간격: 1일 1분봉 그대로, 1주 10분봉, 1달 30분봉, 3달·1년 일봉. 1주·1달은 봉 순서대로 같은 간격(밤·주말 건너뜀).
// 평단이 가격 범위와 멀면(넣으면 움직임이 그림의 35%보다 납작해짐) 점선을 그리지 않고 그래프 아래 '내 평단' 줄에 '그래프보다 위·아래'로만 적는다.
// 1일에만 전 거래일 종가를 옅은 점선으로 둔다(등락률 기준).
// 선 구분(2026-11-25): 평단 = 청록 점선 + 왼쪽 끝 '평단', 전 거래일 종가 = 회색 점선 + '전일'. 두 선이 가까워도 색·모양·이름으로 구분.
// 최고·최저 가격(2026-11-25): 그 기간 가장 높은 점 위에 '최고 n원', 가장 낮은 점 아래에 '최저 n원'(증권 앱 기본형, 세로 축·눈금은 두지 않음).
// 글자는 그림(SVG) 밖 HTML로 올린다. 그림은 화면 폭에 맞춰 가로로 늘어나서 그림 안 글자는 같이 늘어나기 때문. 1일 자료는 lib/prices.ts intraday(), 1주·1달은 series(), 3달·1년은 일봉 closes().
import type { Intraday } from "@/lib/prices";
import { signColor } from "@/components/model";
import { won } from "@/lib/format";

const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const UP = signColor(1), DOWN = signColor(-1);

// 1일은 1분봉을 그대로 한 점씩(2026-11-24, 그전엔 5분마다 한 점)
const points = (d: Intraday) => d.points;

/** 평단을 그래프 안에 그릴 수 있나: 넣어도 가격 움직임이 그림의 35%보다 납작해지지 않으면 "in", 아니면 평단이 가격보다 위("top")·아래("bottom") */
export function avgFit(prices: number[], avg: number | null): "in" | "top" | "bottom" | null {
  if (avg == null || !prices.length) return null;
  const lo0 = Math.min(...prices), hi0 = Math.max(...prices);
  const wLo = Math.min(lo0, avg), wHi = Math.max(hi0, avg);
  return (hi0 - lo0 || hi0 * 0.01) / (wHi - wLo) >= 0.35 ? "in" : avg > hi0 ? "top" : "bottom";
}

/** 1일 그래프의 평단 자리(전 거래일 종가 점선도 범위에 넣는다) */
export function avgPlace(d: Intraday, avg: number | null) {
  if (!d.points.length) return null;
  return avgFit([d.prev ?? d.points[0].p, ...points(d).map((p) => p.p)], avg);
}

/** 선 하나: pts의 x는 0~1(가로 위치), p는 가격. base는 1일의 전 거래일 종가(옅은 점선·범위에 넣음), color0은 평단이 없을 때 선 색 */
export function PriceLine({ id, pts, avg, base, color0, label }: { id: string; pts: { x: number; p: number }[]; avg: number | null; base?: number | null; color0: string; label: string }) {
  const W = 342, H = 140;
  const prices = pts.map((p) => p.p);
  const place = avgFit(base != null ? [base, ...prices] : prices, avg);
  let lo = Math.min(...prices, base ?? Infinity), hi = Math.max(...prices, base ?? -Infinity);
  if (place === "in") { lo = Math.min(lo, avg!); hi = Math.max(hi, avg!); }
  const pad = (hi - lo || hi * 0.01) * 0.08;
  lo -= pad; hi += pad;
  const X = (x: number) => x * W, Y = (v: number) => (1 - (v - lo) / (hi - lo)) * H;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.p).toFixed(1)}`).join("");
  const first = pts[0], last = pts[pts.length - 1];
  // 평단 기준으로 나눠 칠하기: 평단이 범위 안이면 그 높이에서 색이 바뀌고, 범위 밖이면 한 색
  const cut = place === "in" ? Math.max(0, Math.min(1, Y(avg!) / H)) : place === "bottom" ? 1 : place === "top" ? 0 : null;
  const stroke = cut == null ? color0 : `url(#${id}-s)`;
  const top = Math.min(...pts.map((q) => Y(q.p)));   // 선의 가장 높은 곳(바탕이 여기서부터 옅어짐)
  // 선 나누기(2026-11-25 다시): 잘라 그리기(clipPath)는 굵기 고정 선과 함께 쓰면 일부 브라우저(Safari)에서 자르는 높이가 어긋나 평단 근처 선이 사라졌다.
  // 그래서 선이 평단을 지나는 점을 직접 계산해 평단 위 조각(빨강)과 아래 조각(파랑)을 따로 그린다
  const split = (() => {
    if (avg == null) return null;
    const up: string[] = [], dn: string[] = [];
    const at = (x: number, p: number) => `${X(x).toFixed(1)},${Y(p).toFixed(1)}`;
    let side: "u" | "d" | null = null;
    const push = (sd: "u" | "d", from: string, to: string) => {
      const arr = sd === "u" ? up : dn;
      if (side !== sd) arr.push(`M${from}`);
      arr.push(`L${to}`);
      side = sd;
    };
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const sa = a.p >= avg ? "u" : "d", sb = b.p >= avg ? "u" : "d";
      if (sa === sb) { push(sa, at(a.x, a.p), at(b.x, b.p)); continue; }
      const t = (avg - a.p) / (b.p - a.p), cx = a.x + (b.x - a.x) * t;   // 평단을 지나는 점
      push(sa, at(a.x, a.p), at(cx, avg));
      push(sb, at(cx, avg), at(b.x, b.p));
    }
    return { up: up.join(""), dn: dn.join("") };
  })();
  const dot = avg == null ? color0 : last.p >= avg ? UP : DOWN;
  // 최고·최저 점과 글자 자리(점이 가장자리에 가까우면 글자를 안쪽으로)
  const iHi = prices.indexOf(Math.max(...prices)), iLo = prices.indexOf(Math.min(...prices));
  const tx = (x: number) => (x < 0.15 ? "translateX(-2px)" : x > 0.85 ? "translateX(calc(-100% + 2px))" : "translateX(-50%)");
  const pctY = (v: number) => `${((Y(v) / H) * 100).toFixed(2)}%`;
  // 선 이름표: 두 선 중 위에 있는 선은 선 위에, 아래 선은 선 아래에 붙여 겹치지 않게
  const refs = [...(place === "in" ? [{ k: "avg", v: avg!, t: "평단" }] : []), ...(base != null ? [{ k: "base", v: base, t: "전일" }] : [])].sort((a, b) => b.v - a.v);
  // 이름표 자리(2026-11-25): 후보 = 왼쪽·오른쪽 끝 × 선 위·아래. 이름표 칸(가로 12% · 세로 14px)에 가격 선이 지나가거나
  // 최고·최저 글자가 가까우면(가로 25% 안 · 세로 24px 안) 그 후보는 건너뛴다. 다 걸리면 왼쪽 위(흰 바탕이 깔려 읽힘)
  const tagAt = (v: number) => {
    const y = Y(v);
    const cands: [("l" | "r"), ("a" | "b")][] = [["l", "a"], ["l", "b"], ["r", "a"], ["r", "b"]];
    const ok = ([sd, ab]: ["l" | "r", "a" | "b"]) => {
      const inZone = (x: number) => (sd === "l" ? x < 0.12 : x > 0.88);
      const [y0, y1] = ab === "a" ? [y - 15, y + 1] : [y - 1, y + 15];
      const lineHit = pts.some((q) => inZone(q.x) && Y(q.p) >= y0 && Y(q.p) <= y1);
      const extHit = [iHi, iLo].some((i) => (sd === "l" ? pts[i].x < 0.25 : pts[i].x > 0.75) && Math.abs(Y(prices[i]) - y) < 24);
      return !lineHit && !extHit;
    };
    return cands.find(ok) ?? cands[0];
  };
  // 두 선이 가까우면(20px 안) 위 선은 위로, 아래 선은 아래로 붙여 이름표끼리 겹치지 않게
  const close2 = refs.length === 2 && Math.abs(Y(refs[0].v) - Y(refs[1].v)) < 20;
  const tags = refs.map((r, i) => { const t = tagAt(r.v); return { ...r, sd: t[0], ab: close2 ? (i === 0 ? "a" : "b") : t[1] }; });
  return (
    <div className="pcin">
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pchart" role="img" aria-label={label}>
      <defs>
        {cut != null ? (
          <>
            <linearGradient id={`${id}-s`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={H}>
              <stop offset={cut} stopColor={UP} /><stop offset={cut} stopColor={DOWN} />
            </linearGradient>
          </>
        ) : null}
        {/* 바탕을 아래로 갈수록 옅게 하는 가림막(위 16% → 바닥 0) */}
        <linearGradient id={`${id}-g`} x1={0} y1={0} x2={0} y2={1}>
          <stop offset={0} stopColor="#fff" stopOpacity={0.16} /><stop offset={1} stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
          <rect x={0} y={top} width={W} height={Math.max(1, H - top)} fill={`url(#${id}-g)`} />
        </mask>
      </defs>
      {/* 바탕(2026-11-25 사용자 결정): 선에서 바닥까지 칠하고 색은 평단 위 빨강 · 아래 파랑, 진하기는 색과 상관없이 선의 가장 높은 곳에서 바닥까지 한 번에 옅어진다 */}
      <path d={`${line}L${X(last.x).toFixed(1)},${H}L${X(first.x).toFixed(1)},${H}Z`} fill={stroke} mask={`url(#${id}-m)`} />
      {base != null ? <line x1={0} x2={W} y1={Y(base)} y2={Y(base)} stroke="#b8c0c3" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" /> : null}
      {place === "in" ? <line x1={0} x2={W} y1={Y(avg!)} y2={Y(avg!)} stroke="#008c82" strokeWidth={1.2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" /> : null}
      {/* 선 색: 평단이 있으면 평단 위 빨강 · 아래 파랑(선을 직접 나눈 두 경로), 없으면 기간 등락 색 하나. 선에 그라데이션을 쓰지 않는 까닭: 굵기 고정 선과 함께 쓰면 브라우저가 색 높이를 잘못 계산 */}
      {split == null ? <path d={line} fill="none" stroke={color0} strokeWidth={1.5} strokeLinejoin="miter" strokeMiterlimit={2} vectorEffect="non-scaling-stroke" /> : <>
        {split.up ? <path d={split.up} fill="none" stroke={UP} strokeWidth={1.5} strokeLinejoin="miter" strokeMiterlimit={2} vectorEffect="non-scaling-stroke" /> : null}
        {split.dn ? <path d={split.dn} fill="none" stroke={DOWN} strokeWidth={1.5} strokeLinejoin="miter" strokeMiterlimit={2} vectorEffect="non-scaling-stroke" /> : null}
      </>}
      <circle cx={X(last.x)} cy={Y(last.p)} r={3.5} fill={dot} stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
    {tags.map((r) => (
      <span key={r.k} className={`pc-ref ${r.k} ${r.sd}`} aria-hidden style={{ top: pctY(r.v), transform: r.ab === "a" ? "translateY(calc(-100% - 1px))" : "translateY(1px)" }}>{r.t}</span>
    ))}
    {prices[iHi] > prices[iLo] ? <>
      {[iHi, iLo].filter((i) => i !== pts.length - 1).map((i) => <i key={i} className="pc-dot" aria-hidden style={{ left: `${pts[i].x * 100}%`, top: pctY(prices[i]), background: avg == null ? color0 : prices[i] >= avg ? UP : DOWN }} />)}
      <span className="pc-ext" style={{ left: `${pts[iHi].x * 100}%`, top: pctY(prices[iHi]), transform: `${tx(pts[iHi].x)} translateY(calc(-100% - 5px))` }}>최고 {won(prices[iHi])}</span>
      <span className="pc-ext" style={{ left: `${pts[iLo].x * 100}%`, top: pctY(prices[iLo]), transform: `${tx(pts[iLo].x)} translateY(5px)` }}>최저 {won(prices[iLo])}</span>
    </> : null}
    </div>
  );
}

export function DayChart({ id, d, avg }: { id: string; d: Intraday; avg: number | null }) {
  const span = Math.max(1, mins(d.closeAt) - mins(d.openAt));
  const pts = points(d);
  const base = d.prev ?? pts[0].p;
  const lastP = pts[pts.length - 1].p;
  return (
    <PriceLine id={id} pts={pts.map((p) => ({ x: Math.max(0, Math.min(span, p.m)) / span, p: p.p }))} avg={avg} base={base}
      color0={signColor(lastP / base - 1)} label={`${d.day.slice(4, 6)}월 ${d.day.slice(6)}일 ${d.openAt}부터 ${pts[pts.length - 1].hhmm}까지 가격`} />
  );
}
