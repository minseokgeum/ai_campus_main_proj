// 밤사이 시가예측(피그마 밤사이 v4: 보유 448:6559, 장 후 410:6525, 07:30 전 449:2, 주말 461:8369, 보유 없음 449:908, 관심 없음 462:8056,
// 월요일 563:697, 연휴 다음 날 461:7929, 미국 휴장 461:7489, 일부 못 받아옴 449:469, 스크롤 448:7077, 필터 결과 462:8306·462:8745).
// 종목 창·수량 바꾸기는 components/nightboard.tsx(목록 위로 반쯤 올라오는 창). 서버 DB model 영역의 카드·채점을 내 수량으로 계산한다.
import Link from "next/link";
import { BottomNav, StockNews } from "@/components/ui";
import { NightChart, signColor } from "@/components/model";
import { MaskToggle } from "@/components/sheet";
import { FuturesFlow } from "@/components/futcard";
import { ProgressSheet } from "@/components/progress";
import { FuturesHelp, GradeHelp, NotServiceHelp } from "@/components/helps";
import { NightBoard, type BRow } from "@/components/nightboard";
import { NightHead } from "@/components/nighthead";
import { Banner, progressDetails, SectorSheet, SkeletonList, SortSheet, WaitState } from "@/components/nightparts";
import { requireUser } from "@/lib/auth";
import { portfolio } from "@/lib/portfolio";
import { dayModel, isoDay, modelDates, night as nightOf } from "@/lib/model";
import { account, buildRows, bySector, nightHref, ordered, P, SORT_LABEL, type NQ, type Phase, type Row } from "@/lib/night";
import { byStock, foldStories, groupByVerdict, impactFor, nightNews, verdictsOf } from "@/lib/news";
import { addDays, isWeekend, kstNow, minutesTo0730, weekday } from "@/lib/calendar";
import { afterHoliday, checkTime, closedName, closedReason, etToKstHour, marketDay, nameIra, nextOpenDay, usNight } from "@/lib/marketdays";
import { dateLabel, pct } from "@/lib/format";
import { appNow } from "@/lib/clock";

export const dynamic = "force-dynamic";

type Q = NQ & { open?: string };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NightHead tab="pred" />
      <main className="scroll nt">{children}</main>
      <BottomNav active="night" />
    </>
  );
}

function DateLine({ label, sub, prev, next, base, right }: { label: string; sub: string; prev?: string; next?: string; base?: Q; right?: React.ReactNode }) {
  return (
    <>
      <div className="ndate">
        <div className="nav2">
          {prev ? <Link href={nightHref({ ...(base ?? {}), f: undefined }, { d: prev })} aria-label="이전 날짜">‹</Link> : <span className="off">‹</span>}
          <b>{label}</b>
          {next ? <Link href={nightHref({ ...(base ?? {}), f: undefined }, { d: next })} aria-label="다음 날짜">›</Link> : <span className="off">›</span>}
        </div>
        {right}
      </div>
      <p className="ntime">{sub}</p>
    </>
  );
}

function NoHoldings({ night }: { night: Awaited<ReturnType<typeof nightOf>> }) {
  return (
    <>
      <div className="emptycard">
        <span className="plus">+</span>
        <b>아직 등록한 종목이 없어요</b>
        <p>보유 종목을 추가하면 매일 아침<br />오늘 시가에 내 계좌가 얼마나 바뀔지 알려드려요</p>
        <Link href="/mine/add" className="primary">종목 추가하기</Link>
      </div>
      {night ? <div className="fut"><p className="fine">어젯밤 18:00 ~ 오늘 06:00 · 어제 마감 대비</p><NightChart night={night} /><div className="axis"><span>18:00</span><span>23:30 미국 개장</span><span>06:00 마감</span></div></div> : null}
    </>
  );
}

const wd = (t: string) => "일월화수목금토"[weekday(t)];

/** 그날 개장 시각·채점 시각·개장 전 거래 여부(special_days.csv, 표에 없으면 보통 날) */
function dayInfo(t: string, checkedAt: string | null = null) {
  const d = marketDay(t);
  const openAt = d?.openAt || "09:00";
  // chk: 채점을 마쳤으면 실제 채점 시각(지난 기록은 개장 5분 뒤), 아직이면 '09:00 개장 직후'(서버가 시가가 들어오는 즉시 채점)
  return { openAt, chk: checkedAt ?? checkTime(t)[0], next: `${openAt} 개장 직후`, premarket: d ? d.premarket : true };
}

const toB = (r: Row, nNews: number, avg: number | null = null, v?: { neg: number; pos: number; neu: number }): BRow => ({
  code: r.code, name: r.name, sector: r.sector, tier: r.tier, kind: r.kind, side: r.side, qty: r.qty,
  pc: r.s?.pc ?? null, h: r.s?.h ?? null, l80: r.s?.l80 ?? null, u80: r.s?.u80 ?? null, l90: r.s?.l90 ?? null, u90: r.s?.u90 ?? null,
  grade: r.s?.grade ?? null, gap: r.s?.gap ?? null, hb: r.s?.hb ?? null, lb: r.s?.lb ?? null, ub: r.s?.ub ?? null, nxtG: r.s?.nxtG ?? null, earn: !!r.s?.earn, y: r.c?.y ?? null, open: r.c?.open ?? null, in80: r.c?.in80 ?? null, nNews, avg, v,
});

export default async function Night({ searchParams }: { searchParams: Promise<Q> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const [pf, dates] = await Promise.all([portfolio(user.id), modelDates()]);
  const nowDate = await appNow();
  const now = kstNow(nowDate);
  const today = now.ymd;
  const before0730 = now.hour < 7 || (now.hour === 7 && now.minute < 30);
  const pick = sp.d && dates.includes(sp.d) ? sp.d : undefined;

  // 날짜를 고르지 않았을 때: 주말·휴장일 / 07:30 전(오늘 카드 공개 전) 화면
  if (!pick && !sp.open) {
    const last = dates[0];
    const hol = closedName(today);   // 평일 휴장일(special_days.csv)
    if (isWeekend(today) || hol) {
      const prevNight = last ? await nightOf(last).catch(() => null) : null;
      const next = nextOpenDay(today);
      return (
        <Shell>
          <DateLine label={dateLabel(isoDay(today))} sub={hol ? `오늘은 장이 열리지 않아요 · ${hol[0] === "공휴일" ? "공휴일" : "증시 휴장"} · ${hol[1]}` : "오늘은 장이 열리지 않아요"} prev={last} />
          <WaitState kicker={hol ? `${closedReason(today)} 장이 열리지 않아요` : "주말이라 장이 열리지 않아요"} title={`다음 예상 ${dateLabel(isoDay(next))} 07:30`}
            body={hol ? `${dateLabel(isoDay(next))} 아침에는 ${dateLabel(isoDay(last ?? today))} 밤 야간 거래 결과를 반영해요.` : `${wd(next)}요일 아침에는 ${wd(last ?? today)}요일 밤 야간 거래 결과를 반영해요.`}
            link={last ? { href: `/night?d=${last}`, label: `${dateLabel(isoDay(last)).replace(/ \(.\)/, "")} 결과 보기` } : undefined}
            night={prevNight} nightNote={`${wd(last ?? today)}요일 밤 야간 거래 결과 · ${wd(addDays(last ?? today, 1))}요일 06:00 마감`} />
        </Shell>
      );
    }
    if (last !== today || before0730) {
      const D = now.hour >= 18 ? today : addDays(today, -1);
      const nightNow = await nightOf(D).catch(() => null);
      const mins = minutesTo0730(today, nowDate);
      const closed = now.hour >= 6;
      const hm = `${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`;
      const late = !before0730;   // 07:30이 지났는데 오늘 카드가 없음 = 늦어지는 중(배포용 변경 기록 08, 피그마 784:1573)
      return (
        <Shell>
          <DateLine label={dateLabel(isoDay(today))} sub={late ? `${hm} · 늦어지는 중 · 준비되면 알려드려요` : `${hm} · 준비 중 · 07:30에 공개돼요`} prev={last}
            right={<div className="pp"><span className="on">장전</span><span className="dis">장후</span></div>} />
          <ProgressSheet stage={closed ? 1 : 0} details={progressDetails(closed ? 1 : 0, { 높음: 0, 보통: 0, 낮음: 0, 대상아님: 0 }, null, dayInfo(today))} chk={dayInfo(today).next}
            slotTitle={closed ? "야간 거래 마감 · 06:00" : "야간 거래 진행 중"} slotSub={late ? "마감 데이터가 늦게 들어와 계산이 늦어지고 있어요" : closed ? "예상 범위를 계산했어요 · 07:30에 공개" : "마감되면 예상 범위를 계산해요"} />
          {pf.holdings.length ? (
            <WaitState kicker={late ? "오늘 예상이 조금 늦어지고 있어요" : "오늘 시가 예상을 준비하고 있어요"} title={late ? "준비 중" : mins > 0 ? `${mins >= 60 ? `${Math.floor(mins / 60)}시간 ` : ""}${mins % 60}분 후 공개` : "곧 공개"}
              body={late ? "야간 거래 데이터가 늦게 들어와 07:30에 공개하지 못했어요. 준비되면 알림으로 알려드릴게요." : "야간 거래가 06:00에 끝나서 내 종목의 오늘 예상 시가 범위를 계산하고 있어요."} link={last ? { href: `/night?d=${last}`, label: `${last === addDays(today, -1) ? "어제" : "지난 거래일"}(${Number(last.slice(4, 6))}/${Number(last.slice(6))}) 기록 보기` } : undefined}
              night={nightNow} nightNote={closed ? "어젯밤 18:00 ~ 오늘 06:00 · 어제 마감 대비" : `어젯밤 18:00부터 · ${hm} 현재(진행 중)`}
              seg={<><Link href="/night" className={sp.v !== "watch" ? "on" : ""}>보유 {pf.holdings.length}</Link><Link href="/night?v=watch" className={sp.v === "watch" ? "on" : ""}>관심 {pf.watch.length}</Link></>}
              after={<SkeletonList title={sp.v === "watch" ? `관심 ${pf.watch.length}종목` : `보유 ${pf.holdings.length}종목`} n={sp.v === "watch" ? pf.watch.length : pf.holdings.length} late={late} />} />
          ) : <NoHoldings night={nightNow} />}
        </Shell>
      );
    }
  }

  const t = pick ?? dates[0];
  const m = t ? await dayModel(t) : null;
  if (!m?.card) return <Shell><NoHoldings night={null} /></Shell>;
  const card = m.card;
  const phase: Phase = sp.p === "post" && m.check ? "post" : "pre";
  const view = sp.v === "watch" ? "watch" : "hold";
  const base: Q = { d: sp.d, p: sp.p, v: sp.v, o: sp.o };
  const holdItems = pf.holdings.map((h) => ({ code: h.code, qty: h.qty }));
  const items = view === "hold" ? holdItems : pf.watch.map((code) => ({ code, qty: 0 }));
  const all = buildRows(m, items, phase);
  const holdRows = buildRows(m, holdItems, phase);
  const acct = account(holdRows);
  const { articles } = await nightNews(isoDay(m.t));
  const news = byStock(articles, [...new Set([...items.map((x) => x.code), ...holdItems.map((x) => x.code)])]);
  const i = dates.indexOf(m.t);
  const graded = card.slot === "0811" && (marketDay(m.t)?.premarket ?? true);   // 개장 전 거래가 없는 날(수능일·새해 첫날)의 08:11 카드는 등급이 없어 07:30과 같다
  const noGrade = graded && ![...m.stocks.values()].some((s) => s.grade);   // 08:11 카드인데 그날 장전 거래 자료가 없어 믿을 정도를 못 낸 날
  const grades = { 높음: 0, 보통: 0, 낮음: 0, 대상아님: holdRows.filter((r) => r.kind === "notservice").length };
  for (const r of holdRows) if (r.s?.grade) grades[r.s.grade]++;
  const nIn = holdRows.filter((r) => r.c?.in80).length;
  const nScored = holdRows.filter((r) => r.c).length;   // 채점 숫자는 내 보유 종목 기준(피그마 410:6525 '14종목 중 12종목')

  if (card.status !== "ok") {
    return (
      <Shell>
        <DateLine label={dateLabel(isoDay(m.t))} sub={card.reasonText ?? "오늘은 예상 범위를 내지 않았어요"} prev={dates[i + 1]} next={dates[i - 1]} />
        <WaitState kicker={card.status === "holiday" ? "휴장일이라 장이 열리지 않아요" : "오늘은 예상 범위를 내지 않았어요"} title={card.status === "holiday" ? `다음 예상 ${dateLabel(isoDay(nextOpenDay(m.t)))} 07:30` : "예상 범위 없음"}
          body={card.reasonText ?? ""} link={dates[i + 1] ? { href: `/night?d=${dates[i + 1]}`, label: "이전 거래일 결과 보기" } : undefined} night={m.night} nightNote="어젯밤 18:00 ~ 오늘 06:00 · 어제 마감 대비" />
      </Shell>
    );
  }

  // 필터·정렬
  const count = (k: (r: Row) => boolean) => all.filter(k).length;
  const f = sp.f ?? "";
  const pass = (r: Row) => !f || (f === "out" && r.kind === "out") || (f === "low" && r.s?.grade === "낮음") || (f === "t2" && r.tier === 2) ||
    (f === "t3" && r.kind === "notservice") || (f === "in" && r.kind === "ok" && r.c != null) || f === `s:${r.sector}`;
  const rows = ordered(all.filter(pass), sp.o);
  const nOut = count((r) => r.kind === "out"), nLow = count((r) => r.s?.grade === "낮음");
  const nAtt = rows.filter((r) => r.kind === "out" || r.kind === "low").length;
  const sectors = bySector(all).filter((g) => !g.sector.startsWith("그 외")).slice(0, 3);
  const partial = holdRows.filter((r) => r.kind === "nocalc" && !(phase === "post" && r.s)).length;
  const md = marketDay(m.t), di = dayInfo(m.t, m.check?.checkedAt ?? null), chk = di.chk, next = di.next;   // 그날 개장 시각·채점 시각(수능일·새해 첫날은 10:00 개장, 08:11 업데이트 없음)
  const timeLine = phase === "post" ? `${chk} 기준 · 장 시작 후 · 채점 완료`
    : graded ? `08:11 기준 · 장 시작 전 · 다음 갱신 ${next}` : `07:30 기준 · 장 시작 전 · 다음 갱신 ${di.premarket ? "08:11" : next}`;
  const stage = (phase === "post" || graded ? 3 : 2) as 2 | 3;
  const progress = phase === "post"
    ? { t: `${chk} 실제 시가로 채점 완료`, s: `${nScored}종목 중 ${nIn}종목이 범위 안에서 시작 · 기록 저장됨` }
    : !di.premarket ? { t: "07:30 예상 범위 공개", s: `개장 전 거래가 없는 날이라 08:11 업데이트 없음 · ${next} 채점` }
    : noGrade ? { t: "08:11 믿을 정도를 내지 못했어요", s: `그날 장전 거래 자료가 없어요 · ${next} 채점` }
      : graded ? { t: "08:11 믿을 정도 반영 완료", s: `높음 ${grades.높음} · 보통 ${grades.보통} · 낮음 ${grades.낮음} · ${next} 채점` }
      : { t: "07:30 예상 범위 공개", s: "다음 08:11 장전 거래로 믿을 정도 반영" };
  const x = m.night?.last ?? card.x;
  const banners: ("mon" | "hol" | "us" | "nonight")[] = [];
  if (afterHoliday(m.t)) banners.push("hol");
  else if (card.cautions.some((c) => c.kind === "mon")) banners.push("mon");
  if (md?.kinds.includes("us_closed")) banners.push("us");
  if (!m.night?.points.length) banners.push("nonight");
  // 특별한 날 달력의 그날 안내(피그마에 없는 날: 10시 개장 · 미국 조기 마감)
  const dayBanners: [string, string][] = [];
  if (md?.kinds.includes("exam_day")) dayBanners.push(["수능일이라 10:00에 열어요", `개장 전 거래가 없어 08:11 업데이트가 없고, 10:00 시가가 나오면 바로 채점해요. 마감은 ${md.closeAt}이에요.`]);
  if (md?.kinds.includes("first_day")) dayBanners.push(["새해 첫 거래일이라 10:00에 열어요", `개장 전 거래가 없어 08:11 업데이트가 없고, 10:00 시가가 나오면 바로 채점해요. 마감은 ${md.closeAt}이에요.`]);
  // 미국 휴장·조기 마감 띠: 휴일 이름은 제목이 두 줄로 넘지 않게 설명 문장 앞에(2026-11-25, 달력 us_name 칸). 조기 마감 한국 시각은 서머타임에 따라 3시(겨울)·2시(여름)
  const usn = usNight(m.t);
  const usBody = usn?.kind === "closed" ? nameIra(usn.name) : undefined;
  if (usn?.kind === "early") dayBanners.push(["어젯밤 미국 증시가 일찍 닫았어요", `${nameIra(usn.name)}미국 동부 ${usn.closeEt}(한국 새벽 ${etToKstHour(usn.usDate, usn.closeEt)}시)에 마감해서 평소보다 거래 시간이 짧았어요.`]);
  const nEarn = holdRows.filter((r) => r.s?.earn).length;
  const label = phase === "post" ? "실제" : "예상";
  const nNews = (c: string) => news.get(c)?.length ?? 0;
  const avgOf = new Map(pf.holdings.map((h) => [h.code, h.avg]));
  const seg = <>
    <Link href={nightHref(base, { v: undefined, f: undefined })} className={view === "hold" ? "on" : ""}>보유 {pf.holdings.length}</Link>
    <Link href={nightHref(base, { v: "watch", f: undefined })} className={view === "watch" ? "on" : ""}>관심 {pf.watch.length}</Link>
  </>;
  // 필터를 걸면 위 묶음 이름도 그 필터로(피그마 462:8306 '범위 밖 종목 2')
  // 종목별 오늘 예상 세로 막대(변경 기록 45): 필터와 상관없이 보유/관심 전체. 보유는 보유 금액 큰 순, 관심은 목록 순서
  const bars = (view === "hold" ? [...all].sort((a, b) => (b.qty * (b.s?.pc ?? 0)) - (a.qty * (a.s?.pc ?? 0))) : ordered(all, sp.o));
  const ranged = all.filter((r) => r.kind !== "notservice" && r.s?.l80 != null && r.s?.u80 != null && r.c);
  const chart = items.length ? {
    title: phase === "post" ? "종목별 오늘 결과" : "종목별 오늘 예상",
    note: phase === "post" ? `${chk} 채점 · 범위 안 ${ranged.filter((r) => r.c?.in80).length}/${ranged.length}` : `${view === "hold" ? "보유" : "관심"} ${all.length}종목${all.length > 5 ? " · 옆으로 넘겨 보기 ›" : ""}`,
    rows: bars.map((r) => ({ code: r.code, name: r.name, l: r.kind === "notservice" ? null : r.s?.l80 ?? null, u: r.kind === "notservice" ? null : r.s?.u80 ?? null,
      line: r.s ? (r.s.hb ?? r.s.h) : null, open: r.c?.y ?? null, in80: r.c?.in80 ?? null })),
  } : null;
  // 종목 창 '밤사이 소식' 창 안 기사 줄(변경 기록 29): 뉴스 브리핑과 같은 판정 순서(부정 → 긍정 → 엇갈림 → 중립 → 표시 없음, 안에서는 최신 순),
  // 같은 소식은 한 줄로 접고 '같은 소식 n건'만 적는다. 20줄까지, 나머지는 뉴스 브리핑에서. 기사 상세에서 뒤로 가면 이 종목 창으로
  const SHEET_ROWS = 20;
  const newsBy: Record<string, React.ReactNode> = {};
  for (const [c, list] of news) {
    if (!list.length) continue;
    const folded = foldStories(groupByVerdict(list, (a) => impactFor(a, c)).flatMap((g) => g.xs));
    const back = `${nightHref(base, {})}${nightHref(base, {}).includes("?") ? "&" : "?"}open=${c}`;
    newsBy[c] = <>
      {folded.slice(0, SHEET_ROWS).map(({ head, rest }) => <StockNews key={head.key} a={head} impact={impactFor(head, c)} back={back} more={rest.length ? ` · 같은 소식 ${rest.length}건` : null} />)}
      {folded.length > SHEET_ROWS ? <p className="fine nn-rest">나머지 소식 {folded.length - SHEET_ROWS}개는 뉴스 브리핑에서 볼 수 있어요</p> : null}
    </>;
  }
  const fTitle = f === "out" ? { title: `범위 밖 종목 ${nOut}`, sub: phase === "post" ? "실제 시가가 예상 범위를 벗어난 종목이에요" : "장전 거래 가격이 예상 범위를 벗어난 종목이에요" }
    : f === "low" ? { title: `믿을 정도 낮은 종목 ${nLow}`, sub: "장전 거래가 보합 근처라 오를지 내릴지 바뀔 수 있어요" } : null;

  return (
    <Shell>
      <DateLine label={dateLabel(isoDay(m.t))} sub={timeLine} prev={dates[i + 1]} next={dates[i - 1]} base={base}
        right={<div className="pp">
          <Link href={nightHref(base, { p: undefined })} className={phase === "pre" ? "on" : ""}>장전</Link>
          {m.check ? <Link href={nightHref(base, { p: "post" })} className={phase === "post" ? "on" : ""}>장후</Link> : <span className="dis">장후</span>}
        </div>} />

      {banners.map((b) => <Banner key={b} kind={b} body={b === "us" ? usBody : undefined} />)}
      {dayBanners.map(([title, body]) => <Banner key={title} kind="day" title={title} body={body} />)}
      {nEarn && phase === "pre" ? <Banner kind="earn" n={nEarn} /> : null}
      {partial ? <Banner kind="partial" n={partial} total={acct.n} /> : null}

      <ProgressSheet stage={stage} details={progressDetails(stage, grades, m.check ? { scored: nScored, inN: nIn } : null, di)} chk={m.check ? chk : next} slotTitle={progress.t} slotSub={progress.s} />

      <NightBoard t={m.t} phase={phase} view={view} sortLabel={SORT_LABEL(sp.o)} initialOpen={sp.open}
        chart={chart} chartRows={bars.map((r) => toB(r, nNews(r.code), avgOf.get(r.code) ?? null, verdictsOf(news.get(r.code) ?? [], r.code)))} newsBy={newsBy}
        rows={rows.map((r) => toB(r, nNews(r.code), avgOf.get(r.code) ?? null, verdictsOf(news.get(r.code) ?? [], r.code)))} holdRows={holdRows.map((r) => toB(r, nNews(r.code), avgOf.get(r.code) ?? null, verdictsOf(news.get(r.code) ?? [], r.code)))}
        accountTitle={phase === "post" ? "오늘 시가로 실제 바뀐 내 주식" : partial ? `오늘 시가 예상 · ${acct.n}종목 기준` : "오늘 시가에 예상되는 내 주식 변화"}
        accountHead={<><MaskToggle /><SectorSheet rows={holdRows} acct={acct} count={pf.holdings.length} label={label} /></>}
        accountBelow={<>
          {sectors.length ? (
            <div className="grp">
              <span>같은 업종에 묶인 내 종목</span>
              <div>
                {sectors.map((g, k) => <Link key={g.sector} href={nightHref(base, { f: `s:${g.sector}` })} className={k === 0 && g.list.length > 1 ? "hot" : ""}>{g.sector} {g.list.length}{k === 0 && g.list.length > 1 ? "종목" : ""}</Link>)}
                {pf.holdings.length - sectors.reduce((a, g) => a + g.list.length, 0) > 0 ? <span>그 외 {pf.holdings.length - sectors.reduce((a, g) => a + g.list.length, 0)}</span> : null}
              </div>
            </div>
          ) : null}
          <div className="seg w">{seg}</div>
        </>}
        stickySeg={<div className="seg2">{seg}</div>}
        futures={m.night ? (
            <div className="fut">
              <FuturesFlow night={m.night} sub="어젯밤 18:00 ~ 오늘 06:00">
                <div className="fh"><b className="tq">코스피200 야간선물<FuturesHelp /></b><span className="futgo"><span style={{ color: signColor(x ?? 0) }}>{x != null ? pct(P(x)) : "—"}</span><em>›</em></span></div>
                <p className="fine">어젯밤 18:00 ~ 오늘 06:00 · 어제 마감 대비</p>
                <NightChart night={m.night} />
                <div className="axis"><span>18:00</span><span>23:30 미국 개장</span><span>06:00 마감</span></div>
              </FuturesFlow>
              <div className="cmp">
                <span>시장 <b style={{ color: signColor(x ?? 0) }}>{x != null ? pct(P(x)) : "—"}</b></span>
                <i />
                <span>내 계좌 {label} <b style={{ color: signColor(acct.pct) }}>{pct(P(acct.pct))}</b></span>
                {x != null ? <em>{acct.pct > x ? "시장보다 좋아요" : acct.pct < x ? "시장보다 약해요" : "시장과 같아요"}</em> : null}
              </div>
            </div>
          ) : null}
        listHead={<>
          {!items.length ? (
            view === "hold" ? <NoHoldings night={null} /> : (
              <div className="emptycard">
                <b>관심 종목이 없어요</b>
                <p>관심 종목을 넣으면 보유하지 않아도 매일 아침 예상 범위를 볼 수 있어요.</p>
                <Link href="/mine/add" className="primary">관심 종목 추가하기</Link>
              </div>
            )
          ) : (
            <>
              <div className="lhead">
                <b>{view === "hold" ? "보유" : "관심"} {all.length}종목</b>
                <SortSheet current={sp.o ?? ""} href={(o) => nightHref(base, { o: o || undefined })} />
              </div>
              <div className="chipsx">
                {f ? <Link href={nightHref(base, { f: undefined })} className="clear">필터 해제 ✕</Link> : null}
                <Link href={nightHref(base, { f: undefined })} className={!f ? "on" : ""}>전체 {all.length}</Link>
                {phase === "post" ? <Link href={nightHref(base, { f: "in" })} className={f === "in" ? "on" : ""}>범위 안 {count((r) => r.kind === "ok" && r.c != null)}</Link> : null}
                <Link href={nightHref(base, { f: "out" })} className={f === "out" ? "on" : ""}>범위 밖 {nOut}</Link>
                {phase === "pre" && graded && !noGrade ? <Link href={nightHref(base, { f: "low" })} className={f === "low" ? "on" : ""}>믿을 정도 낮음 {nLow}</Link> : null}
                {count((r) => r.tier === 2) ? <Link href={nightHref(base, { f: "t2" })} className={f === "t2" ? "on" : ""}>모델 설계 밖 {count((r) => r.tier === 2)}</Link> : null}
                {count((r) => r.kind === "notservice") ? <Link href={nightHref(base, { f: "t3" })} className={f === "t3" ? "on" : ""}>서비스 대상 아님 {count((r) => r.kind === "notservice")}</Link> : null}
                {sectors.map((g) => <Link key={g.sector} href={nightHref(base, { f: `s:${g.sector}` })} className={f === `s:${g.sector}` ? "on" : ""}>{g.sector} {g.list.length}</Link>)}
              </div>
              {f === "t3" || f === "t2" ? <div className="quiet">{f === "t3" ? "서비스 대상(코스피 전체 + 코스닥150) 밖의 종목은 예상 시가를 계산하지 않아요." : "모델을 설계할 때 쓰지 않은 종목이에요. 같은 규칙으로 계산했어요."} <NotServiceHelp label="자세히" /></div> : null}
              {phase === "pre" && graded && !noGrade ? <p className="gline"><span className="tq">믿을 정도<GradeHelp /></span> 높음 {grades.높음} · 보통 {grades.보통} · 낮음 {grades.낮음}</p> : null}
              {!rows.length ? <p className="state">조건에 맞는 종목이 없어요. <Link href={nightHref(base, { f: undefined })} className="addlink">필터 해제</Link></p> : null}
            </>
          )}
        </>}
        attention={fTitle ?? (nAtt ? (phase === "post"
          ? { title: `범위 밖에서 시작한 종목 ${nAtt}`, sub: "예상 범위를 벗어난 실제 시가 — 눌러서 자세히 보세요" }
          : { title: `확인이 필요한 종목 ${nAtt}`, sub: graded ? `07:30 예상과 크게 달라진 종목 ${nOut} — 눌러서 자세히 보세요` : `범위 밖 ${nOut} — 눌러서 자세히 보세요` }) : null)}
        rest={{ title: nAtt ? `나머지 ${rows.length - nAtt}종목` : `${view === "hold" ? "보유" : "관심"} 종목`, sub: "누르면 아래에서 자세히 열려요" }}
        footer={items.length ? <p className="fine">예상 범위는 지난 비슷한 아침에 실제 시가가 들어온 정도를 바탕으로 계산해요(80% 범위). 08:11에는 장전 거래로 예상을 한 번 더 계산해요(2차 예측). 07:30 예상과 크게 달라진 종목은 위로 올려 펼쳐 둬요. 믿을 정도는 8시 장전 흐름이 9시 시가까지 이어질 가능성이에요. 수량을 바꾸면 이 화면의 예상 금액만 다시 계산해요. 모델 추정이며 투자 권유가 아니에요.</p> : null}
      />
    </Shell>
  );
}
