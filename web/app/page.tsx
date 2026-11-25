// 홈(피그마 '홈 v2' 464:8207, 보유 없음 465:8693, 06:30 전 465:8339, 주말·휴장 465:8516, 일부 못 받아옴 465:8869).
// 내 주식 변화·지도는 아침 모델, 뉴스 브리핑은 LLM 요약, 미국 시장은 us_market, 야간선물은 야간 1분봉(모두 서버 DB).
import Link from "next/link";
import { AllView } from "@/components/allview";
import { AiMark, BottomNav } from "@/components/ui";
import { NightChart, signColor } from "@/components/model";
import { FuturesHelp } from "@/components/helps";
import { BriefCards } from "@/components/brief";
import { FuturesCard } from "@/components/futcard";
import { MapCard, mapInfo } from "@/components/morningmap";
import { SectorShare } from "@/components/sectorshare";
import { Swipe } from "@/components/swipe";
import { requireUser } from "@/lib/auth";
import { portfolio, uStock } from "@/lib/portfolio";
import { nightNews, byStock, bySector, newsBuckets } from "@/lib/news";
import { aiBrief, companyReasons } from "@/lib/summary";
import { dayModel, isoDay, night as nightOf, nxtHistory, recordData } from "@/lib/model";
import { upcomingEvents } from "@/lib/events";
import { account, buildRows, P } from "@/lib/night";
import { md, usHead, usItems, usLatest } from "@/lib/market";
import { UsChips } from "@/components/ussheet";
import { lastCloses } from "@/lib/prices";
import { addDays, kstNow, minutesToOpen } from "@/lib/calendar";
import { isWeekend } from "@/lib/calendar";
import { checkTime, closedReason, isClosedDay, marketDay, nextOpenDay } from "@/lib/marketdays";
import { dateLabel, pct, swon } from "@/lib/format";
import { appNow, isDemoUser } from "@/lib/clock";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser();
  const nowDate = await appNow();   // 시연 계정이 고른 지난 시각이면 그 시각
  const now = kstNow(nowDate);
  const [acct, { brief, articles }, m, us] = await Promise.all([portfolio(user.id), nightNews(), dayModel().catch(() => null), usLatest()]);
  const usList = await usItems(us);   // 미국 시장 칸 4개와 누르면 올라오는 창(그래프 자료 포함, 2026-11-24)
  const ai = await aiBrief(brief.date);
  const before0630 = now.hour < 6 || (now.hour === 6 && now.minute < 30);
  const today = now.ymd;
  const fresh = m?.t === today && !before0630 && m.card?.status === "ok";
  const holdItems = acct.holdings.map((h) => ({ code: h.code, qty: h.qty }));
  const rows = m?.card?.status === "ok" ? buildRows(m, holdItems, m.check ? "post" : "pre") : [];
  const preRows = m?.card?.status === "ok" ? buildRows(m, holdItems, "pre") : [];
  const ac = account(preRows);
  const news = byStock(articles, [...acct.holdings.map((h) => h.code), ...acct.watch]);   // 관심 종목 기사는 한 화면에 보기 카드에서 씀
  const px = await lastCloses(acct.holdings.map((h) => h.code));   // 예상 범위 없는 종목의 지도 칸 크기(보유 금액)
  const nWatch = preRows.filter((r) => r.kind === "out" || r.kind === "low").length;
  const usInfo = usHead(us, today);   // 미국 시장 머리 줄(마감 시각) + 어젯밤 미국 휴장·조기 마감 안내
  const D = now.hour >= 18 ? today : addDays(today, -1);
  // 18:00 뒤에는 오늘 밤 진행 중인 야간선물(아침 카드의 지난밤 흐름이 아니라)
  const nightLive = !fresh || now.hour >= 18 ? await nightOf(isClosedDay(today) && m?.card?.d ? m.t : D).catch(() => null) : m?.night ?? null;
  const night = fresh && now.hour < 18 ? m?.night ?? null : nightLive;
  const nx = night?.points.length ? night.points[night.points.length - 1].r : null;
  // 야간선물 카드 아래 막대: 그 밤(D 18:00부터 12시간) 15분마다 나온 미국 기사 수
  const buckets = night?.points.length ? await newsBuckets(new Date(`${night.d.slice(0, 4)}-${night.d.slice(4, 6)}-${night.d.slice(6)}T18:00:00+09:00`)) : [];
  const hm = `${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`;
  const off = isClosedDay(today) || m?.card?.status === "holiday";
  // 06:30이 지났는데 오늘 카드가 아직 없음(야간 자료가 늦게 들어옴, 배포용 변경 기록 08)
  const delayed = !before0630 && !isClosedDay(today) && m?.t !== today;
  const hol = closedReason(today);   // 평일 휴장일이면 '신정이라' 같은 이유
  // 머리 기준 시각: 채점 뒤면 채점 시각(밤사이 탭과 같게, 2026-11-24), 그 전엔 06:30·08:11 카드 시각
  const stamp = delayed ? `${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")} · 늦어지는 중` : fresh ? `${m!.check ? m!.check.checkedAt ?? checkTime(today)[0] : m!.card!.slot === "0811" && (marketDay(today)?.premarket ?? true) ? "08:11" : "06:30"} 기준` : off ? "장이 열리지 않는 날" : `${hm} · 준비 중`;
  const mins = minutesToOpen(today, nowDate);
  const lastLabel = m ? (hol ? `${Number(m.t.slice(4, 6))}월 ${Number(m.t.slice(6))}일` : isClosedDay(today) ? `${dateLabel(isoDay(m.t)).replace(/^.*\((.)\)$/, "$1")}요일` : m.t === addDays(today, -1) ? "어제" : `${md(m.t)}`) : "";
  // 3분 브리핑 '산업'·'내 종목' 카드: 내 업종을 밤사이 뉴스가 많은 순으로, 보유 종목은 등록 순으로
  const mySectors = [...new Set(acct.holdings.map((h) => uStock(h.code)?.sector).filter(Boolean) as string[])];
  const secNews = bySector(articles, mySectors);
  const focus = { codes: acct.holdings.map((h) => h.code), names: Object.fromEntries(acct.holdings.map((h) => [h.code, uStock(h.code)?.name ?? h.code])),
    sectors: [...mySectors].sort((a, b) => (secNews.get(b)?.length ?? 0) - (secNews.get(a)?.length ?? 0)) };
  // 예상 전(06:30 전·주말·휴장일) 지도: 크기만 보유 금액, 칸에는 '06:30 공개'·'쉬는 날'(피그마 465:8339 · 465:8516)
  // '한 화면에 보기'(원래 버전처럼 밤사이 정보를 한 화면에): 2026-11-24부터 전환 단추 대신 홈 맨 위 카드를 누르면 /?view=all 로 들어온다.
  // 오늘 예상이 나온 때만 그 화면, 그 밖의 상태(06:30 전·휴장·지연)는 홈과 같다
  const allMode = (await searchParams).view === "all";
  const allOn = allMode && fresh && acct.holdings.length > 0;
  // 한 화면에 보기 관심 종목 카드(수량 0, 2026-11-24): 보유와 겹치는 코드는 뺀다
  const watchRows = allOn ? buildRows(m, acct.watch.filter((c) => !acct.holdings.some((h) => h.code === c)).map((code) => ({ code, qty: 0 })), m!.check ? "post" : "pre") : [];
  const [reasons, rec, nxtHist, events] = allOn ? await Promise.all([companyReasons(brief.date), recordData(acct.holdings.map((h) => h.code), 20), nxtHistory(acct.holdings.map((h) => h.code), m!.t),
    upcomingEvents(m!.t, [...acct.holdings.map((h) => h.code), ...acct.watch])])
    : [new Map(), null, new Map<string, [number, number]>(), []];
  const recN = rec ? [...rec.cells.values()].flatMap((m) => [...m.values()]).filter((c) => c.in80 != null) : [];
  const after0811 = now.hour * 100 + now.minute >= 811;
  const slot0811 = m?.card?.slot === "0811" && (marketDay(today)?.premarket ?? true);
  // 단계를 누르면 그 시점 화면(시연 계정만, 테스트 편의, 2026-11-23): 단계 시각 그대로(경계 시각, 2026-11-24) 시연 시각을 바꾼다. 아직 오지 않은 시각은 링크 없음
  const demoUser = await isDemoUser();
  const stepAt = (hm: string) => {
    if (!demoUser) return undefined;
    const [h, mi] = hm.split(":").map(Number), t = h * 60 + mi;
    const stamp = `${today}${String(Math.floor(t / 60)).padStart(2, "0")}${String(t % 60).padStart(2, "0")}`;
    const real = new Date(), at = new Date(`${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:00+09:00`);
    return at.getTime() <= real.getTime() ? stamp : undefined;
  };
  const checkHm = (m?.t === today ? m.check?.checkedAt : null) ?? checkTime(today)[0];   // 오늘 채점 전이면 어제 채점 시각이 아니라 기준 시각(개장 5분 뒤)
  const steps = [{ t: "06:00", label: "야간장 마감", done: true, at: stepAt("06:00") }, { t: "06:30", label: "예상", done: true, at: stepAt("06:30") },
    { t: "08:11", label: "장전 거래", done: slot0811, at: stepAt("08:11") }, { t: checkHm, label: "채점", done: !!m?.check, at: stepAt(checkHm) }];
  // 맨 위 카드 금액과 문장: 채점 뒤엔 실제, 전엔 예상. 문장 = 합계와 같은 방향 종목 중 가장 큰 종목이 그 방향 금액의 몇 %(한 화면에 보기 문장과 같은 계산)
  const cardRows = (m?.check ? rows : preRows).filter((r) => r.amount != null && r.qty > 0);
  const topAmt = (m?.check ? account(rows) : ac).amount;   // 예전 카드와 같은 합계
  const sameDir = cardRows.filter((r) => Math.sign(r.amount!) === Math.sign(topAmt) && r.amount !== 0).sort((a, b) => Math.abs(b.amount!) - Math.abs(a.amount!));
  const sameSum = sameDir.reduce((a, r) => a + Math.abs(r.amount!), 0);
  const topLine = sameDir[0] && sameSum ? `${topAmt < 0 ? (m?.check ? "줄어든" : "줄어들") : (m?.check ? "늘어난" : "늘어날")} 금액의 ${Math.round((100 * Math.abs(sameDir[0].amount!)) / sameSum)}%가 ${sameDir[0].name}${/[가-힣]$/.test(sameDir[0].name) && (sameDir[0].name.charCodeAt(sameDir[0].name.length - 1) - 0xac00) % 28 ? "이에요" : "예요"}.` : "";
  const map = mapInfo({ today, fresh, off, delayed, slot0811, after0811, preRows, holdings: holdItems, px, news });

  return (
    <>
      <header className={`head homehead${allOn ? " allon" : ""}`}>
        <h1>{allOn ? <><Link href="/" className="hback" aria-label="홈으로">‹</Link>당신이 잠든 사이에</> : "오늘의 출발"}</h1>   {/* 2026-11-25 사용자 결정: 홈 이름 '오늘의 출발', 달 카드를 눌러 들어간 한 화면에 보기만 '당신이 잠든 사이에' */}
        <p className="sub">{dateLabel(isoDay(today))} · {stamp} · {user.username}</p>
        <Link href="/my" className="my" aria-label="마이"><img src="/icons/my.svg" alt="" width={23} height={23} /></Link>
        <Link href="/alerts" className="bell" aria-label="알림"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15L6 17Zm4 3h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>{fresh && nWatch ? <i /> : null}</Link>
      </header>
      <main className="scroll home">
        {allMode && demoUser && !allOn && !off ? (   // 06:30 전처럼 한 화면에 보기가 안 나오는 시각에도 단계 줄(시연 계정만): 눌러서 다른 시점으로
          <ol className="allsteps stepnav">
            {steps.map((x) => <li key={x.t}>{x.at ? <a href={`/demo-time?at=${x.at}&back=${encodeURIComponent("/?view=all")}`} aria-label={`${x.t} ${x.label} 시점 화면 보기`}><i /><b>{x.t}</b><span>{x.label}</span></a> : <><i /><b>{x.t}</b><span>{x.label}</span></>}</li>)}
          </ol>
        ) : null}
        {allOn ? (
          <AllView after0811={after0811} t={m!.t} rows={rows} watchRows={watchRows} preRows={preRows} post={!!m!.check} slot0811={slot0811} steps={steps} news={news} reasons={reasons} x={m!.card?.x ?? null} nxtHist={nxtHist} events={events} noPre={marketDay(today)?.premarket === false} openAt={marketDay(today)?.openAt || "09:00"}
            lines={new Map([...ai.companies].map(([k, v]) => [k, { line: v.line }]))} record={recN.length ? { inN: recN.filter((c) => c.in80).length, n: recN.length } : null}
            us={us} usList={usList} night={night} buckets={buckets} nightLive={now.hour >= 18}
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
            <div className="big"><span>다음 예상 {dateLabel(isoDay(nextOpenDay(today)))} 06:30</span></div>
            {m ? <p className="wb">아래 지도와 소식은 {hol ? dateLabel(isoDay(m.t)) : lastLabel} 기준이에요</p> : null}
            {m ? <Link href={`/night?d=${m.t}`} className="wlink">{lastLabel} 결과 보기 <em>›</em></Link> : null}</section>
        ) : delayed ? (
          <section className="acct wait"><div className="at">오늘 예상이 조금 늦어지고 있어요</div>
            <div className="big"><span>준비 중</span></div>
            <p className="wb">야간 거래 데이터가 늦게 들어왔어요 · 준비되면 알림으로 알려드릴게요</p></section>
        ) : !fresh ? (
          <section className="acct wait"><div className="at">오늘 시가 예상을 준비하고 있어요</div>
            <div className="big"><span>{before0630 && mins > 0 ? `${mins >= 60 ? `${Math.floor(mins / 60)}시간 ` : ""}${mins % 60}분 후 공개` : "곧 공개"}</span></div>
            <p className="wb">야간 거래가 06:00에 끝나서 내 계좌 예상을 계산하고 있어요 · 06:30 공개</p>
            {m ? <Link href={`/night?d=${m.t}`} className="wlink">{lastLabel === "어제" ? "어제" : `${lastLabel}`} 결과 보기 <em>›</em></Link> : null}</section>
        ) : (
          // 맨 위 카드(2026-11-24 시안): 달 그림 · 시각 이름표 · '당신이 잠든 사이에' · 설명 · 금액 · 가장 큰 종목 문장. 카드를 누르면 한 화면에 보기(/?view=all)
          <Link href="/?view=all" className="nightcard" aria-label="당신이 잠든 사이에 · 한 화면에 보기">
            <span className="moon" aria-hidden><svg width="30" height="30" viewBox="0 0 30 30"><path d="M19.5 4.5a11 11 0 1 0 6 18.6A9 9 0 0 1 19.5 4.5Z" fill="#ffd970" /></svg></span>
            <span className="nc-b">
              <em className="nc-tag">{m!.check ? `${checkHm} 채점 완료` : slot0811 ? "08:11 새로 반영" : "06:30 예상"}</em>
              <b className="nc-t">당신이 잠든 사이에</b>
              <span className="nc-s">{m!.check ? "오늘 시가로 실제 바뀐 내 주식" : "오늘 9시에 예상되는 내 주식 변화"}</span>
              <span className="nc-amt amt" style={{ color: signColor(topAmt) }}>{swon(topAmt)}</span>
              {topLine ? <span className={`nc-l${topLine.length > 24 ? " long" : ""}`}>{topLine}</span> : null}
            </span>
            <em className="nc-go" aria-hidden>›</em>
          </Link>
        )}

        <div className="hrow"><h2>뉴스 브리핑 <AiMark /></h2><Link href="/news">전체 보기</Link></div>
        {/* 장이 열리는 날: 가로로 넘기는 카드(시장 / 산업 / 내 종목). 주말·휴장일과 요약이 없을 때: 예전 카드에서 '3분 브리핑 읽기' 줄만 뺌 */}
        {!off && ai.macro.length ? <BriefCards brief={ai} focus={focus} mineFirst /> : (
          <Link href="/news" className="hcard">
            <span className="k">오늘의 핵심 3가지</span>
            <span className="hl">{ai.title ?? (articles.length ? `미국 뉴스 ${articles.length}건을 모았어요` : "오늘은 관련 소식이 없어요")}</span>
            <span className="kw">{ai.keywords.length ? ai.keywords.join(" · ") : "AI 요약은 준비 중이에요"}</span>
          </Link>
        )}

        {/* 머리 줄 마감 시각은 조기 마감이면 13:00, 어젯밤 미국이 휴장·조기 마감이면 칸 아래 한 줄 안내(2026-11-25, 달력 web/data/special_days.csv) */}
        <div className="hrow"><h3>미국 시장</h3><span className="fine">{usInfo.head}</span></div>
        <UsChips items={usList} />
        {usInfo.note ? <p className="usnight">{usInfo.note}</p> : null}

        {!night?.points.length ? (
          // 연휴처럼 전날 밤 거래가 없으면 회색 띠 + '거래 없음'. 띠는 누를 수 없고 ?는 동작(규칙표 331:1379 야간선물)
          <div className="futbar off">
            <span className="nm"><b className="tq">코스피200 야간선물<FuturesHelp /></b><small>어젯밤 18:00 ~ 06:00</small></span>
            <span className="chg"><b>거래 없음</b></span>
          </div>
        ) : <FuturesCard night={night} live={now.hour >= 18} buckets={buckets} />}

        {/* 지도와 업종별 투자 비중을 옆으로 넘겨 본다(2026-11-24, 내 종목 탭과 같음). 홈은 지도가 첫 장 */}
        {acct.holdings.length ? (
          <Swipe labels={["오늘 아침 내 종목 지도", "업종별 투자 비중"]}>
            {map ? <MapCard info={map} /> : null}
            <SectorShare holdings={holdItems} px={px} />
          </Swipe>
        ) : null}
        <p className="fine">모델 추정이며 투자 권유가 아니에요.</p>
        </>}
      </main>
      <BottomNav active="home" />
    </>
  );
}
