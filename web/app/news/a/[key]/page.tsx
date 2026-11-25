// 뉴스 상세(피그마 527:6148): 한국어 제목, 매체·시각, 원문 보기, AI 요약(한국어 줄글 번역), 영향 한 문장, 같은 사건의 후속 보도.
// 한국어 번역은 서버가 추출 직후 미리 만든 news.article_ko(news_search/news_ko_summary.ipynb)를 읽기만 한다(누를 때 기다림 없음).
// AI 요약 칸은 추출 결과의 comparison_summary를 한국어 줄글 한 단락으로 번역한 text(2026-11-20 정함).
import Link from "next/link";
import { notFound } from "next/navigation";
import { AiMark, BottomNav } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { portfolio, uStock } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { LINK } from "@/lib/newsql";
import { nightNews } from "@/lib/news";
import { IMPACT_LABEL, PRICE_KIND } from "@/lib/summary";
import { dayModel } from "@/lib/model";
import { kstNow } from "@/lib/calendar";
import { signColor } from "@/components/model";
import { pct } from "@/lib/format";
import { P } from "@/lib/night";
import { kstTime } from "@/lib/format";
import { appNow } from "@/lib/clock";
import { SameNews, type SameRow } from "@/components/samenews";

export const dynamic = "force-dynamic";

/** '11월 18일 05:12'(한국 시각) */
const fullTime = (v: string | Date) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(v)).map((x) => [x.type, x.value]));
  return `${p.month}월 ${p.day}일 ${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}`;
};

const none = { rows: [] as Record<string, unknown>[] };

/** 요약이 없을 때 서버 원문 판정(news.llm_articles.status)에 맞는 안내 */
function whyNoSummary(status: string | undefined, extracted: boolean): string {
  if (!status) return "아직 AI가 이 기사를 처리하기 전이에요. 잠시 뒤 다시 열어 주세요.";
  if (status === "SUCCESS") return extracted ? "AI 요약을 준비하고 있어요. 잠시 뒤 다시 열어 주세요." : "이 기사는 사건 요약이 없는 글이라(분석·의견 글 등) 원문 보기로 확인해 주세요.";
  if (status === "HTTP_ERROR") return "언론사가 원문을 받지 못하게 막아 요약하지 못했어요. 원문 보기로 확인해 주세요.";
  if (["NOT_FETCHED", "NOT_RESOLVED", "TIMEOUT", "REQUEST_ERROR"].includes(status)) return "원문 페이지를 받지 못해 아직 요약하지 못했어요. 잠시 뒤 다시 받아 보고, 받으면 요약이 채워져요.";
  if (["PAYWALL", "PARTIAL_BODY"].includes(status)) return "유료 기사라 본문을 볼 수 없어 요약하지 못했어요. 원문 보기로 확인해 주세요.";
  if (["BLOCKED", "REDIRECTED_AWAY", "NOT_HTML"].includes(status)) return "매체가 원문을 열어 주지 않아 요약하지 못했어요. 원문 보기로 확인해 주세요.";
  if (status === "TOO_SHORT") return "본문이 너무 짧아 요약하지 않았어요. 원문 보기로 확인해 주세요.";
  if (status === "LIVE_BLOG") return "실시간 업데이트 글이라 요약하지 않았어요. 원문 보기로 확인해 주세요.";
  if (status === "PRESS_RELEASE") return "회사·기관이 낸 보도자료라 요약하지 않았어요.";
  if (status === "VIDEO_PAGE") return "영상·사진 페이지라 요약하지 않았어요.";
  if (["EXCLUDED_SECTION", "QUOTE_PAGE", "NOT_ARTICLE"].includes(status)) return "뉴스 기사가 아닌 페이지라 요약하지 않았어요.";
  if (status === "EXTRACT_FAILED") return "AI 요약 중 문제가 생겨 요약하지 못했어요. 원문 보기로 확인해 주세요.";
  return "AI가 요약하지 않은 기사예요. 원문 보기로 확인해 주세요.";
}

export default async function NewsDetail({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ back?: string }> }) {
  const { key } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f]{16}$/.test(key)) notFound();
  const user = await requireUser();
  const pool = db();
  const [pf, it, ai, ko, st, { articles }] = await Promise.all([
    portfolio(user.id),
    // 원문 보기(피그마처럼 아이콘만): 언론사 원문 주소(서버가 구글 뉴스 링크를 풀어 둔 것)가 있으면 그리로 바로, 없으면 구글 뉴스 링크(따로 표시하지 않음, 2026-11-22)
    pool.query(`select i.key, i.title, i.source, i.outlet, i.published_utc, ${LINK} as link
      from items i left join news.llm_articles l on l.key = i.key where i.key = $1`, [key])
      .catch(() => pool.query("select key, title, source, outlet, published_utc, link from items where key = $1", [key])),
    pool.query(`select status, short_summary, impacts, sectors, coalesce(extraction->>'comparison_summary', '') <> '' as extracted, extraction->'graph'->'entities' as entities,
       article_types->>0 as kind, extraction->'company_impact' as ci, extraction->'graph'->'events' as events, extraction->'evidence' as ev from news.llm_articles where key = $1`, [key]).catch(() => none),
    pool.query("select text, impact_note from news.article_ko where key = $1", [key]).catch(() => none),
    // 사건 번호와 그 안의 소식 번호(news_id: 같은 소식인지 후속 보도인지 가른다). news_id 칸이 아직 없으면 사건 번호만
    pool.query("select story_id, news_id from news.stories where key = $1", [key]).catch(() => pool.query("select story_id, null as news_id from news.stories where key = $1", [key])).catch(() => none),
    nightNews(),
  ]);
  const dm = await dayModel().catch(() => null);
  const a = it.rows[0];
  if (!a) notFound();
  const x = ai.rows[0] as { status?: string; short_summary?: string; impacts?: { name: string; impact: string }[]; sectors?: string[]; extracted?: boolean; kind?: string;
    ci?: { entity_id?: string; impact?: string }[]; events?: { entities?: string[]; direction?: string; description_ko?: string }[]; ev?: { quote?: string; supports?: { field?: string; item_index?: number | null }[] }[];
    entities?: { name?: string; name_en?: string; type?: string; country?: string; ticker?: string; category?: string; mention?: string }[] } | undefined;
  const k = ko.rows[0] as { text?: string | null; impact_note?: string } | undefined;
  const story = st.rows[0]?.story_id as string | undefined;
  const newsId = (st.rows[0]?.news_id as string | null | undefined) ?? null;
  // 같은 사건의 다른 기사. news_id가 있으면 같은 소식(다른 매체)과 뒤에 나온 다른 소식(후속 보도)으로 나눈다(배포용 '같은 소식, 다른 매체')
  const others = story && newsId ? (await pool.query(
    `select i.key, i.title, ${LINK} as link, i.published_utc, coalesce(nullif(i.source, ''), i.outlet) as outlet, s.news_id, l.short_summary
     from news.stories s join items i on i.key = s.key left join news.llm_articles l on l.key = s.key
     where s.story_id = $1 and s.key <> $2 and i.first_seen_utc <= $3 order by i.published_utc`, [story, key, await appNow()]).catch(() => none)).rows : [];   // 화면 시각까지 들어온 기사만(시연 시각)
  const lang = (t: string) => (/[가-힣]/.test(t) ? "한글" : "영문");
  const same: SameRow[] = others.filter((o) => o.news_id === newsId).map((o) => ({
    key: String(o.key), outlet: String(o.outlet ?? ""), time: kstTime(new Date(o.published_utc as string).toISOString()), lang: lang(String(o.title)), title: String(o.title), link: String(o.link) }));
  const seenNews = new Set<string>();
  const follow = others.filter((o) => o.news_id !== newsId && new Date(o.published_utc as string) > new Date(it.rows[0]?.published_utc as string))
    .filter((o) => !seenNews.has(String(o.news_id)) && seenNews.add(String(o.news_id))).slice(0, 5);   // 소식마다 처음 나온 기사 하나
  if (story && !newsId) {   // 소식 번호가 아직 DB에 없으면 예전처럼 같은 사건의 최근 기사(같은 소식 칸은 숨김)
    follow.push(...(await pool.query(
      `select i.key, i.title, ${LINK} as link, i.published_utc, l.short_summary from news.stories s join items i on i.key = s.key left join news.llm_articles l on l.key = s.key
       where s.story_id = $1 and s.key <> $2 and i.first_seen_utc <= $3 order by i.published_utc desc limit 8`, [story, key, await appNow()]).catch(() => none)).rows);
  }
  const mine = new Set([...pf.holdings.map((h) => h.code), ...pf.watch]);
  const myLinked = (articles.find((y) => y.key === key)?.direct ?? []).filter((c) => mine.has(c));
  // 판정: 내 종목 기준 판정(news.stock_impacts)이 있으면 그것, 없으면 기사 속 회사 판정
  const art = articles.find((y) => y.key === key);
  const mineV = myLinked.map((c) => art?.stock[c]).find(Boolean);
  const priceOnly = x?.kind === PRICE_KIND;   // 주가 움직임 기사는 판정하지 않는다(lib/summary.ts)
  const impact = priceOnly ? undefined : mineV ? { name: uStock(myLinked.find((c) => art?.stock[c])!)?.name ?? "", impact: mineV } : (x?.impacts ?? []).find((i) => i.impact && i.impact !== "neutral");
  // 판정 근거 한 줄: 판정한 회사의 사건 중 방향이 맞는 것의 한국어 설명(LLM 추출 graph.events), 없으면 그 판정에 연결된 원문 문장(evidence). 새 LLM 호출 없음
  const imps = x?.impacts ?? [], ents = x?.entities ?? [];
  const idx = !impact ? -1 : mineV
    ? (() => { const c = imps.map((m, i) => i).filter((i) => imps[i].impact === mineV);
        return c.find((i) => ents.find((e) => (e as { id?: string }).id === x?.ci?.[i]?.entity_id)?.mention === "중심") ?? c[0] ?? -1; })()
    : imps.indexOf(impact as (typeof imps)[number]);
  const basis = (() => {
    const eid = idx >= 0 ? x?.ci?.[idx]?.entity_id : undefined;
    if (!eid || !impact) return null;
    const dir = (d?: string) => impact.impact === "positive" ? d === "+" : impact.impact === "negative" ? d === "−" || d === "-" : d === "+" || d === "−" || d === "-";
    const ko = (x?.events ?? []).filter((e) => e.entities?.includes(eid) && dir(e.direction) && e.description_ko).map((e) => e.description_ko!).slice(0, 2);
    if (ko.length) return { ko: true, text: ko.join(" · ") };
    const q = (x?.ev ?? []).find((e) => e.supports?.some((s) => s.field === "company_impact" && s.item_index === idx))?.quote;
    return q ? { ko: false, text: q.length > 160 ? `${q.slice(0, 157)}…` : q } : null;
  })();
  // 관련 기업(피그마 527:6148): 이 기사에 걸린 국내 종목(내 종목 먼저, 오늘 예상 함께) + 기사에서 뽑은 해외 기업(나라 · 티커)
  const krCodes = articles.find((y) => y.key === key)?.direct ?? [];
  const fresh = dm?.t === kstNow(await appNow()).ymd && dm?.card?.status === "ok";
  const kr = [...krCodes].sort((p, q) => Number(mine.has(q)) - Number(mine.has(p))).map((c) => ({
    name: uStock(c)?.name ?? c, sub: `${mine.has(c) ? "내 종목" : uStock(c)?.market ?? "국내"} · ${c}`, href: `/mine/${c}`,
    h: fresh ? dm!.stocks.get(c)?.h ?? null : null }));
  const krNames = new Set(kr.map((r) => r.name));
  const abroad = (x?.entities ?? []).filter((e) => e.type === "기업" && e.name && !krNames.has(e.name) && e.country !== "South Korea" && e.country !== "한국")
    .map((e) => ({ name: e.name!, sub: [e.country || "해외", e.ticker || e.category].filter(Boolean).join(" · "), href: null as string | null, h: null as number | null }));
  const related = [...kr, ...abroad].slice(0, 6);

  return (
    <>
      <main className="sheet">
        <div className="shead"><Link href={sp.back ?? "/news"} aria-label="뒤로">‹</Link><span className="ttl">뉴스 상세</span></div>
        <p className="spath">{["시장", x?.sectors?.[0]].filter(Boolean).join(" · ")} · {kstTime(new Date(a.published_utc).toISOString())}</p>
        {x?.sectors?.[0] ? <span className="chip dark">{x.sectors[0]}</span> : null}
        <h1 className="ntitle">{x?.short_summary ?? a.title}</h1>
        <div className="foot"><span className="src">{a.source || a.outlet} · {fullTime(a.published_utc)}</span><a className="go" href={a.link} target="_blank" rel="noreferrer noopener" aria-label="원문 보기"><ExtLink /></a></div>
        <section className="ai">
          <div className="top"><span className="badge"><AiMark label="요약" /></span></div>
          {k?.text ? <p className="para">{k.text}</p>
            : <p className="pending">{whyNoSummary(x?.status, !!x?.extracted)}</p>}
          {k?.impact_note || impact || myLinked.length ? (
            <p className="nview">
              {impact && IMPACT_LABEL[impact.impact] ? <span className={`verdict ${IMPACT_LABEL[impact.impact][1]}`}>{IMPACT_LABEL[impact.impact][0]}</span> : null}
              <span>{priceOnly ? "주가 움직임을 다룬 기사라 좋고 나쁨을 판정하지 않았어요." : k?.impact_note || `${impact?.name ?? ""} 관련 소식`}
                {basis ? <small className="nbasis">근거{basis.ko ? "" : "(원문)"} · {basis.text}</small> : null}
                {impact ? <small className="nbasis">판정은 주가가 아니라 기사에 나온 사업 내용 기준이에요.</small> : null}
                {myLinked.length ? <><br /><b>내 종목</b> {myLinked.map((c) => <Link key={c} href={`/mine/${c}`} className="stchip">{uStock(c)?.name ?? c} ›</Link>)}</> : null}</span>
            </p>
          ) : null}
          {k?.text || impact ? <p className="note">AI가 요약·판정했어요. 원문과 다를 수 있어요.</p> : null}
        </section>
        {same.length ? <SameNews rows={same} /> : null}
        {follow.length ? (
          <section className="follow">
            <h2>후속 보도</h2>
            {follow.map((f) => (
              <Link key={String(f.key)} href={`/news/a/${f.key}`} className="frow"><span>{kstTime(new Date(f.published_utc as string).toISOString())}</span><b>{String(f.short_summary ?? f.title)}</b><em>›</em></Link>
            ))}
          </section>
        ) : null}
        {related.length ? (
          <section className="follow">
            <h2>관련 기업</h2>
            {related.map((r) => {
              const inner = <><span className="rcol"><b>{r.name}</b><small>{r.sub}</small></span>{r.h != null ? <span className="rpct">오늘 예상 <b style={{ color: signColor(r.h) }}>{pct(P(r.h))}</b></span> : null}{r.href ? <em>›</em> : null}</>;
              return r.href ? <Link key={r.name} href={r.href} className="rrow">{inner}</Link> : <div key={r.name} className="rrow">{inner}</div>;
            })}
          </section>
        ) : null}
      </main>
      <BottomNav active="news" />
    </>
  );
}

const ExtLink = () => <svg aria-hidden width="16" height="16" viewBox="0 0 16 16"><path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
