// 뉴스 브리핑 v2(피그마 시장 522:6706 · 산업별 493:9838 · 내 종목 532:6226). 기사는 오라클 수집 DB의 밤사이 실제 기사.
// 위 탭(내 종목 · 산업별 · 시장). 내 종목 뉴스는 종목 이름 줄에서 한 종목씩(Mine), 산업별도 업종 이름 줄에서 한 업종씩(Industry). 세 화면 모두 긍정·부정 판정 묶음으로 보여 준다.
import Link from "next/link";
import { NewsTimeHelp } from "@/components/helps";
import { NewsLinksButton } from "@/components/links";
import { stockLinks, type LinkNode } from "@/lib/links";
import { AiSummary, BottomNav, Empty, Head, NewsCard, Section, StateBox, StockNews, VerdictGroups } from "@/components/ui";
import { NameRow } from "@/components/namerow";
import { aiBrief, type Brief } from "@/lib/summary";
import { requireUser } from "@/lib/auth";
import { portfolio, UNIVERSE, uStock } from "@/lib/portfolio";
import { articleVerdict, bySector, byStock, foldStories, groupByVerdict, impactFor, nightNews, verdictsOf } from "@/lib/news";

export const dynamic = "force-dynamic";

type Q = { tab?: string; v?: string; c?: string; s?: string; d?: string };
type Acct = { holdings: { code: string; qty: number }[]; watch: string[] };
const nameOf = (c: string) => uStock(c)?.name ?? c;
const sectorOf = (c: string) => uStock(c)?.sector;
const MARKET_MAX = 30;

function q(base: Q, patch: Partial<Q>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, v);
  return `/news?${p.toString()}`;
}

export default async function NewsPage({ searchParams }: { searchParams: Promise<Q> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const acct: Acct = await portfolio(user.id);
  // 탭 순서와 처음 열리는 탭: 내 종목 → 산업별 → 시장(2026-11-24 사용자 결정). 보유 종목이 없으면 처음엔 시장 탭
  const tab = sp.tab === "ind" || sp.tab === "mine" || sp.tab === "market" ? sp.tab : acct.holdings.length ? "mine" : "market";
  const { brief, articles } = await nightNews(sp.d);
  const ai = await aiBrief(brief.date);
  const base: Q = { d: sp.d };
  const asOf = `${brief.asOf} 기준`;
  // 내 종목 탭: 종목마다 연결 그림(오늘 소식이 난 연결 카드 · 관계도 창)
  // 칸 숫자는 아래 목록과 같은 기사(byStock)로 센다(2026-11-26)
  const mineCodes = sp.v === "watch" ? acct.watch : acct.holdings.map((h) => h.code);
  const links = tab === "mine" ? await stockLinks(mineCodes, byStock(articles, mineCodes)) : new Map<string, LinkNode[]>();

  return (
    <>
      {/* 제목은 '뉴스 브리핑' 고정, 그 아래 글자 탭(내 종목 · 산업별 · 시장)을 바로 눌러 바꾼다. 숫자는 두지 않는다(2026-11-25 사용자 결정, 예전 '제목 누름' 메뉴 대신) */}
      <Head title="뉴스 브리핑" help={<NewsTimeHelp />} sub={`국내 종목에 영향을 줄 미국 뉴스만 모았어요 · ${asOf}`} tabs={
        <nav className="ntabs" aria-label="뉴스 보기">
          {([["mine", "내 종목"], ["ind", "산업별"], ["market", "시장"]] as const).map(([k, label]) => (
            <Link key={k} href={q(base, { tab: k })} className={tab === k ? "on" : ""} aria-current={tab === k ? "page" : undefined}>{label}</Link>
          ))}
        </nav>} />
      <main className="scroll">
        {tab === "market" ? <Market list={articles.filter((a) => a.market)} asOf={asOf} ai={ai} /> : null}
        {tab === "ind" ? <Industry base={{ ...base, tab: "ind" }} sel={sp.s} acct={acct} list={articles} ai={ai} /> : null}
        {tab === "mine" ? <Mine base={{ ...base, tab: "mine", v: sp.v, c: sp.c }} acct={acct} view={sp.v === "watch" ? "watch" : "hold"} pick={sp.c} list={articles} ai={ai} links={links} /> : null}
      </main>
      <BottomNav active="news" />
    </>
  );
}

function Market({ list, asOf, ai }: { list: Awaited<ReturnType<typeof nightNews>>["articles"]; asOf: string; ai: Brief }) {
  return (
    <>
      <AiSummary meta={`${asOf} · 뉴스 ${list.length}건`} what="시장 전체" lines={ai.macro} />
      <Section title="최신 뉴스" right={<><img src="/icons/dot-red.svg" alt="" width={6} height={6} />{asOf.replace(" 기준", "")} 갱신</>} />
      {/* 판정 묶음(부정 → 긍정 → 엇갈림 → 중립 → 판정 없는, 2026-11-24). 최신 소식 30개(같은 소식 기사는 한 소식으로 셈) 안에서 묶는다 */}
      {list.length ? <VerdictGroups groups={groupByVerdict(foldStories([...list].sort((a, b) => b.published.localeCompare(a.published))).slice(0, MARKET_MAX).flatMap((f) => [f.head, ...f.rest]), (a) => articleVerdict(a))}
        render={(a, more) => <NewsCard key={a.key} a={a} impact={articleVerdict(a)} more={more} />} /> : <Empty />}
    </>
  );
}

const ALL_SECTORS = [...new Set(UNIVERSE.map((x) => x.sector))].filter((x) => x && x !== "기타").sort((a, b) => a.localeCompare(b, "ko"));

/** 산업별 새 화면(2026-11-24, 내 종목 뉴스와 같은 의도: 한 번에 하나, 그 업종 뉴스를 쭉). 업종 이름 줄(피그마 기록 50)에서 고른다
 *  (앞: 내 종목이 있는 업종 •, 뒤: 뉴스가 있는 다른 업종, 각각 뉴스 많은 순). 구성 = 업종 이름 · 뉴스 수와 그 업종 내 종목 · AI 요약 · 판정 묶음 뉴스 전체.
 *  ?s=업종이면 그 업종, 없으면 내 종목 업종 중 뉴스가 가장 많은 업종. 기사 판정은 그 업종 종목들의 판정을 합친 것(articleVerdict) */
function Industry({ base, sel, acct, list, ai }: { base: Q; sel?: string; acct: Acct; list: Awaited<ReturnType<typeof nightNews>>["articles"]; ai: Brief }) {
  const codes = [...new Set([...acct.holdings.map((h) => h.code), ...acct.watch])];
  const mine = [...new Set(codes.map(sectorOf).filter(Boolean))] as string[];
  const m = bySector(list, ALL_SECTORS);
  const n = (x: string) => m.get(x)?.length ?? 0;
  const byN = (a: string, b: string) => n(b) - n(a) || a.localeCompare(b, "ko");
  const order = [...mine.filter((x) => ALL_SECTORS.includes(x)).sort(byN), ...ALL_SECTORS.filter((x) => !mine.includes(x) && n(x)).sort(byN)];
  if (!order.length) return <Empty />;
  // 이름 줄 맨 뒤 '내 업종 전체'(피그마 기록 50의 '전체', 2026-11-25 사용자 결정: 맨 앞 대신 맨 뒤): 내 종목이 있는 업종 뉴스를 한꺼번에
  const myOrder = order.filter((x) => mine.includes(x) && n(x));
  const allItem = myOrder.length > 1 ? [{ key: "all", label: "내 업종 전체", n: new Set(myOrder.flatMap((x) => (m.get(x) ?? []).map((a) => a.key))).size, href: q(base, { s: "all" }) }] : [];
  const row = <>
      <NameRow label="업종 고르기" on={sel === "all" && allItem.length ? "all" : (sel && order.includes(sel) ? sel : order.find((x) => mine.includes(x) && n(x)) ?? order[0])} items={[...order.map((x) => ({ key: x, label: x, n: n(x), href: q(base, { s: x }), dot: mine.includes(x) })), ...allItem]} />
      <p className="nr-cap"><i className="nrd" aria-hidden />내 종목이 있는 업종 · 오늘 뉴스 많은 순</p></>;
  if (sel === "all" && allItem.length) {
    const seen = new Set<string>();
    const arts = myOrder.flatMap((x) => m.get(x) ?? []).filter((a) => !seen.has(a.key) && seen.add(a.key)).sort((a, b) => b.published.localeCompare(a.published));
    const inMine = new Set(UNIVERSE.filter((u) => myOrder.includes(u.sector)).map((u) => u.code));
    const lines = myOrder.flatMap((x) => { const l = ai.sectors.get(x); return l ? [[x, l] as [string, string]] : []; });
    return (
      <div className="spg-in">
        {row}
        <p className="spg-meta"><span>내 업종 {myOrder.length}개 · 뉴스 {arts.length}건</span></p>
        <AiSummary badge="AI 요약" meta={`내 업종 ${myOrder.length}개 · 뉴스 ${arts.length}건`} what="내 업종" lines={lines} />
        <VerdictGroups groups={groupByVerdict(arts, (a) => articleVerdict(a, inMine))} render={(a, more) => <NewsCard key={a.key} a={a} impact={articleVerdict(a, inMine)} more={more} />} />
        <p className="fine">업종 이름을 누르면 그 업종 뉴스만 볼 수 있어요. 긍정·부정은 AI가 이 소식이 그 업종 종목에 유리한지 판단한 거예요. 주가 방향 예측이 아니에요.</p>
      </div>
    );
  }
  const cur = sel && order.includes(sel) ? sel : order.find((x) => mine.includes(x) && n(x)) ?? order[0];
  const inSec = new Set(UNIVERSE.filter((u) => u.sector === cur).map((u) => u.code));
  const myHere = codes.filter((c) => sectorOf(c) === cur);
  const arts = m.get(cur) ?? [];
  const line = ai.sectors.get(cur);
  return (
    <div className="spg-in">
      {row}
      <p className="spg-meta">
        {myHere.length ? <span className="wrap">내 종목 {myHere.map((c, i) => <span key={c}>{i ? " · " : ""}<Link href={`/news?tab=mine&c=${c}`} >{nameOf(c)}</Link></span>)}</span> : <span>내 종목 없는 업종</span>}</p>
      <AiSummary badge="AI 요약" meta={`${cur} · 뉴스 ${arts.length}건`} what={`${cur} 업종`} lines={line ? [line] : []} />
      {arts.length ? <VerdictGroups groups={groupByVerdict(arts, (a) => articleVerdict(a, inSec))} render={(a, more) => <NewsCard key={a.key} a={a} tag={cur} impact={articleVerdict(a, inSec)} more={more} />} />
        : <p className="quiet">밤사이 {cur} 업종 관련 미국 뉴스가 들어오지 않았어요.</p>}
      <p className="fine">업종 이름을 누르면 다른 업종 뉴스를 볼 수 있어요. 긍정·부정은 AI가 이 소식이 그 업종 종목에 유리한지 판단한 거예요. 주가 방향 예측이 아니에요.</p>
    </div>
  );
}

/** 내 종목 뉴스(2026-11-24 사용자 결정): 한 번에 한 종목. 종목 이름 줄(피그마 기록 50)에서 고른다. 구성 = 종목 이름 · 관계 그림 보기(아래에서 올라오는 창) · 그 종목 AI 요약 · 그 종목 뉴스 전체(시장 뉴스처럼 쭉).
 *  메뉴 순서: 부정 소식이 있는 종목 → 뉴스 많은 순, 밤사이 소식 없는 종목은 맨 아래. ?c=종목코드면 그 종목, 없으면 맨 앞 종목 */
function Mine({ base, acct, view, pick, list, ai, links }: { base: Q; acct: Acct; view: "hold" | "watch"; pick?: string; list: Awaited<ReturnType<typeof nightNews>>["articles"]; ai: Brief; links: Map<string, LinkNode[]> }) {
  const hold = acct.holdings.map((h) => h.code);
  const codes = view === "hold" ? hold : acct.watch;
  const m = byStock(list, codes);
  const neg = (c: string) => (m.get(c) ?? []).some((a) => impactFor(a, c) === "negative");
  const order = codes.map((c) => ({ c, n: m.get(c)?.length ?? 0, neg: neg(c) }))
    .sort((x, y) => Number(y.n > 0) - Number(x.n > 0) || Number(y.neg) - Number(x.neg) || y.n - x.n);
  const total = new Set(codes.flatMap((c) => (m.get(c) ?? []).map((a) => a.key))).size;
  const aiRan = !!(ai.createdAt || ai.macro.length || ai.sectors.size || ai.companies.size);
  const seg = (
    <div className="seg">
      <Link href={q(base, { v: undefined, c: undefined })} className={view === "hold" ? "on" : ""}>보유 {hold.length}</Link>
      <Link href={q(base, { v: "watch", c: undefined })} className={view === "watch" ? "on" : ""}>관심 {acct.watch.length}</Link>
    </div>
  );
  if (!codes.length) {
    return (
      <>
        {seg}
        <StateBox mark="+" title="아직 등록한 종목이 없어요" body={<>종목을 추가하면 내 종목과 관련된<br />밤사이 미국 뉴스만 모아 보여드려요.</>} action={{ href: "/mine/add", label: "종목 추가하기" }} />
      </>
    );
  }
  if (!total) {   // 종목은 있는데 밤사이 이어진 뉴스가 없음(배포 784:2521)
    return (
      <>
        {seg}
        <StateBox mark="–" title="밤사이 내 종목 소식이 없어요" body={<>{view === "hold" ? "보유" : "관심"} {codes.length}종목과 관련된 미국 뉴스가<br />밤사이 들어오지 않았어요.</>} action={{ href: q(base, { tab: "market", v: undefined, c: undefined }), label: "시장 뉴스 보기" }} />
      </>
    );
  }
  // 이름 줄 맨 뒤 '보유 종목 전체'·'관심 종목 전체'(피그마 기록 50의 '전체', 2026-11-25 사용자 결정: 맨 앞 대신 맨 뒤): 내 종목 뉴스를 한꺼번에
  const withNews = order.filter((x) => x.n);
  const allItem = withNews.length > 1 ? [{ key: "all", label: `${view === "hold" ? "보유" : "관심"} 종목 전체`, n: total, href: q(base, { c: "all" }) }] : [];
  const nameRow = (on: string) => <NameRow label="종목 고르기" on={on} items={[...order.map((x) => ({ key: x.c, label: nameOf(x.c), n: x.n, href: q(base, { c: x.c }) })), ...allItem]} />;
  if (pick === "all" && allItem.length) {
    const seen = new Set<string>();
    const arts = codes.flatMap((x) => m.get(x) ?? []).filter((a) => !seen.has(a.key) && seen.add(a.key)).sort((a, b) => b.published.localeCompare(a.published));
    const set = new Set(codes);
    const vs = arts.map((a) => articleVerdict(a, set));
    const lines = withNews.flatMap((x) => { const l = ai.companies.get(x.c)?.line; return l ? [[nameOf(x.c), l] as [string, string]] : []; });
    return (
      <>
        {seg}
        <div className="spg-in">
          {nameRow("all")}
          <p className="spg-meta"><span>{view === "hold" ? "보유" : "관심"} {codes.length}종목 · 뉴스 {arts.length}건</span>
            {vs.filter((v) => v === "negative").length ? <span><b className="neg">부정</b> {vs.filter((v) => v === "negative").length}</span> : null}
            {vs.filter((v) => v === "positive").length ? <span><b className="pos">긍정</b> {vs.filter((v) => v === "positive").length}</span> : null}</p>
          <AiSummary badge="AI 요약" meta={`${view === "hold" ? "보유" : "관심"} ${codes.length}종목 · 밤사이 소식 ${arts.length}건`} what={`${view === "hold" ? "보유" : "관심"} 종목`} lines={lines}
            empty={aiRan ? ["오늘은 내 종목에 직접 관한 소식이 없어 AI 요약을 만들지 않았어요. 아래 기사는 거래처·관련 제품 검색어로 모았어요.", "AI 요약은 회사가 기사에 직접 나온 소식으로만 만들어요."] : undefined} />
          <VerdictGroups groups={groupByVerdict(arts, (a) => articleVerdict(a, set))} render={(a, more) => <NewsCard key={a.key} a={a} tag="내 종목" impact={articleVerdict(a, set)} more={more} />} />
        </div>
        <p className="fine">종목 이름을 누르면 그 종목 뉴스만 볼 수 있어요. 긍정·부정은 AI가 이 소식이 내 종목에 유리한지 판단한 거예요. 주가 방향 예측이 아니에요.</p>
      </>
    );
  }
  const cur = order.find((x) => x.c === pick) ?? order[0];
  const c = cur.c, n = cur.n;
  const qty = acct.holdings.find((h) => h.code === c)?.qty ?? 0;
  const arts = m.get(c) ?? [];
  const v = verdictsOf(arts, c);
  const line = ai.companies.get(c)?.line;
  return (
    <>
      {seg}
      <div className="spg-in">
        {/* 종목 이름 줄(피그마 배포용 변경 기록 50, 2026-11-25): 누르면 그 종목. 이름 옆 숫자 = 그 종목 밤사이 뉴스 수 */}
        {nameRow(c)}
        <p className="spg-meta"><span>{qty > 0 ? `보유 ${qty.toLocaleString("ko-KR")}주` : "관심 종목"}</span>
          {v.neg ? <span><b className="neg">부정</b> {v.neg}</span> : null}{v.pos ? <span><b className="pos">긍정</b> {v.pos}</span> : null}</p>
        <NewsLinksButton code={c} name={nameOf(c)} nodes={links.get(c) ?? []} />
        {n ? <>
          <AiSummary badge="AI 요약" meta={`${nameOf(c)} · 밤사이 소식 ${n}건`} what={nameOf(c)} lines={line ? [line] : []}
            // 그날 요약이 돌았는데 줄이 없으면: 종목 요약은 회사가 기사에 직접 나온 소식으로만 만들어서(거래처·제품 검색어로 걸린 기사는 쓰지 않음, 2026-11-23 정함)
            empty={aiRan ? [`오늘은 ${nameOf(c)}에 직접 관한 소식이 없어 AI 요약을 만들지 않았어요. 아래 기사는 거래처·관련 제품 검색어로 모았어요.`, "AI 요약은 회사가 기사에 직접 나온 소식으로만 만들어요."] : undefined} />
          <VerdictGroups groups={groupByVerdict(arts, (a) => impactFor(a, c))} render={(a, more) => <StockNews key={a.key} a={a} impact={impactFor(a, c)} more={more} />} />
        </> : <p className="quiet">밤사이 {nameOf(c)} 관련 미국 뉴스가 들어오지 않았어요.</p>}
      </div>
      <p className="fine">종목 이름을 누르면 다른 종목 뉴스를 볼 수 있어요. 긍정·부정은 AI가 이 소식이 종목에 유리한지 판단한 거예요. 주가 방향 예측이 아니에요.</p>
    </>
  );
}
