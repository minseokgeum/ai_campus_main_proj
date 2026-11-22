"use client";
// 야간선물 큰 그래프(+ 아래 15분 기사 수 막대)를 누르거나 끌면 세로선 하나가 그래프와 막대를 함께 가로지르고,
// 그 시각의 가격·등락률과 그 15분에 나온 미국 기사 수를 위 줄에 보여 준다(2026-11-22). 손을 떼도 선은 남고, 다시 누르면 옮겨진다.
// 가로 위치는 NightChart(detail, h=180)와 같은 규칙: 18:00부터 지난 분 / 720. 막대 48칸은 15분씩.
import { useRef, useState, type ReactNode } from "react";

type Pt = { m: number; r: number };
const hhmm = (m: number) => { const t = (18 * 60 + m) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const pct = (r: number) => `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r * 100).toFixed(2)}%`;

export function ChartScrub({ points, dayClose, buckets, h = 180, children }: { points: Pt[]; dayClose: number; buckets?: number[]; h?: number; children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ m: number; x: number; y: number | null; top: number } | null>(null);
  const last = points.length ? points[points.length - 1].m : 0;
  const lo = Math.min(0, ...points.map((p) => p.r)), hi = Math.max(0, ...points.map((p) => p.r)), span = hi - lo || 0.001;

  const move = (clientX: number) => {
    const box = wrap.current?.getBoundingClientRect();
    const chart = wrap.current?.querySelector(".nchart")?.getBoundingClientRect();
    if (!box || !points.length) return;
    const frac = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    const m = Math.min(Math.round(frac * 720), last);   // 아직 오지 않은 시각(진행 중)이면 마지막 점에
    const p = points.reduce((a, q) => (q.m <= m ? q : a), points[0]);
    const y = chart ? chart.top - box.top + ((22 + (1 - (p.r - lo) / span) * (h - 44)) / h) * chart.height : null;
    const top = chart ? chart.top - box.top + (22 / h) * chart.height : 0;   // 선은 그래프 칸(위 고가 글자 아래)부터 막대 끝까지
    setAt({ m: p.m, x: (p.m / 720) * box.width, y, top });
  };

  const p = at ? points.reduce((a, q) => (q.m <= at.m ? q : a), points[0]) : null;
  const k = at ? Math.min(47, Math.floor(at.m / 15)) : 0;
  return (
    <>
      <p className={`scrubread ${at ? "on" : ""}`} aria-live="polite">
        {at && p ? <>
          <b>{hhmm(p.m)}</b><span style={{ color: p.r > 0 ? "#d35d66" : p.r < 0 ? "#4c6fc3" : undefined }}>{(dayClose * (1 + p.r)).toFixed(2)} ({pct(p.r)})</span>
          {buckets ? <span>미국 기사 {buckets[k]}건 <small>({hhmm(k * 15)}~{hhmm(k * 15 + 15)})</small></span> : null}
          <button type="button" onClick={() => setAt(null)} aria-label="비교 선 지우기">✕</button>
        </> : <span className="hint">그래프를 누르거나 끌면 그 시각을 위아래로 비교해 볼 수 있어요</span>}
      </p>
      <div ref={wrap} className={`scrub ${at ? "on" : ""}`} onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); move(e.clientX); }}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") move(e.clientX); }}>
        {children}
        {at ? <>
          <i className="scrubline" style={{ left: at.x, top: at.top }} aria-hidden />
          {at.y != null ? <i className="scrubdot" style={{ left: at.x, top: at.y }} aria-hidden /> : null}
        </> : null}
      </div>
    </>
  );
}
