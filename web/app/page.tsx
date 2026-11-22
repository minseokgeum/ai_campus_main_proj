// 홈(피그마 '홈 v2' 464:8207, 보유 없음 465:8693, 07:30 전 465:8339, 주말·휴장 465:8516, 일부 못 받아옴 465:8869).
// 내 주식 변화·지도는 아침 모델, 뉴스 브리핑은 LLM 요약, 미국 시장은 us_market, 야간선물은 야간 1분봉(모두 서버 DB).
import Link from "next/link";
import { cookies } from "next/headers";
import { ViewToggle } from "@/components/viewtoggle";
import { AllView } from "@/components/allview";
import { BottomNav } from "@/components/ui";
import { NightChart, signColor } from "@/components/model";
import { MaskToggle, Sheet } from "@/components/sheet";
import { FuturesHelp } from "@/components/helps";
import { BriefCards } from "@/components/brief";
import { FuturesCard } from "@/components/futcard";
import { MapLegend, TreeMap } from "@/components/treemap";
import { requireUser } from "@/lib/auth";
import { portfolio, uStock } from "@/lib/portfolio";
import { nightNews, byStock, bySector, newsBuckets } from "@/lib/news";
import { aiBrief, companyReasons } from "@/lib/summary";
import { dayModel, isoDay, night as nightOf, recordData } from "@/lib/model";
import { account, buildRows, P } from "@/lib/night";
import { md, US, usLatest } from "@/lib/market";
import { lastCloses } from "@/lib/prices";
import { addDays, kstNow, minutesTo0730 } from "@/lib/calendar";
import { isWeekend } from "@/lib/calendar";
import { checkTime, closedReason, isClosedDay, marketDay, nextOpenDay } from "@/lib/marketdays";
import { dateLabel, pct, swon } from "@/lib/format";
import { appNow } from "@/lib/clock";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  const nowDate = await appNow();   // 시연 계정이 고른 지난 시각이면 그 시각
  const now = kstNow(nowDate);
  const [acct, { brief, articles }, m, us] = await Promise.all([portfolio(user.id), nightNews(), dayModel().catch(() => null), usLatest()]);
  const ai = await aiBrief(brief.date);
  const before0730 = now.hour < 7 || (now.hour === 7 && now.minute < 30);
  const today = now.ymd;
  const fresh = m?.t === today && !before0730 && m.card?.status === "ok";
  const holdItems = acct.holdings.map((h) => ({ code: h.code, qty: h.qty }));
  const rows = m?.card?.status === "ok" ? buildRows(m, holdItems, m.check ? "post" : "pre") : [];
  const preRows = m?.card?.status === "ok" ? buildRows(m, holdItems, "pre") : [];
  const ac = account(preRows);
  const news = byStock(articles, acct.holdings.map((h) => h.code));
  const px = await lastCloses(acct.holdings.map((h) => h.code));   // 예상 범위 없는 종목의 지도 칸 크기(보유 금액)
  const nWatch = preRows.filter((r) => r.kind === "out" || r.kind === "low").length;
  const nIn = rows.filter((r) => r.c?.in80).length;
  const nNot = preRows.filter((r) => r.kind === "notservice").length;
  const nMiss = preRows.filter((r) => r.kind === "nocalc").length;
  const usDate = us.get("^GSPC")?.usDate;
  const D = now.hour >= 18 ? today : addDays(today, -1);
  // 18:00 뒤에는 오늘 밤 진행 중인 야간선물(아침 카드의 지난밤 흐름이 아니라)
  const nightLive = !fresh || now.hour >= 18 ? await nightOf(isClosedDay(today) && m?.card?.d ? m.t : D).catch(() => null) : m?.night ?? null;
  const night = fresh && now.hour < 18 ? m?.night ?? null : nightLive;
  const nx = night?.points.length ? night.points[night.points.length - 1].r : null;
  // 야간선물 카드 아래 막대: 그 밤(D 18:00부터 12시간) 15분마다 나온 미국 기사 수
  const buckets = night?.points.length ? await newsBuckets(new Date(`${night.d.slice(0, 4)}-${night.d.slice(4, 6)}-${night.d.slice(6)}T18:00:00+09:00`)) : [];
  const hm = `${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`;
  const off = isClosedDay(today) || m?.card?.status === "holiday";
  // 07:30이 지났는데 오늘 카드가 아직 없음(야간 자료가 늦게 들어옴, 배포용 변경 기록 08)
  const delayed = !before0730 && !isClosedDay(today) && m?.t !== today;
  const hol = closedReason(today);   // 평일 휴장일이면 '신정이라' 같은 이유
  const stamp = delayed ? `${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")} · 늦어지는 중` : fresh ? `${m!.card!.slot === "0811" && (marketDay(today)?.premarket ?? true) ? "08:11" : "07:30"} 기준` : off ? "장이 열리지 않는 날" : `${hm} · 준비 중`;
  const mins = minutesTo0730(today, nowDate);
  const lastLabel = m ? (hol ? `${Number(m.t.slice(4, 6))}월 ${Number(m.t.slice(6))}일` : isClosedDay(today) ? `${dateLabel(isoDay(m.t)).replace(/^.*\((.)\)$/, "$1")}요일` : m.t === addDays(today, -1) ? "어제" : `${md(m.t)}`) : "";
  // 3분 브리핑 '산업'·'내 종목' 카드: 내 업종을 밤사이 뉴스가 많은 순으로, 보유 종목은 등록 순으로
  const mySectors = [...new Set(acct.holdings.map((h) => uStock(h.code)?.sector).filter(Boolean) as string[])];
  const secNews = bySector(articles, mySectors);
  const focus = { codes: acct.holdings.map((h) => h.code), names: Object.fromEntries(acct.holdings.map((h) => [h.code, uStock(h.code)?.name ?? h.code])),
    sectors: [...mySectors].sort((a, b) => (secNews.get(b)?.length ?? 0) - (secNews.get(a)?.length ?? 0)) };
  // 예상 전(07:30 전·주말·휴장일) 지도: 크기만 보유 금액, 칸에는 '07:30 공개'·'쉬는 날'(피그마 465:8339 · 465:8516)
  // '한 화면에 보기'(원래 버전처럼 밤사이 정보를 한 화면에): 쿠키로 기억. 오늘 예상이 나온 때만 그 화면, 그 밖의 상태(07:30 전·휴장·지연)는 나눠 보기와 같다
  const allMode = (await cookies()).get("home_view")?.value === "all";
  const allOn = allMode && fresh && acct.holdings.length > 0;
  const [reasons, rec] = allOn ? await Promise.all([companyReasons(brief.date), recordData(acct.holdings.map((h) => h.code), 20)]) : [new Map(), null];
  const recN = rec ? [...rec.cells.values()].flatMap((m) => [...m.values()]).filter((c) => c.in80 != null) : [];
  const slot0811 = m?.card?.slot === "0811" && (marketDay(today)?.premarket ?? true);
  const steps = [{ t: "06:00", label: "야간장 마감", done: true }, { t: "07:30", label: "예상", done: true },
    { t: "08:11", label: "장전 거래", done: slot0811 }, { t: m?.check?.checkedAt ?? checkTime(today)[0], label: "채점", done: !!m?.check }];
  const idleStocks = acct.holdings.map((h) => { const u = uStock(h.code); return { code: h.code, name: u?.name ?? h.code, sector: u?.sector ?? "기타", value: h.qty * (px.get(h.code)?.close ?? 0), pct: null, grade: null, l80: null, u80: null, news: news.get(h.code)?.length ?? 0 }; });

  return (
    <>
      <header className="head homehead">
        <h1>투자 브리핑</h1>
        <p className="sub">{dateLabel(isoDay(today))} · {stamp} · {user.username}</p>
        <Link href="/my" className="my" aria-label="마이"><img src="/icons/my.svg" alt="" width={23} height={23} /></Link>
        <Link href="/alerts" className="bell" aria-label="알림"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15L6 17Zm4 3h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>{fresh && nWatch ? <i /> : null}</Link>
      </header>
      <main className="scroll home">
        {acct.holdings.length ? <ViewToggle all={allMode} /> : null}
        {allOn ? (
          <AllView rows={rows} preRows={preRows} post={!!m!.check} slot0811={slot0811} steps={steps} news={news} reasons={reasons}
            lines={new Map([...ai.companies].map(([k, v]) => [k, { line: v.line }]))} record={recN.length ? { inN: recN.filter((c) => c.in80).length, n: recN.length } : null}
            us={us} night={night} buckets={buckets} nightLive={now.hour >= 18}
            briefSlot={!off && ai.macro.length ? <BriefCards brief={ai} focus={focus} /> : null} />
        ) : <>
        {!acct.holdings.length ? (
          <div className="emptycard">
            <span className="plus">+</span>
            <b>보유 종목을 넣어 주세요</b>
            <p>매일 아침 오늘 시가에 내 계좌가 얼마나 바뀔지 알려드려요</p>
            <Link href="/mine/add" className="primary">종목 추가하기</Link>
          </div>
        ) : off ? (
          <section className="acct wait"><div className="at">{isWeekend(today) ? "주말이라 장이 열리지 않아요" : `${hol ?? "휴장일이라"} 장이 열리지 않아요`}</div>
            <div className="big"><span>다음 예상 {dateLabel(isoDay(nextOpenDay(today)))} 07:30</span></div>
            {m ? <p className="wb">아래 지도와 소식은 {hol ? dateLabel(isoDay(m.t)) : lastLabel} 기준이에요</p> : null}
            {m ? <Link href={`/night?d=${m.t}`} className="wlink">{lastLabel} 결과 보기 <em>›</em></Link> : null}</section>
        ) : delayed ? (
          <section className="acct wait"><div className="at">오늘 예상이 조금 늦어지고 있어요</div>
            <div className="big"><span>준비 중</span></div>
            <p className="wb">야간 거래 데이터가 늦게 들어왔어요 · 준비되면 알림으로 알려드릴게요</p></section>
        ) : !fresh ? (
          <section className="acct wait"><div className="at">오늘 시가 예상을 준비하고 있어요</div>
            <div className="big"><span>{before0730 && mins > 0 ? `${mins >= 60 ? `${Math.floor(mins / 60)}시간 ` : ""}${mins % 60}분 후 공개` : "곧 공개"}</span></div>
            <p className="wb">야간 거래가 06:00에 끝나서 내 계좌 예상을 계산하고 있어요 · 07:30 공개</p>
            {m ? <Link href={`/night?d=${m.t}`} className="wlink">{lastLabel === "어제" ? "어제" : `${lastLabel}`} 결과 보기 <em>›</em></Link> : null}</section>
        ) : (
          <section className="acct">
            <div className="at"><span>{m!.check ? "오늘 시가로 실제 바뀐 내 주식" : "오늘 시가에 예상되는 내 주식 변화"}</span><MaskToggle /><Link href="/night" className="linkish teal">밤사이 ›</Link></div>
            <div className="big" style={{ color: signColor(m!.check ? account(rows).amount : ac.amount) }}>
              <span className="amt tot">{swon(m!.check ? account(rows).amount : ac.amount)}</span><small>{pct(P(m!.check ? account(rows).pct : ac.pct))}</small>
            </div>
            <div className="hchips">
              {m!.check ? <span>채점 · 범위 안 {nIn} / {rows.filter((r) => r.c).length}</span>
                : <Link href="/night?f=out" className="warnchip"><i />확인 필요 {nWatch}종목 ›</Link>}
              <span>{m!.check ? "" : `범위 안 ${preRows.filter((r) => r.kind === "ok").length}`}{nNot ? ` · 대상 아님 ${nNot}` : ""}{nMiss ? ` · 못 받아옴 ${nMiss}` : ""}</span>
            </div>
          </section>
        )}

        <div className="hrow"><h2>뉴스 브리핑 <span className="aimark" aria-label="AI 요약"><svg width="14" height="12" viewBox="0 0 14 12" aria-hidden><path d="M1 2h12M1 6h9M1 10h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>AI</span></h2><Link href="/news">전체 보기</Link></div>
        {/* 장이 열리는 날: 가로로 넘기는 카드(시장 / 산업 / 내 종목). 주말·휴장일과 요약이 없을 때: 예전 카드에서 '3분 브리핑 읽기' 줄만 뺌 */}
        {!off && ai.macro.length ? <BriefCards brief={ai} focus={focus} /> : (
          <Link href="/news" className="hcard">
            <span className="k">오늘의 핵심 3가지</span>
            <span className="hl">{ai.title ?? (articles.length ? `미국 뉴스 ${articles.length}건을 모았어요` : "오늘은 관련 소식이 없어요")}</span>
            <span className="kw">{ai.keywords.length ? ai.keywords.join(" · ") : "AI 요약은 준비 중이에요"}</span>
          </Link>
        )}

        <div className="hrow"><h3>미국 시장</h3><span className="fine">{usDate ? `${md(usDate)} 16:00 마감 (미 동부)` : "자료 준비 중"}</span></div>
        <div className="uschips">
          {US.map((u) => {
            const d = us.get(u.sym);
            return (
              <Link key={u.sym} href={`/us?s=${encodeURIComponent(u.sym)}`} className="uschip">
                <span>{u.short}</span>
                <b style={{ color: signColor(d?.chg ?? 0) }}>{d ? pct(P(d.chg)) : "—"}</b>
              </Link>
            );
          })}
        </div>

        {!night?.points.length ? (
          // 연휴처럼 전날 밤 거래가 없으면 회색 띠 + '거래 없음'. 띠는 누를 수 없고 ?는 동작(규칙표 331:1379 야간선물)
          <div className="futbar off">
            <span className="nm"><b className="tq">코스피200 야간선물<FuturesHelp /></b><small>어젯밤 18:00 ~ 06:00</small></span>
            <span className="chg"><b>거래 없음</b></span>
          </div>
        ) : <FuturesCard night={night} live={now.hour >= 18} buckets={buckets} />}

        {fresh && preRows.some((r) => r.value) ? (
          <section className="mapsec">
            <div className="hrow"><h3 className="tq">오늘 아침 내 종목 지도<MapHelp /></h3><Link href="/night" className="linkish teal">밤사이 자세히 ›</Link></div>
            <p className="fine">{m!.card!.slot === "0811" && (marketDay(today)?.premarket ?? true) ? "08:11" : "07:30"} 기준 · 장 전 · 오늘 예상 시가</p>
            <TreeMap stocks={preRows.map((r) => ({
              code: r.code, name: r.name, sector: r.sector, value: r.value ?? r.qty * (px.get(r.code)?.close ?? 0),
              pct: r.kind === "notservice" || r.kind === "nocalc" ? null : r.pct, grade: r.s?.grade ?? null,
              l80: r.s?.l80 ?? null, u80: r.s?.u80 ?? null, news: news.get(r.code)?.length ?? 0 }))} />
            <MapLegend />
          </section>
        ) : !fresh && acct.holdings.length && idleStocks.some((s) => s.value > 0) ? (
          <section className="mapsec">
            <div className="hrow"><h3 className="tq">오늘 아침 내 종목 지도<MapHelp /></h3><Link href="/night" className="linkish teal">밤사이 자세히 ›</Link></div>
            <p className="fine">보유 비중 · {off ? `다음 예상 ${dateLabel(isoDay(nextOpenDay(today)))} 07:30` : delayed ? "오늘 예상은 준비되면 채워져요" : "오늘 예상은 07:30에 채워져요"}</p>
            <TreeMap stocks={idleStocks} idle={off ? "쉬는 날" : delayed ? "준비 중" : "07:30 공개"} />
            <MapLegend idle />
          </section>
        ) : null}
        <p className="fine">모델 추정이며 투자 권유가 아니에요.</p>
        </>}
      </main>
      <BottomNav active="home" />
    </>
  );
}

function MapHelp() {
  return (
    <Sheet className="qmark" title="오늘 아침 내 종목 지도" confirm="확인" trigger={<span aria-label="지도 설명">?</span>}>
      <div className="help">
        <b>어떻게 읽나요?</b><p>업종별로 내 종목을 모았어요. 칸이 클수록 보유 금액이 커요.</p>
        <b>색</b><p>예상 시가가 어제 종가보다 위면 빨강, 아래면 파랑이에요. 진할수록 많이 움직일 것으로 예상해요(±2%까지).</p>
        <b>흐린 칸</b><p>믿을 정도가 낮아서 방향이 불확실한 종목이에요.</p>
        <b>소식</b><p>밤사이 그 종목과 관련된 미국 기사 수예요.</p>
      </div>
    </Sheet>
  );
}
