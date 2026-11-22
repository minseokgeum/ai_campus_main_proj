// 종목 상세(피그마 147:619): 평가 금액·손익, 가격 흐름(1주·1달·3달·1년, KIS 일봉), 이 종목의 예상 범위 기록, 야간선물 반응도.
import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/ui";
import { MaskToggle } from "@/components/sheet";
import { signColor } from "@/components/model";
import { requireUser } from "@/lib/auth";
import { portfolio, uStock } from "@/lib/portfolio";
import { tierOf } from "@/lib/model";
import { bandHistory, closes, filings, intraday, lastCloses } from "@/lib/prices";
import { DayChart } from "@/components/daychart";
import { AutoRefresh } from "@/components/autorefresh";
import { Sheet } from "@/components/sheet";
import { stockNewsDays } from "@/lib/news";
import { addDays, kstNow } from "@/lib/calendar";
import { pct, swon, won } from "@/lib/format";
import { appNow, demoAt } from "@/lib/clock";
import { briefing } from "@/lib/briefing";
import { stockLinks } from "@/lib/links";
import { StockLinksSection } from "@/components/links";

export const dynamic = "force-dynamic";

const RANGES = [["1d", "1일", 1], ["1w", "1주", 7], ["1m", "1달", 31], ["3m", "3달", 92], ["1y", "1년", 366]] as const;   // 1일: 장중 1분봉(2026-11-22 더함)

export default async function StockDetail({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ r?: string }> }) {
  const { code } = await params;
  const sp = await searchParams;
  const u = uStock(code);
  if (!u) notFound();
  const user = await requireUser();
  const pf = await portfolio(user.id);
  const h = pf.holdings.find((x) => x.code === code);
  const watch = pf.watch.includes(code);
  const range = RANGES.find((x) => x[0] === sp.r) ?? RANGES[2];   // 처음은 1달
  const nowAt = await appNow();
  const today = kstNow(nowAt).ymd;
  const br = briefing(undefined, nowAt);   // 연결 그림의 소식 수는 지금 브리핑 범위(전날 23:00 ~ 그날 05:45 수집분)
  const [px, hist, past, fl, lc, lk, day, demo] = await Promise.all([closes(code, addDays(today, -range[2])), bandHistory(code), stockNewsDays(code, 7), filings(code, 14), lastCloses(pf.holdings.map((x) => x.code)), stockLinks([code], br.start, br.end),
    range[0] === "1d" ? intraday(code) : Promise.resolve(null), demoAt()]);
  // 지난 소식(피그마 147:619): 기사(보도) + DART 공시, 최신순
  const md = (d: string) => `${Number(d.slice(4, 6))}/${Number(d.slice(6, 8))}`;
  const kd = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)).replace(/-/g, "");
  // 같은 소식 묶기(2026-11-22 팀원 개선 사항 B안): 같은 사건·소식(서버 news.stories) 기사는 한 줄 + '관련 보도 n건', 누르면 펼쳐서 기사별 상세·원문.
  // 원문 주소가 같은 기사는 1건으로 센다. 줄 제목은 한국어 제목이 있는 가장 먼저 나온 기사, 날짜는 가장 최근 보도
  const hm = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  const byGroup = new Map<string, typeof past>();
  for (const a of past) byGroup.set(a.group, [...(byGroup.get(a.group) ?? []), a]);
  const pastRows = [...byGroup.values()].map((list) => {
    const arts = [...list].sort((p, q) => p.published.localeCompare(q.published)).filter((x, i, all) => all.findIndex((y) => y.link === x.link) === i);
    const rep = arts.find((x) => x.ko) ?? arts[0], latest = arts[arts.length - 1].published;
    return { d: kd(latest), t: latest, kind: "보도", title: rep.ko ?? rep.title, href: `/news/a/${rep.key}?back=/mine/${code}`, ext: false,
      more: arts.length > 1 ? arts.map((x) => ({ key: x.key, title: x.ko ?? x.title, outlet: x.outlet, when: hm(x.published), href: `/news/a/${x.key}?back=/mine/${code}`, link: x.link })) : undefined };
  });
  const items: PastItem[] = [
    ...pastRows,
    ...fl.map((f) => ({ d: f.d, t: `${isoD(f.d)}T23:59:59Z`, kind: "공시", title: f.title, href: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${f.no}`, ext: true })),
  ].sort((a, b) => b.t.localeCompare(a.t));
  const totalVal = pf.holdings.reduce((a, x) => a + x.qty * (lc.get(x.code)?.close ?? 0), 0);
  const last = px[px.length - 1], first = px[0];
  const value = h && last ? h.qty * last.c : null;
  const pnl = h?.avg && last ? h.qty * (last.c - h.avg) : null;
  const scored = hist.filter((x) => x.in80 != null);
  const inN = scored.filter((x) => x.in80).length;
  const ratios = hist.filter((x) => x.x != null && Math.abs(x.x) >= 0.003).map((x) => x.h / x.x!).sort((a, b) => a - b);
  const beta = ratios.length ? ratios[Math.floor(ratios.length / 2)] : null;
  const react = beta == null ? null : beta >= 1.1 ? "크게 반응" : beta >= 0.6 ? "보통 반응" : "작게 반응";
  // 가격 흐름 그림
  const W = 342, H = 140;
  const lo = Math.min(...px.map((p) => p.c), h?.avg ?? Infinity), hi = Math.max(...px.map((p) => p.c), h?.avg ?? -Infinity);
  const X = (i: number) => (i / Math.max(1, px.length - 1)) * W, Y = (v: number) => 8 + (1 - (v - lo) / (hi - lo || 1)) * (H - 16);
  const line = px.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.c).toFixed(1)}`).join("");
  const chg = first && last ? last.c / first.c - 1 : 0;

  return (
    <>
      <main className="sheet">
        <div className="shead"><Link href="/mine" aria-label="뒤로">‹</Link><span className="ttl">{u.name}</span><MaskToggle /></div>
        <p className="fine">{h ? `보유 ${h.qty.toLocaleString("ko-KR")}주${h.avg ? ` · 평단 ${won(h.avg)}` : ""}${value != null && totalVal ? ` · 비중 ${Math.round((value / totalVal) * 100)}%` : ""}` : watch ? "관심 종목" : "보유하지 않은 종목"} · {u.sector}
          {tierOf(code) === 2 ? " · 모델 설계 밖" : tierOf(code) === 3 ? " · 서비스 대상 아님" : ""}</p>

        {h ? (
          <section className="pcard">
            <div className="vrow">
              <div><span>평가 금액</span><b className="amt tot">{value != null ? won(value) : "—"}</b></div>
              <div className="r"><span>평가 손익</span>{pnl != null ? <b style={{ color: signColor(pnl) }}><span className="amt">{swon(pnl)}</span> ({pct(((last!.c / h.avg! - 1) * 100))})</b> : <b className="muted">평단을 넣으면 계산해요</b>}</div>
            </div>
            <div className="vlinks"><Link href={`/mine/${code}/edit`}>수량·평단 수정 ›</Link><Link href={`/mine/${code}/edit?watch=1`}>관심으로 옮기기 ›</Link></div>
          </section>
        ) : (
          <section className="pcard"><div className="vlinks"><Link href={`/mine/${code}/edit`}>보유 종목으로 추가 ›</Link></div></section>
        )}

        <section className="pcard">
          {range[0] === "1d" ? (
            day && day.points.length ? (() => {
              // 1일(장중 1분봉): 장이 열려 있으면 1분마다 이어 그린다. 장 전·휴장일은 마지막 거래일 하루
              // 한국거래소 정규장(09:00~15:30)만 그린다. 그래서 끝 가격은 정규장 마감가이고, 1주·1달의 '종가'(넥스트레이드 20:00까지의 마지막 가격)와 다를 수 있다
              const lp = day.points[day.points.length - 1];
              const dchg = day.prev ? lp.p / day.prev - 1 : 0;
              const dl = `${Number(day.day.slice(4, 6))}/${Number(day.day.slice(6))}`;
              return <>
                {day.live && !demo ? <AutoRefresh sec={60} /> : null}
                <div className="prow2"><b>{won(lp.p)}</b><span style={{ color: signColor(dchg) }}>{day.day === today ? "오늘" : dl} {pct(dchg * 100)}</span>
                  <small>{day.live ? <><i className="livedot" aria-hidden />{lp.hhmm} 기준</> : "정규장 마감"}</small></div>
                <DayChart d={day} avg={h?.avg ?? null} />
                <div className="paxis"><span>{day.openAt}</span><span>12:00</span><span>{day.closeAt}</span></div>
              </>;
            })() : <p className="fine">하루 가격(1분) 자료가 아직 없어요. 장이 열리면 1분마다 그려요.</p>
          ) : <>
          <div className="prow2"><b>{last ? won(last.c) : "—"}</b><span style={{ color: signColor(chg) }}>{range[1]} {pct(chg * 100)}</span><small>{last ? `${Number(last.d.slice(4, 6))}/${Number(last.d.slice(6))} 종가` : ""}</small></div>
          {px.length > 1 ? (
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pchart">
              <path d={`${line}L${W},${H}L0,${H}Z`} fill="rgba(211,93,102,.08)" />
              {h?.avg ? <line x1={0} x2={W} y1={Y(h.avg)} y2={Y(h.avg)} stroke="#8a9598" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" /> : null}
              <path d={line} fill="none" stroke={signColor(chg)} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
              <circle cx={X(px.length - 1)} cy={Y(last!.c)} r={3.5} fill={signColor(chg)} stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            </svg>
          ) : <p className="fine">가격 자료가 아직 없어요.</p>}
          {px.length > 1 ? <div className="paxis"><span>{md(first!.d)}</span><span>{md(last!.d)}</span></div> : null}
          </>}
          <div className="ranges">{RANGES.map((x) => <Link key={x[0]} href={`/mine/${code}?r=${x[0]}`} className={x[0] === range[0] ? "on" : ""}>{x[1]}</Link>)}</div>
          {h?.avg && (range[0] === "1d" ? day?.points.length : px.length > 1) ? <p className="avgnote"><i aria-hidden />내 평단 <b>{won(h.avg)}</b></p> : null}   {/* 차트 안 글자가 잘려서 기간 단추 아래 줄로(2026-11-22 팀원 개선 사항). 점선은 차트에 그대로 */}
        </section>

        <section className="pcard">
          <div className="rowh"><b>이 종목의 예상 범위 기록</b><Link href="/saved" className="linkish teal">전체 기록 ›</Link></div>
          {scored.length ? (
            <>
              <p className="score"><b>{inN} / {scored.length}일</b> 최근 {scored.length}거래일 중 범위 안</p>
              <div className="hgrid">{[...scored].reverse().map((x) => <i key={x.t} className={x.in80 ? "in" : "out"} title={`${x.t} ${x.in80 ? "범위 안" : "범위 밖"}`} />)}</div>
            </>
          ) : <p className="sline2">채점 기록이 쌓이면 보여 줘요(거래일 09:05마다 하루씩).</p>}
        </section>

        <section className="pcard">
          <div className="rowh"><b>미국 시장 반응도</b>{react ? <span className="react">{react}</span> : null}</div>
          {beta != null ? <p className="beta">×{beta.toFixed(1)}</p> : null}
          <p className="sline2">{beta == null ? "기록이 쌓이면 이 종목이 지난밤 야간선물 움직임을 얼마나 따라 시가가 정해지는지 보여 줘요."
            : `야간선물이 1% 움직이면 평소 ${beta.toFixed(1)}% 안팎 · 지난 ${ratios.length}거래일`}</p>
        </section>
        <StockLinksSection name={u.name} nodes={lk.get(code) ?? []} />
        <section className="pcard">
          <div className="rowh"><b>지난 소식</b>{items.length > 3 ? (
            <Sheet className="linkish teal" title={`${u.name} 지난 소식`} sub={`최근 ${items.length}건 · 기사 7일 · 공시 14일`} trigger={<>더 보기 ›</>}>
              {items.map((x, k) => <PastRow key={k} x={x} md={md} />)}
            </Sheet>) : null}</div>
          {items.length ? items.slice(0, 3).map((x, k) => <PastRow key={k} x={x} md={md} />) : <p className="sline2">최근 일주일 동안 이 종목 소식이 없어요.</p>}
        </section>
      </main>
      <BottomNav active="mine" />
    </>
  );
}

function isoD(d: string) { return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`; }

type PastItem = { d: string; t: string; kind: string; title: string; href: string; ext: boolean;
  more?: { key: string; title: string; outlet: string; when: string; href: string; link: string }[] };   // 같은 소식 기사들(2건 이상일 때)

function PastRow({ x, md }: { x: PastItem; md: (d: string) => string }) {
  const inner = <><span className="pd">{md(x.d)}</span><span className={`pk ${x.kind === "공시" ? "f" : ""}`}>{x.kind}</span><b>{x.title}</b></>;
  if (x.more) return (
    <details className="pastgrp">
      <summary className="past">{inner}<span className="prel">관련 보도 {x.more.length}건</span></summary>
      <ul className="pastsub">
        {x.more.map((m) => (
          <li key={m.key}>
            <Link href={m.href}><span className="pso">{m.outlet} · {m.when}</span><span className="pst">{m.title}</span></Link>
            <a href={m.link} target="_blank" rel="noreferrer noopener" aria-label={`${m.outlet} 원문 보기`}>원문 ↗</a>
          </li>
        ))}
      </ul>
    </details>
  );
  return x.ext ? <a href={x.href} target="_blank" rel="noreferrer noopener" className="past">{inner}</a> : <Link href={x.href} className="past">{inner}</Link>;
}
