"use client";
// 야간선물 큰 그래프(+ 아래 15분 기사 수 막대)를 누르거나 끌면 세로선 하나가 그래프와 막대를 함께 가로지르고,
// 그 시각의 가격·등락률과 그 15분에 나온 미국 기사 수를 위 줄에 보여 준다(2026-11-22). 손을 떼도 선은 남고, 다시 누르면 옮겨진다.
// 가로 위치는 NightChart(detail, h=180)와 같은 규칙: 18:00부터 지난 분 / 720. 막대 48칸은 15분씩.
// 2026-11-26 사용자 요청: 손을 떼면 그 15분에 나온 미국 기사 목록을 아래(foot 다음)에 보여 준다(누를 수 없는 목록, 다섯 줄 + 더 보기).
//  newsStart = 야간선물 시작 시각(ISO). 끄는 동안에는 부르지 않고 손을 뗄 때 한 번(app/api/newsat), 한 번 부른 칸은 다시 부르지 않는다.
import { useRef, useState, type ReactNode } from "react";

// 원문 보기 아이콘(components/ui.tsx ExtIcon과 같은 모양. 그 파일은 서버 자료를 불러와서 여기서 가져오지 않음)
const ExtIcon = () => <svg aria-hidden width="16" height="16" viewBox="0 0 16 16"><path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;

type AtArticle = { key: string; title: string; ko: string | null; outlet: string; hm: string; mine: string[]; same: number; link: string };

type Pt = { m: number; r: number };
const hhmm = (m: number) => { const t = (18 * 60 + m) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const pct = (r: number) => `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r * 100).toFixed(2)}%`;

export function ChartScrub({ points, dayClose, buckets, h = 180, children, newsStart, foot }: { points: Pt[]; dayClose: number; buckets?: number[]; h?: number; children: ReactNode; newsStart?: string; foot?: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const lastM = useRef<number | null>(null);
  const cache = useRef(new Map<number, AtArticle[]>());
  const [pick, setPick] = useState<{ k: number; list: AtArticle[] | null; all: boolean } | null>(null);
  const load = () => {
    if (!newsStart || !buckets || lastM.current == null) return;
    const k = Math.min(47, Math.floor(lastM.current / 15));
    if (pick?.k === k) return;
    const hit = cache.current.get(k) ?? (buckets[k] === 0 ? [] : null);
    setPick({ k, list: hit, all: false });
    if (hit) return;
    fetch(`/api/newsat?s=${encodeURIComponent(newsStart)}&k=${k}`).then((r) => r.json()).then((d) => {
      const list = (d.list ?? []) as AtArticle[];
      cache.current.set(k, list);
      setPick((cur) => (cur && cur.k === k ? { ...cur, list } : cur));
    }).catch(() => setPick((cur) => (cur && cur.k === k ? { ...cur, list: [] } : cur)));
  };
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
    lastM.current = p.m;
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
          <button type="button" onClick={() => { setAt(null); setPick(null); lastM.current = null; }} aria-label="비교 선 지우기">✕</button>
        </> : <span className="hint">그래프를 누르거나 끌면 그 시각을 위아래로 비교해 볼 수 있어요</span>}
      </p>
      <div ref={wrap} className={`scrub ${at ? "on" : ""}`} onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); move(e.clientX); }}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") move(e.clientX); }}
        onPointerUp={load} onPointerCancel={load}>
        {children}
        {at ? <>
          <i className="scrubline" style={{ left: at.x, top: at.top }} aria-hidden />
          {at.y != null ? <i className="scrubdot" style={{ left: at.x, top: at.y }} aria-hidden /> : null}
        </> : null}
      </div>
      {foot}
      {pick ? (
        <section className="newsat" aria-live="polite">
          <b className="na-h">{hhmm(pick.k * 15)}~{hhmm(pick.k * 15 + 15)} 미국 기사 {buckets?.[pick.k] ?? 0}건{pick.list && pick.list.length && pick.list.length < (buckets?.[pick.k] ?? 0) ? <small>같은 소식을 묶어 {pick.list.length}개</small> : null}</b>
          {pick.list == null ? <p className="na-note">불러오는 중…</p>
            : !pick.list.length ? <p className="na-note">이 15분엔 나온 기사가 없어요</p>
            : <>
              <ul>{(pick.all ? pick.list : pick.list.slice(0, 5)).map((a) => (
                <li key={a.key}><div><span className="na-t">{a.ko ?? a.title}</span>
                  <small>{a.outlet} · {a.hm}{a.same > 1 ? ` · 같은 소식 ${a.same}건` : ""}{a.mine.length ? <em>{a.mine.join(" · ")}</em> : null}</small></div>
                  {a.link ? <a className="na-x" href={a.link} target="_blank" rel="noreferrer noopener" aria-label="원문 보기"><ExtIcon /></a> : null}</li>
              ))}</ul>
              {pick.list.length > 5 && !pick.all ? <button type="button" className="na-more" onClick={() => setPick({ ...pick, all: true })}>나머지 소식 {pick.list.length - 5}개 더 보기</button> : null}
            </>}
        </section>
      ) : null}
    </>
  );
}
