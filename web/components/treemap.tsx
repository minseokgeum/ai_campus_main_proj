"use client";
// 오늘 아침 내 종목 지도(피그마 컴포넌트 323:511, 팀원 규칙표 '규칙표 · 오늘 아침 내 종목 지도'의 RULES).
// 칸 크기 = 보유 금액, 색 = 예상 시가가 어제 종가보다 위(빨강)/아래(파랑) ±10%를 2.5% 단위 9단계(2026-11-24 ±2%에서 넓힘), 진하기 = 믿을 정도(높음 100·보통 60·낮음 32%, 낮음은 점선),
// 예상 범위 없음 = 회색 빗금. 업종 → 종목 2단계 squarified treemap, 높이 고정. 칸을 누르면 바텀 시트.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Layer } from "@/components/sheet";

export type MapStock = {
  code: string; name: string; sector: string; value: number; pct: number | null;   // pct null = 예상 범위 없음
  grade: "높음" | "보통" | "낮음" | null; news: number; l80: number | null; u80: number | null;
};

export const RULES = {
  mapWidth: 342, mapHeight: 280, label: 20, gap: 3,
  maxSectors: 4,                      // 업종 칸 최대 수(넘으면 큰 업종 maxSectors-1개 + '그 외 업종')
  minCell: [56, 28], minOther: [48, 20], minDot: [12, 12],
  text: { full: [96, 52], one: [72, 28], name: [48, 20] },
  badgeW: 110, range: 0.1, step: 0.025, smallCount: 2,
  alpha: { 높음: 1, 보통: 0.6, 낮음: 0.32 } as Record<string, number>,
};
const SCALE = ["#7fa2ec", "#a3bcf2", "#c6d5f7", "#e3eafb", "#edf0f1", "#fbe4e6", "#f8c9ce", "#f2a3ab", "#ea7d88"];
const colorOf = (r: number | null) => (r == null ? null : SCALE[Math.max(-4, Math.min(4, Math.round(r / RULES.step))) + 4]);
const pctT = (v: number) => { const r = Math.round(v * 1000) / 10; return r === 0 ? "0.0%" : `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(1)}%`; };

type Box = { x: number; y: number; w: number; h: number };
type Item = { value: number };

/** squarified treemap(Bruls 외). 항목이 3개 이하면 긴 쪽으로 나란히 자른다 */
function layout<T extends Item>(items: T[], box: Box): (T & Box)[] {
  const list = items.filter((x) => x.value > 0);
  if (!list.length || box.w <= 0 || box.h <= 0) return [];
  const total = list.reduce((a, x) => a + x.value, 0);
  if (list.length <= 3) {
    const out: (T & Box)[] = []; let off = 0;
    for (const x of list) {
      const f = x.value / total;
      if (box.w >= box.h) { out.push({ ...x, x: box.x + off, y: box.y, w: box.w * f, h: box.h }); off += box.w * f; }
      else { out.push({ ...x, x: box.x, y: box.y + off, w: box.w, h: box.h * f }); off += box.h * f; }
    }
    return out;
  }
  const area = box.w * box.h, scale = area / total;
  const out: (T & Box)[] = [];
  let rest = { ...box }, row: T[] = [];
  const worst = (r: T[], side: number) => {
    const s = r.reduce((a, x) => a + x.value * scale, 0);
    const mx = Math.max(...r.map((x) => x.value * scale)), mn = Math.min(...r.map((x) => x.value * scale));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const flush = (r: T[]) => {
    const s = r.reduce((a, x) => a + x.value * scale, 0);
    if (rest.w >= rest.h) {
      const w = s / rest.h; let y = rest.y;
      for (const x of r) { const h = (x.value * scale) / w; out.push({ ...x, x: rest.x, y, w, h }); y += h; }
      rest = { x: rest.x + w, y: rest.y, w: rest.w - w, h: rest.h };
    } else {
      const h = s / rest.w; let xx = rest.x;
      for (const x of r) { const w = (x.value * scale) / h; out.push({ ...x, x: xx, y: rest.y, w, h }); xx += w; }
      rest = { x: rest.x, y: rest.y + h, w: rest.w, h: rest.h - h };
    }
  };
  for (const x of list) {
    const side = Math.min(rest.w, rest.h);
    if (!row.length || worst([...row, x], side) <= worst(row, side)) row.push(x);
    else { flush(row); row = [x]; }
  }
  if (row.length) flush(row);
  return out;
}

type Cell = Box & { kind: "stock" | "other" | "sector"; stocks: MapStock[]; value: number; label: string };
const fits = (b: Box, [w, h]: number[]) => b.w - RULES.gap >= w - 0.01 && b.h - RULES.gap >= h - 0.01;   // 보이는 크기(칸 사이 틈 뺀 뒤)로 잰다

/** 업종 칸 안: 큰 종목부터 배치하고, 최소 크기보다 작은 칸이 생기면 작은 종목부터 '그 외 N종목'으로 묶는다 */
function sectorCells(stocks: MapStock[], box: Box, sector: string): Cell[] {
  const sorted = [...stocks].sort((a, b) => b.value - a.value);
  for (let keep = sorted.length; keep >= 1; keep--) {
    const main = sorted.slice(0, keep), rest = sorted.slice(keep);
    const items: (Item & { s: MapStock[]; other: boolean })[] = main.map((s) => ({ value: s.value, s: [s], other: false }));
    if (rest.length) {
      const v = rest.reduce((a, s) => a + s.value, 0);
      // 1종목짜리는 '그 외'로 만들지 않고 색만 보이는 칸으로 남기되, 최소 12×12가 되도록 두께를 먼저 떼어 준다
      const mainSum = main.reduce((a, s) => a + s.value, 0), L = Math.max(box.w, box.h), d = RULES.minDot[0] + RULES.gap + 0.5;   // 보이는 크기(틈 뺀 뒤) 12 이상
      const floor = rest.length === 1 && L > d ? (mainSum * d) / (L - d) : 0;   // 칸 두께 = L × floor/(mainSum+floor) ≥ 12
      items.push({ value: Math.max(v, floor), s: rest, other: rest.length > 1 });
    }
    const laid = layout(items, box);
    const ok = laid.every((c) => (c.other ? fits(c, RULES.minOther) : c.s.length === 1 && c.s === items[items.length - 1].s && rest.length === 1 ? fits(c, RULES.minDot) : fits(c, RULES.minCell)));
    if (ok) return laid.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h, kind: c.other ? "other" : "stock", stocks: c.s, value: c.value, label: c.other ? `그 외 ${c.s.length}종목` : c.s[0].name }));
  }
  // 더 묶을 수 없으면 업종 전체를 한 칸
  return [{ ...box, kind: stocks.length > 1 ? "sector" : "stock", stocks: sorted, value: sorted.reduce((a, s) => a + s.value, 0), label: stocks.length > 1 ? `${sector} ${stocks.length}종목` : sorted[0].name }];
}

const detailHref = (code: string) => `/mine/${code}`;   // 종목 상세

/** idle: 예상이 아직 없을 때(07:30 전 '07:30 공개', 주말 '쉬는 날') 칸에 % 대신 넣는 글(피그마 465:8339 · 465:8516). 크기만 보유 금액 */
export function TreeMap({ stocks, idle }: { stocks: MapStock[]; idle?: string }) {
  const [open, setOpen] = useState<Cell | null>(null);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  const live = stocks.filter((s) => s.value > 0);
  if (live.length <= RULES.smallCount) {
    return <div className="tcards">{live.map((s) => <StockCard key={s.code} s={s} href={detailHref(s.code)} idle={idle} />)}</div>;
  }
  const { mapWidth: W, mapHeight: H, label: L, gap: G } = RULES;
  const bySec = [...live.reduce((m, s) => m.set(s.sector, [...(m.get(s.sector) ?? []), s]), new Map<string, MapStock[]>()).entries()]
    .map(([sector, list]) => ({ sector, list, value: list.reduce((a, s) => a + s.value, 0) })).sort((a, b) => b.value - a.value);
  const groups = bySec.length > RULES.maxSectors
    ? [...bySec.slice(0, RULES.maxSectors - 1), { sector: "그 외 업종", list: bySec.slice(RULES.maxSectors - 1).flatMap((g) => g.list), value: bySec.slice(RULES.maxSectors - 1).reduce((a, g) => a + g.value, 0), others: bySec.length - RULES.maxSectors + 1 }]
    : bySec;
  // 간격 G는 칸과 칸 사이에만: 폭·높이에 G를 더한 판에 나눈 뒤 칸마다 G를 빼면 오른쪽·아래 끝도 지도 끝에 딱 맞는다(2026-11-22, 예전엔 끝에도 G가 남아 좌우 여백이 달랐다)
  const secBoxes = layout(groups, { x: 0, y: 0, w: W + G, h: H + G });
  const pct = (v: number, t: number) => `${(v / t) * 100}%`;

  return (
    <>
      <div className="tmap" style={{ aspectRatio: `${W} / ${H}` }}>
        {secBoxes.map((g) => {
          const inner: Box = { x: 0, y: L, w: g.w, h: g.h - L };   // 종목 칸도 같은 방식(칸마다 G를 빼서 업종 칸 끝에 맞춤)
          const isRestSec = g.sector === "그 외 업종";
          const cells: Cell[] = isRestSec
            ? [{ ...inner, kind: "sector", stocks: g.list, value: g.value, label: `${(g as { others?: number }).others ?? 0}개 업종 · ${g.list.length}종목` }]
            : sectorCells(g.list, inner, g.sector);
          const known = g.list.filter((s) => s.pct != null);
          const avg = known.length ? known.reduce((a, s) => a + s.value * s.pct!, 0) / known.reduce((a, s) => a + s.value, 0) : null;
          return (
            <div key={g.sector} className="tsec" style={{ left: pct(g.x, W), top: pct(g.y, H), width: pct(g.w - G, W), height: pct(g.h - G, H) }}>
              <div className="tlab" style={{ height: pct(L, g.h - G) }}><b>{g.sector}</b>{!idle && avg != null && g.w > 110 ? <span>{pctT(avg)}</span> : null}</div>
              {cells.map((c) => <Tile key={c.label + c.x} c={c} pw={g.w - G} ph={g.h - G} idle={idle} onOpen={() => setOpen(c)} />)}
            </div>
          );
        })}
      </div>
      {open ? (
        <Layer><div className="sheet-back" onClick={() => setOpen(null)}>
          <section className="sheet-box" role="dialog" aria-modal="true" aria-label={open.label} onClick={(e) => e.stopPropagation()}>
            <i className="grab" />
            <div className="sheet-head"><div><h2>{open.kind === "stock" ? open.stocks[0].name : open.label}</h2>{open.kind !== "stock" ? <p>보유 금액 큰 순</p> : null}</div>
              <button type="button" className="x" onClick={() => setOpen(null)} aria-label="닫기">✕</button></div>
            {open.kind === "stock" ? <StockCard s={open.stocks[0]} href={detailHref(open.stocks[0].code)} idle={idle} big />
              : open.stocks.map((s) => <StockCard key={s.code} s={s} href={detailHref(s.code)} idle={idle} />)}
          </section>
        </div></Layer>
      ) : null}
    </>
  );
}

function Tile({ c, pw, ph, idle, onOpen }: { c: Cell; pw: number; ph: number; idle?: string; onOpen: () => void }) {
  const s = c.stocks[0];
  const one = c.kind === "stock";
  const known = c.stocks.filter((x) => x.pct != null);
  const r = one ? s.pct : known.length ? known.reduce((a, x) => a + x.value * x.pct!, 0) / known.reduce((a, x) => a + x.value, 0) : null;
  const bg = idle ? "#f1f4f4" : colorOf(r);
  const alpha = !idle && one && s.grade ? RULES.alpha[s.grade] ?? 1 : 1;
  const w = c.w - RULES.gap, h = c.h - RULES.gap;
  const level = w >= RULES.text.full[0] && h >= RULES.text.full[1] ? "full" : w >= RULES.text.one[0] && h >= RULES.text.one[1] ? "one" : w >= RULES.text.name[0] && h >= RULES.text.name[1] ? "name" : "dot";
  const news = c.stocks.reduce((a, x) => a + x.news, 0);
  return (
    <button type="button" onClick={onOpen} title={c.label}
      className={`ttile ${bg == null ? "norange" : ""} ${!idle && one && s.grade === "낮음" ? "low" : ""} ${idle ? "idle" : ""} ${level}`}
      style={{ left: `${(c.x / pw) * 100}%`, top: `${(c.y / ph) * 100}%`, width: `${(w / pw) * 100}%`, height: `${(h / ph) * 100}%`, ["--tc" as string]: bg ?? "#edf0f1", ["--ta" as string]: alpha }}>
      {level === "full" ? <><b>{c.label}</b><span>{idle ?? (r == null ? "범위 없음" : pctT(r))}</span>{news && w >= RULES.badgeW ? <i>소식 {news}</i> : null}</>
        : level === "one" ? <b className="row">{c.label} <span>{idle ?? (r == null ? "범위 없음" : pctT(r))}</span></b>
          : level === "name" ? <b>{c.label}</b> : null}
    </button>
  );
}

const DOTS: Record<string, string> = { 높음: "●●●", 보통: "●●○", 낮음: "●○○" };

function StockCard({ s, href, big, idle }: { s: MapStock; href: string; big?: boolean; idle?: string }) {
  const col = s.pct == null ? "#8a9598" : s.pct > 0 ? "#d35d66" : s.pct < 0 ? "#4c6fc3" : "#8a9598";
  return (
    <div className={`tcard ${big ? "big" : ""}`}>
      <div className="tc1"><b>{s.name}</b><span style={{ color: idle ? "#8a9598" : col }}>{idle ?? (s.pct == null ? "범위 없음" : pctT(s.pct))}</span></div>
      <p className="fine">{idle ? (idle === "쉬는 날" ? "오늘은 장이 열리지 않아요. 다음 거래일 07:30에 예상이 채워져요." : "오늘 예상 범위는 07:30에 채워져요.") : s.pct == null ? "코스닥·ETF·해외 주식처럼 서비스 대상 밖이라 예상 범위를 계산하지 않아요."
        : `예상 범위 ${s.l80 != null ? pctT(s.l80) : "—"} ~ ${s.u80 != null ? pctT(s.u80) : "—"} · 믿을 정도 ${s.grade ? `${s.grade} ${DOTS[s.grade]}` : "08:11에 나와요"}`}</p>
      <div className="tc2">
        <Link href={`/news?tab=mine&c=${s.code}`}>밤사이 소식 {s.news}건 ›</Link>
        <Link href={`/night?open=${s.code}`}>밤사이 예상 ›</Link>
        <Link href={href}>종목 상세 ›</Link>
      </div>
    </div>
  );
}

export function MapLegend({ idle }: { idle?: boolean }) {
  if (idle) return <div className="tleg"><span>크기 = 보유 금액</span><i className="sep" /><em>소식</em><span>밤사이 소식 수</span></div>;
  return (
    <>
      <div className="tleg"><span>−{RULES.range * 100}%</span><span className="sw">{SCALE.map((c) => <i key={c} style={{ background: c }} />)}</span><span>+{RULES.range * 100}%</span><i className="sep" /><span>크기 = 보유 금액</span></div>
      <div className="tleg"><span className="ti"><i className="dash" />흐릴수록 방향이 불확실해요</span><i className="sep" /><span className="ti"><em>소식</em>밤사이 소식 수</span><i className="sep" /><span className="ti"><i className="hatch" />범위 없음</span></div>
    </>
  );
}
