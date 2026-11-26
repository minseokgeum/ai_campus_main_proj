// 종목 상세 v4(피그마 배포용 769:11725 · 시간대별 예측 줄 1033:2012 · 오늘 예측 창 1042:7536, 변경 기록 27·28·42·44, 2026-11-25).
// 카드 없는 흰 바탕, 큰 구간 사이 8px 회색 띠. 순서: 머리(보유 · 평단) → 현재가 · 평가 금액 · 손익 · 수정 ‖ 오늘 예측 줄(누르면 창) → 밤사이 이 종목 뉴스 + 미국 연결 기업 소식(관계도 창)
// ‖ 시세 요약(전일 종가 · 거래량 · 시가총액 · 외국인 보유 · 52주 위치) → 주가 흐름(1일 · 1주 · 1달 · 3달 · 1년) ‖ 다가오는 일정 → 지난 소식.
// 뺀 것: 이 종목의 예상 범위 기록(변경 기록 42, 20거래일 그래프는 오늘 예측 창 안으로), 미국 시장 반응도, 큰 연결 그림(관계도 창으로).
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BottomNav } from "@/components/ui";
import { signColor } from "@/components/model";
import { demoLocked, requireUser } from "@/lib/auth";
import { DEMO_LOCK_SUB, DEMO_LOCK_TITLE, browseInstead } from "@/components/demolock";
import { portfolio, removeStock, uStock, viewingPast } from "@/lib/portfolio";
import { tierOf } from "@/lib/model";
import { closes, filings, intraday, lastCloses, quote, series } from "@/lib/prices";
import { avgFit, avgPlace, DayChart, PriceLine } from "@/components/daychart";
import { AutoRefresh } from "@/components/autorefresh";
import { MaskToggle, Sheet } from "@/components/sheet";
import { byStock, foldStories, impactFor, nightNews, stockNewsDays, verdictsOf } from "@/lib/news";
import { addDays, kstNow } from "@/lib/calendar";
import { kstTime, pct, swon, won } from "@/lib/format";
import { appNow, demoAt } from "@/lib/clock";
import { stockLinks } from "@/lib/links";
import { HotLinks } from "@/components/links";
import { PredLine } from "@/components/predline";
import { RangeTabs } from "@/components/rangetabs";
import { stockPred } from "@/lib/stockpred";
import { upcomingEvents, type Ev } from "@/lib/events";

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
  const viewPast = await viewingPast();
  const locked = await demoLocked();   // 시연 계정은 보기 전용: 삭제를 누르면 안내 창(2026-11-26)
  async function remove() {
    "use server";
    const me = await requireUser();
    if (await viewingPast()) redirect(`/mine/${code}`);   // 지난 시각에서는 지우지 않는다
    await removeStock(me.id, code);
    redirect("/mine");
  }
  const range = RANGES.find((x) => x[0] === sp.r) ?? RANGES[2];   // 처음은 1달
  const nowAt = await appNow();
  const today = kstNow(nowAt).ymd;
  const [px, q, past, fl, lc, lcSelf, day, demo, pred, news, evs] = await Promise.all([closes(code, addDays(today, -range[2])), quote(code), stockNewsDays(code, 7), filings(code, 14),
    lastCloses(pf.holdings.map((x) => x.code)), lastCloses([code]),
    range[0] === "1d" ? intraday(code) : Promise.resolve(null), demoAt(), stockPred(code),
    nightNews().then(({ articles }) => byStock(articles, [code])).catch(() => new Map()), upcomingEvents(today, [code], 30)]);
  const lk = await stockLinks([code], news);   // 연결 그림 칸 숫자 = 지금 브리핑의 이 종목 기사(뉴스 브리핑 목록과 같은 기사) 중 그 칸 검색어로 이어진 수(2026-11-26)
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
  const last = px[px.length - 1], first = px[0];
  // 평가 금액·손익은 기간 단추와 상관없이 최근 종가로(2026-11-22: '1일'은 하루치 종가만 읽어 주말·장 전엔 비어서 "—"가 나왔음). 비중 계산과 같은 값
  const cur = lc.get(code)?.close ?? lcSelf.get(code)?.close ?? last?.c ?? null;
  const value = h && cur != null ? h.qty * cur : null;
  const pnl = h?.avg && cur != null ? h.qty * (cur - h.avg) : null;
  // 가격 흐름 그림(2026-11-24): 1주는 10분·1달은 1시간마다 장중 가격(거래일 하루 = 같은 폭), 3달·1년은 일봉 종가 한 점씩
  const step = range[0] === "1w" ? 10 : range[0] === "1m" ? 30 : null;
  const pts = step ? await series(px, code, step) : px.map((p, i) => ({ x: i / Math.max(1, px.length - 1), p: p.c }));
  const chg = first && last ? last.c / first.c - 1 : 0;

  // 밤사이 이 종목 뉴스(변경 기록 27): 브리핑 기사 중 이 종목에 이어진 것. 같은 소식은 한 줄, 판정 난 것 먼저 · 매체 많은 것 먼저, 3줄까지
  const mine = news.get(code) ?? [];
  const vd = verdictsOf(mine, code);
  const folds = foldStories([...mine].sort((a, b) => b.published.localeCompare(a.published)))
    .map((f) => ({ ...f, v: impactFor(f.head, code) }))
    .sort((a, b) => Number(b.v === "negative" || b.v === "positive") - Number(a.v === "negative" || a.v === "positive") || b.rest.length - a.rest.length)
    .slice(0, 3);
  const VC: Record<string, [string, string]> = { negative: ["부정", "#b86e12"], positive: ["긍정", "#15845a"], mixed: ["엇갈림", "#66777a"], neutral: ["중립", "#66777a"] };
  const nodes = lk.get(code) ?? [];
  const newsHref = h || watch ? `/news?tab=mine&c=${code}${watch && !h ? "&v=watch" : ""}` : null;
  // 시세 요약(변경 기록 27, 2026-11-25): 전일 종가는 일봉(위 현재가와 같은 값), 거래량 · 시가총액 · 외국인 보유 · 52주(장중)는 서버 model.stock_quote_daily(lib/prices.ts quote)
  const dchg = lc.get(code) ?? lcSelf.get(code);
  const pos52 = q?.hi && q.lo && cur != null && q.hi.p > q.lo.p ? Math.max(0, Math.min(1, (cur - q.lo.p) / (q.hi.p - q.lo.p))) : null;
  const capText = (v: number) => { const eok = v / 1e8; return eok >= 1e4 ? `${(eok / 1e4).toLocaleString("ko-KR", { maximumFractionDigits: eok >= 1e6 ? 0 : 1 })}조 원` : `${Math.round(eok).toLocaleString("ko-KR")}억 원`; };
  const yChg = dchg && dchg.prev ? dchg.close / dchg.prev - 1 : null;

  // 다가오는 일정(2026-11-25): 홈과 같은 묶음(lib/events.ts upcomingEvents)에서 앞으로 30일. 칸에는 이 종목 일정 먼저, 남는 자리는 가까운 시장 일정으로 3줄, 나머지는 '더 보기' 창
  const mineEv = evs.filter((e) => e.codes.includes(code));
  const evTop = [...mineEv, ...evs.filter((e) => !e.codes.includes(code))].slice(0, 3).sort((a, b) => a.dday - b.dday);
  const EvRow = ({ e }: { e: Ev }) => {
    const d = new Date(Date.UTC(+today.slice(0, 4), +today.slice(4, 6) - 1, +today.slice(6, 8) + e.dday));
    return (
      <li><span className="d">{d.getUTCMonth() + 1}월 {d.getUTCDate()}일 ({"일월화수목금토"[d.getUTCDay()]})</span>
        <span className="t">{e.title.replace(`${u.name} `, "")}{e.codes.includes(code) ? null : <small>{e.codes.length ? "이어진 미국 기업" : "시장"}</small>}</span>
        <span className="dd">{e.dday === 0 ? "오늘" : `D-${e.dday}`}</span></li>
    );
  };

  return (
    <>
      <main className="sheet d4">
        <div className="shead"><Link href="/mine" aria-label="뒤로">‹</Link><span className="ttl">{u.name}</span><MaskToggle /></div>
        <p className="d4-who">{h ? `보유 ${h.qty.toLocaleString("ko-KR")}주${h.avg ? ` · 평단 ${won(h.avg)}` : ""}` : watch ? `관심 종목 · ${u.sector}` : `보유하지 않은 종목 · ${u.sector}`}
          {tierOf(code) === 2 ? " · 모델 설계 밖" : tierOf(code) === 3 ? " · 서비스 대상 아님" : ""}</p>

        {/* 머리(변경 기록 27): 현재가(어제 종가) · 어제 등락 → 평가 금액 · 평가 손익 → 수정 · 관심 이동 */}
        <section className="d4-top">
          <p className="cur"><b>{cur != null ? won(cur) : "—"}</b>{yChg != null ? <span style={{ color: signColor(yChg) }}>어제 {pct(yChg * 100)}</span> : null}<small>{dchg ? `${md(dchg.date)} 종가` : ""}</small></p>
          {h ? (
            <div className="val">
              <div><span>평가 금액</span><b className="amt">{value != null ? won(value) : "—"}</b></div>
              <div className="r"><span>평가 손익</span>{pnl != null ? <b style={{ color: signColor(pnl) }}><span className="amt">{swon(pnl)}</span> ({pct(((cur! / h.avg! - 1) * 100))})</b> : <b className="muted">평단을 넣으면 계산해요</b>}</div>
            </div>
          ) : null}
          <div className="acts">{h ? <><Link href={`/mine/${code}/edit`}>수량·평단 수정 ›</Link><Link href={`/mine/${code}/edit?watch=1`}>관심으로 옮기기 ›</Link></>
            : <Link href={`/mine/${code}/edit`}>보유 종목으로 추가 ›</Link>}
            {/* 종목 삭제(2026-11-26 사용자 결정: 종목 상세 단추 줄 끝 회색 '삭제' + 확인 창). 보유·관심 종목일 때만, 지난 시각을 보는 중에는 숨김 */}
            {(h || watch) && !viewPast ? (
              locked ? (
                <Sheet className="acts-del" center cancel="닫기" title={DEMO_LOCK_TITLE} sub={DEMO_LOCK_SUB} trigger={<>삭제</>}>
                  <form action={browseInstead}><button type="submit" className="dok">둘러보기 시작</button></form>
                </Sheet>
              ) : (
              <Sheet className="acts-del" center cancel="취소" title={`${u.name} 종목을 삭제할까요?`} sub="보유·관심 목록에서 모두 빠져요. 지난 기록은 그대로 남아요." trigger={<>삭제</>}>
                <form action={remove}><button type="submit" className="dok">삭제</button></form>
              </Sheet>)
            ) : null}</div>
        </section>
        <i className="d4-gap" aria-hidden />

        <PredLine p={pred} name={u.name} qty={h?.qty ?? 0} avg={h?.avg ?? null} />

        <section className="d4-sec">
          <div className="d4-h"><b>밤사이 이 종목 뉴스</b>{newsHref && mine.length ? <Link href={newsHref} className="d4-more">모두 보기 ›</Link> : null}</div>
          {mine.length ? (
            <>
              <p className="d4-vc">뉴스 {mine.length}건{vd.neg ? <> · <span className="neg">부정</span> {vd.neg}</> : null}{vd.pos ? <> · <span className="pos">긍정</span> {vd.pos}</> : null}</p>
              <ul className="d4-news">
                {folds.map(({ head: a, rest, v }) => (
                  <li key={a.key}>
                    <i style={{ background: v ? VC[v][1] : "#d8dfe0" }} aria-hidden />
                    <Link href={`/news/a/${a.key}?back=/mine/${code}`} className="c">
                      <b>{a.ko ?? a.title}</b>
                      <span>{v ? <em style={{ color: VC[v][1] }}>{VC[v][0]}</em> : null}{v ? " · " : ""}{a.source || a.outlet} · {kstTime(a.published)}{rest.length ? ` · 같은 소식 ${rest.length}건` : ""}</span>
                    </Link>
                    <a href={a.link} target="_blank" rel="noreferrer noopener" className="x" aria-label="원문 보기"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></a>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="d4-none">밤사이 이 종목에 이어진 미국 뉴스가 없어요.</p>}
          {/* 오늘 소식이 난 연결: 작은 관계 그림 + 관계도 창(2026-11-25 사용자 시안) */}
          {nodes.length ? <div className="d4-us"><HotLinks name={u.name} nodes={nodes} /></div> : null}
        </section>
        <i className="d4-gap" aria-hidden />

        <section className="d4-sec">
          <div className="d4-h"><b>시세 요약</b>{dchg ? <small>{md(dchg.date)} 종가 기준</small> : null}</div>
          <div className="d4-quote">
            <div><span>전일 종가</span><b>{dchg ? won(dchg.close) : "—"}</b></div>
            <div><span>거래량</span><b>{q?.volume != null ? `${q.volume.toLocaleString("ko-KR")}주` : "—"}</b></div>
          </div>
          <div className="d4-quote">
            <div><span>시가총액</span><b>{q?.marketCap ? capText(q.marketCap) : "—"}</b></div>
            <div><span>외국인 보유</span><b>{q?.foreign != null ? `${q.foreign.toFixed(1)}%` : "—"}</b></div>
          </div>
          {pos52 != null ? (
            <div className="d4-52">
              <span>52주 범위에서 지금 위치</span>
              <div className="d4-52bar" role="img" aria-label={`52주 최저와 최고 사이 ${Math.round(pos52 * 100)}% 위치`}><i style={{ width: `calc(9px + (100% - 18px) * ${pos52.toFixed(4)})` }} /><b style={{ left: `calc(9px + (100% - 18px) * ${pos52.toFixed(4)})` }} /></div>
              <p><span>최저 {won(q!.lo!.p)} · {md(q!.lo!.d)}</span><span>최고 {won(q!.hi!.p)} · {md(q!.hi!.d)}</span></p>
            </div>
          ) : null}
        </section>

        <section className="d4-chart">
          {range[0] === "1d" ? (
            day && day.points.length ? (() => {
              // 1일(장중 1분봉): 장이 열려 있으면 1분마다 이어 그린다. 장 전·휴장일은 마지막 거래일 하루
              // 한국거래소 정규장(09:00~15:30)만 그린다. 그래서 끝 가격은 정규장 마감가이고, 1주·1달의 '종가'(넥스트레이드 20:00까지의 마지막 가격)와 다를 수 있다
              const lp = day.points[day.points.length - 1];
              const dc = day.prev ? lp.p / day.prev - 1 : 0;
              const dl = `${Number(day.day.slice(4, 6))}/${Number(day.day.slice(6))}`;
              return <>
                {day.live && !demo ? <AutoRefresh sec={60} /> : null}
                <div className="prow2"><b>{won(lp.p)}</b><span style={{ color: signColor(dc) }}>{day.day === today ? "오늘" : dl} {pct(dc * 100)}</span>
                  <small>{day.live ? <><i className="livedot" aria-hidden />{lp.hhmm} 기준</> : "정규장 마감"}</small></div>
                <DayChart id={`c${code}-1d`} d={day} avg={h?.avg ?? null} />
                <div className="paxis"><span>{day.openAt}</span><span>12:00</span><span>{day.closeAt}</span></div>
              </>;
            })() : <p className="fine">하루 가격(1분) 자료가 아직 없어요. 장이 열리면 1분마다 그려요.</p>
          ) : <>
          <div className="prow2"><b>{last ? won(last.c) : "—"}</b><span style={{ color: signColor(chg) }}>{range[1]} {pct(chg * 100)}</span><small>{last ? `${md(last.d)} 종가` : ""}</small></div>
          {px.length > 1 ? <PriceLine id={`c${code}-${range[0]}`} pts={pts} avg={h?.avg ?? null} color0={signColor(chg)} label={`${md(first!.d)}부터 ${md(last!.d)}까지 가격`} />
            : <p className="fine">가격 자료가 아직 없어요.</p>}
          {px.length > 1 ? <div className="paxis"><span>{md(first!.d)}</span><span>{md(last!.d)}</span></div> : null}
          </>}
          <RangeTabs on={range[0]} items={RANGES.map((x) => ({ key: x[0], label: x[1], href: `/mine/${code}?r=${x[0]}` }))} />
          {h?.avg && (range[0] === "1d" ? day?.points.length : px.length > 1) ? (() => {
            // 평단이 그래프 가격과 멀면 선을 그리지 않고 글로만(점선 표시 빼고 '그래프보다 위·아래'). 1일만 쓰던 규칙을 모든 기간에(2026-11-24)
            const place = range[0] === "1d" && day ? avgPlace(day, h.avg) : avgFit(pts.map((q) => q.p), h.avg);
            return <p className="avgnote">{place === "in" ? <i aria-hidden /> : null}내 평단 <b>{won(h.avg)}</b>{place === "top" ? " · 그래프보다 위" : place === "bottom" ? " · 그래프보다 아래" : ""}</p>;
          })() : null}   {/* 차트 안 글자가 잘려서 기간 단추 아래 줄로(2026-11-22 팀원 개선 사항). 점선은 차트에 그대로 */}
        </section>
        <i className="d4-gap" aria-hidden />

        {evs.length ? (<>
          <section className="d4-sec">
            <div className="d4-h"><b>다가오는 일정</b>{evs.length > evTop.length ? (
              <Sheet className="d4-more" title={`${u.name} 다가오는 일정`} sub={`앞으로 30일 · 이 종목 일정과 시장 일정 ${evs.length}개`} trigger={<>더 보기 ›</>}>
                <ul className="d4-ev">{evs.map((e) => <EvRow key={e.dday + e.title} e={e} />)}</ul>
              </Sheet>) : null}</div>
            <ul className="d4-ev">{evTop.map((e) => <EvRow key={e.dday + e.title} e={e} />)}</ul>
          </section>
          <i className="d4-gap" aria-hidden />
        </>) : null}

        <section className="d4-sec d4-past">
          <div className="d4-h"><b>지난 소식</b>{items.length > 3 ? (
            <Sheet className="d4-more" title={`${u.name} 지난 소식`} sub={`최근 ${items.length}건 · 기사 7일 · 공시 14일`} trigger={<>더 보기 ›</>}>
              {items.map((x, k) => <PastRow key={k} x={x} md={md} />)}
            </Sheet>) : null}</div>
          {items.length ? items.slice(0, 3).map((x, k) => <PastRow key={k} x={x} md={md} />) : <p className="d4-none">최근 일주일 동안 이 종목 소식이 없어요.</p>}
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
