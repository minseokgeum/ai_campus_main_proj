// 뉴스 브리핑 v2(피그마 시장 522:6706 · 산업별 493:9838 · 내 종목 532:6226). 기사는 오라클 수집 DB의 밤사이 실제 기사.
import Link from "next/link";
import { AiSummary, BottomNav, Empty, Head, NewsCard, Section, StockNews } from "@/components/ui";
import { aiBrief, type Brief } from "@/lib/summary";
import { Sheet } from "@/components/sheet";
import { requireUser } from "@/lib/auth";
import { portfolio, UNIVERSE, uStock } from "@/lib/portfolio";
import { bySector, byStock, impactFor, nightNews } from "@/lib/news";

export const dynamic = "force-dynamic";

type Q = { tab?: string; v?: string; c?: string; s?: string; open?: string; d?: string };
type Acct = { holdings: { code: string }[]; watch: string[] };
const nameOf = (c: string) => uStock(c)?.name ?? c;
const sectorOf = (c: string) => uStock(c)?.sector;
const PER_BLOCK = 2; // 종목 블록에 먼저 보여 줄 기사 수(넘으면 '모두 보기')
const MARKET_MAX = 30;

function q(base: Q, patch: Partial<Q>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, v);
  return `/news?${p.toString()}`;
}

export default async function NewsPage({ searchParams }: { searchParams: Promise<Q> }) {
  const sp = await searchParams;
  const tab = sp.tab === "ind" || sp.tab === "mine" ? sp.tab : "market";
  const user = await requireUser();
  const acct: Acct = await portfolio(user.id);
  const { brief, articles } = await nightNews(sp.d);
  const ai = await aiBrief(brief.date);
  const base: Q = { d: sp.d };
  const asOf = `${brief.asOf} 기준`;

  return (
    <>
      <Head title="뉴스 브리핑" sub={`국내 종목에 영향을 줄 미국 뉴스만 모았어요 · ${asOf}`} />
      <nav className="toptabs" aria-label="뉴스 구분">
        <Link href={q(base, { tab: "market" })} className={tab === "market" ? "on" : ""}>시장</Link>
        <Link href={q(base, { tab: "ind" })} className={tab === "ind" ? "on" : ""}>산업별</Link>
        <Link href={q(base, { tab: "mine" })} className={tab === "mine" ? "on" : ""}>내 종목</Link>
      </nav>
      <main className="scroll">
        {tab === "market" ? <Market list={articles.filter((a) => a.market)} asOf={asOf} ai={ai} /> : null}
        {tab === "ind" ? <Industry base={{ ...base, tab: "ind" }} sel={sp.s} acct={acct} list={articles} asOf={asOf} ai={ai} /> : null}
        {tab === "mine" ? <Mine base={{ ...base, tab: "mine", v: sp.v, c: sp.c }} acct={acct} view={sp.v === "watch" ? "watch" : "hold"} pick={sp.c} open={sp.open} list={articles} ai={ai} /> : null}
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
      {list.length ? list.slice(0, MARKET_MAX).map((a) => <NewsCard key={a.key} a={a} />) : <Empty />}
    </>
  );
}

const ALL_SECTORS = [...new Set(UNIVERSE.map((x) => x.sector))].filter((x) => x && x !== "기타").sort((a, b) => a.localeCompare(b, "ko"));
const SHOW = 3; // 업종별 뉴스에 펼쳐 둘 업종 수(나머지는 '나머지 업종 더 보기' 창)

/** 산업별(피그마 522:6842 여러 개 선택 · 493:9838 한 업종 · 534:6305 업종 전체 창 · 534:6293 업종 뉴스 창 · 534:6302 나머지 업종 창) */
function Industry({ base, sel, acct, list, asOf, ai }: { base: Q; sel?: string; acct: Acct; list: Awaited<ReturnType<typeof nightNews>>["articles"]; asOf: string; ai: Brief }) {
  const codes = [...acct.holdings.map((h) => h.code), ...acct.watch];
  const mine = [...new Set(codes.map(sectorOf).filter(Boolean))] as string[];
  const m = bySector(list, ALL_SECTORS);
  const picked = sel ? sel.split(",").filter((x) => ALL_SECTORS.includes(x)) : [];
  const chosen = picked.length ? picked : mine;
  const toggle = (x: string) => { const nx = chosen.includes(x) ? chosen.filter((y) => y !== x) : [...chosen, x]; return q(base, { s: nx.length && nx.join(",") !== mine.join(",") ? nx.join(",") : undefined }); };
  const n = (x: string) => m.get(x)?.length ?? 0;
  const order = [...chosen].sort((a, b) => n(b) - n(a));
  const shown = order.filter((x) => n(x)).slice(0, SHOW), rest = order.filter((x) => n(x)).slice(SHOW);
  const total = new Set(chosen.flatMap((x) => (m.get(x) ?? []).map((a) => a.key))).size;
  const newsSheet = (x: string, label: React.ReactNode, cls: string) => (
    <Sheet key={x} className={cls} title={`${x} 뉴스`} sub={`${n(x)}건 · 최신순`} trigger={label}>
      {[...(m.get(x) ?? [])].sort((a, b) => b.published.localeCompare(a.published)).map((a) => <NewsCard key={a.key} a={a} tag={x} />)}
    </Sheet>
  );
  return (
    <>
      <div className="filter">
        <div className="row">
          <Link href={q(base, { s: undefined })} className={`pill ${!picked.length ? "all" : ""}`}>내 업종 전체</Link>
          {[...new Set([...mine, ...picked])].map((x) => (
            <Link key={x} href={toggle(x)} className={`pill ${chosen.includes(x) ? "on" : ""}`}>
              {mine.includes(x) ? <span className="mydot" aria-label="내 종목이 있는 업종">•</span> : null}{x}{chosen.includes(x) ? <i>✓</i> : null}
            </Link>
          ))}
        </div>
        <Sheet className="pill more" close="text" title={`업종 전체 (${ALL_SECTORS.filter((x) => mine.includes(x) || n(x)).length})`} sub="WI26 기준 · • 내 종목이 있는 업종 · 뉴스 많은 순" trigger={<>전체 ›</>}>
          {[["• 내 종목이 있는 업종", ALL_SECTORS.filter((x) => mine.includes(x))], ["다른 업종", ALL_SECTORS.filter((x) => !mine.includes(x) && n(x))]].map(([h, xs]) => (
            <div key={h as string}>
              <p className="dhead">{h as string}</p>
              <div className="secgrid">
                {(xs as string[]).sort((a, b) => n(b) - n(a)).map((x) => (
                  <Link key={x} href={q(base, { s: x })} className={chosen.length === 1 && chosen[0] === x ? "on" : ""}><b>{mine.includes(x) ? <span className="mydot">• </span> : ""}{x}</b><span>뉴스 {n(x)}건</span></Link>
                ))}
              </div>
            </div>
          ))}
        </Sheet>
      </div>
      <div className="selrow">{chosen.length === 1 ? <span><span className="mydot">•</span> 내 종목이 있는 업종 · 오늘 뉴스 많은 순</span>
        : <><span>{chosen.length}개 업종 선택 · <span className="mydot">•</span> 내 종목이 있는 업종</span>{picked.length ? <Link href={q(base, { s: undefined })}>선택 초기화</Link> : null}</>}</div>
      {chosen.length === 1 ? (
        <>
          <AiSummary meta={`${chosen[0]} · ${asOf} · 뉴스 ${n(chosen[0])}건`} what={`${chosen[0]} 업종`} lines={ai.sectors.get(chosen[0]) ? [ai.sectors.get(chosen[0])!] : []} />
          <Section title={`${chosen[0]} 관련 뉴스`} right={<><img src="/icons/dot-red.svg" alt="" width={6} height={6} />최신순 · {n(chosen[0])}건</>} />
          {n(chosen[0]) ? [...(m.get(chosen[0]) ?? [])].sort((a, b) => b.published.localeCompare(a.published)).map((a) => <NewsCard key={a.key} a={a} tag={chosen[0]} />) : <Empty />}
        </>
      ) : <>
      <AiSummary meta={`선택 업종 ${chosen.length}개 · 뉴스 ${total}건`} what="선택 업종"
        lines={order.filter((x) => ai.sectors.get(x)).slice(0, 3).map((x) => [x, ai.sectors.get(x)!] as [string, string])}
        note={order.filter((x) => ai.sectors.get(x)).length > 3 ? "뉴스가 많은 3개 업종만 먼저 요약했어요 · AI가 요약했어요. 원문과 다를 수 있어요." : undefined} />
      <Section title="업종별 뉴스" right={<><img src="/icons/dot-red.svg" alt="" width={6} height={6} />업종 {chosen.length}개 · 뉴스 {total}건</>} />
      {!shown.length ? <Empty /> : shown.map((x) => (
        <section key={x} className="block">
          <div className="bh"><b>{x}</b><span>뉴스 {n(x)}건</span></div>
          {[...(m.get(x) ?? [])].sort((a, b) => b.published.localeCompare(a.published)).slice(0, 2).map((a) => <StockNews key={a.key} a={a} />)}
          {n(x) > 2 ? newsSheet(x, <>{x} 뉴스 {n(x)}건 모두 보기 ›</>, "more") : null}
        </section>
      ))}
      {rest.length ? (
        <Sheet className="moresec" title={`나머지 업종 ${rest.length}개`} sub={`${rest.reduce((a, x) => a + n(x), 0)}건 · 업종별 최신순`} trigger={<>나머지 업종 {rest.length}개 더 보기 ›</>}>
          {rest.map((x) => (
            <div key={x}>
              <p className="dhead"><span className="mydot">•</span> {x} <span className="fine">{n(x)}건</span></p>
              {[...(m.get(x) ?? [])].sort((a, b) => b.published.localeCompare(a.published)).map((a) => <NewsCard key={a.key} a={a} tag={x} />)}
            </div>
          ))}
        </Sheet>
      ) : null}
      </>}
    </>
  );
}

function Mine({ base, acct, view, pick, open, list, ai }: { base: Q; acct: Acct; view: "hold" | "watch"; pick?: string; open?: string; list: Awaited<ReturnType<typeof nightNews>>["articles"]; ai: Brief }) {
  const hold = acct.holdings.map((h) => h.code);
  const codes = view === "hold" ? hold : acct.watch;
  const m = byStock(list, codes);
  const neg = (c: string) => (m.get(c) ?? []).some((a) => impactFor(a, c) === "negative");
  const shown = (pick && codes.includes(pick) ? [pick] : codes)
    .map((c) => ({ c, n: m.get(c)?.length ?? 0, neg: neg(c) }))
    .sort((x, y) => Number(y.neg) - Number(x.neg) || y.n - x.n);
  const cnt = { positive: 0, negative: 0, neutral: 0 } as Record<string, number>;
  for (const c of codes) { const i = ai.companies.get(c)?.impact; if (i && i in cnt) cnt[i]++; }
  const impactMeta = cnt.positive + cnt.negative + cnt.neutral ? `긍정 ${cnt.positive} · 부정 ${cnt.negative} · 중립 ${cnt.neutral}` : null;
  const withNews = shown.filter((x) => x.n > 0);
  const quiet = shown.filter((x) => x.n === 0).map((x) => nameOf(x.c));
  const total = new Set(codes.flatMap((c) => (m.get(c) ?? []).map((a) => a.key))).size;
  if (!codes.length) {
    return (
      <>
        <div className="seg">
          <Link href={q(base, { v: undefined, c: undefined })} className={view === "hold" ? "on" : ""}>보유 {hold.length}</Link>
          <Link href={q(base, { v: "watch", c: undefined })} className={view === "watch" ? "on" : ""}>관심 {acct.watch.length}</Link>
        </div>
        <div className="emptycard">
          <b>{view === "hold" ? "보유 종목이 없어요" : "관심 종목이 없어요"}</b>
          <p>종목을 넣으면 밤사이 그 종목에 관한 미국 소식만 모아 보여 드려요.</p>
          <Link href="/mine/add" className="primary">종목 추가하기</Link>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="seg">
        <Link href={q(base, { v: undefined, c: undefined })} className={view === "hold" ? "on" : ""}>보유 {hold.length}</Link>
        <Link href={q(base, { v: "watch", c: undefined })} className={view === "watch" ? "on" : ""}>관심 {acct.watch.length}</Link>
      </div>
      <div className="filter">
        <div className="row">
          <Link href={q(base, { c: undefined })} className={`pill ${!pick ? "all" : ""}`}>{view === "hold" ? "보유" : "관심"} 종목 전체</Link>
          {codes.map((c) => (
            <Link key={c} href={q(base, { c })} className={`pill ${pick === c ? "on" : ""}`}>{nameOf(c)}{pick === c ? <i>✓</i> : null}</Link>
          ))}
        </div>
      </div>
      <AiSummary meta={impactMeta ?? `${view === "hold" ? "보유" : "관심"} ${codes.length}종목 · 밤사이 소식 ${total}건`} what="내 종목"
        note={`${view === "hold" ? "보유" : "관심"} ${codes.length}종목 · 밤사이 소식 ${total}건 기준 · AI가 요약했어요`}
        lines={shown.map(({ c }) => ai.companies.get(c)?.line ?? "").filter(Boolean).slice(0, 3)} />   {/* 피그마 532:6226: 3줄, 부정 소식 종목 먼저 */}
      <Section title="종목별 뉴스" right={<><img src="/icons/dot-red.svg" alt="" width={6} height={6} />부정 소식이 있는 종목 먼저</>} />
      {withNews.length === 0 ? <Empty /> : withNews.map(({ c, n }) => {
        const arts = m.get(c) ?? [];
        const all = open === c;
        return (
          <section key={c} className="block">
            <div className="bh"><b>{nameOf(c)}</b><span>뉴스 {n}건</span></div>
            {(all ? arts : arts.slice(0, PER_BLOCK)).map((a) => <StockNews key={a.key} a={a} impact={impactFor(a, c)} />)}
            {n > PER_BLOCK && !all ? <Link className="more" href={q(base, { open: c })}>{nameOf(c)} 뉴스 {n}건 모두 보기 ›</Link> : null}
          </section>
        );
      })}
      {quiet.length ? <p className="quiet">밤사이 소식 없음 · {quiet.length <= 2 ? quiet.join(", ") : `${quiet.slice(0, 2).join(", ")} 외 ${quiet.length - 2}종목`}</p> : null}
      <p className="fine">긍정·부정은 AI가 이 소식이 종목에 유리한지 판단한 거예요. 주가 방향 예측이 아니에요.</p>
    </>
  );
}
