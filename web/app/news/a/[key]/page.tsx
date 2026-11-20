// 뉴스 상세(피그마 527:6148): 한국어 제목, 매체·시각, 원문 보기, AI 요약(한국어 줄글 번역), 영향 한 문장, 같은 사건의 후속 보도.
// 한국어 번역은 서버가 추출 직후 미리 만든 news.article_ko(news_search/news_ko_summary.ipynb)를 읽기만 한다(누를 때 기다림 없음).
// AI 요약 칸은 추출 결과의 comparison_summary를 한국어 줄글 한 단락으로 번역한 text(2026-11-20 정함).
import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { portfolio, uStock } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { nightNews } from "@/lib/news";
import { IMPACT_LABEL } from "@/lib/summary";
import { dayModel } from "@/lib/model";
import { kstNow } from "@/lib/calendar";
import { signColor } from "@/components/model";
import { pct } from "@/lib/format";
import { P } from "@/lib/night";
import { kstTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/** '11월 18일 05:12'(한국 시각) */
const fullTime = (v: string | Date) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(v)).map((x) => [x.type, x.value]));
  return `${p.month}월 ${p.day}일 ${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}`;
};

const none = { rows: [] as Record<string, unknown>[] };

export default async function NewsDetail({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ back?: string }> }) {
  const { key } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f]{16}$/.test(key)) notFound();
  const user = await requireUser();
  const pool = db();
  const [pf, it, ai, ko, st, { articles }] = await Promise.all([
    portfolio(user.id),
    pool.query("select key, title, source, outlet, published_utc, link from items where key = $1", [key]),
    pool.query("select short_summary, impacts, sectors, coalesce(extraction->>'comparison_summary', '') <> '' as extracted, extraction->'graph'->'entities' as entities from news.llm_articles where key = $1", [key]).catch(() => none),
    pool.query("select text, impact_note from news.article_ko where key = $1", [key]).catch(() => none),
    pool.query("select story_id from news.stories where key = $1", [key]).catch(() => none),
    nightNews(),
  ]);
  const dm = await dayModel().catch(() => null);
  const a = it.rows[0];
  if (!a) notFound();
  const x = ai.rows[0] as { short_summary?: string; impacts?: { name: string; impact: string }[]; sectors?: string[]; extracted?: boolean;
    entities?: { name?: string; name_en?: string; type?: string; country?: string; ticker?: string; category?: string; mention?: string }[] } | undefined;
  const k = ko.rows[0] as { text?: string | null; impact_note?: string } | undefined;
  const story = st.rows[0]?.story_id as string | undefined;
  const follow = story ? (await pool.query(
    `select i.key, i.title, i.link, i.published_utc, l.short_summary from news.stories s join items i on i.key = s.key left join news.llm_articles l on l.key = s.key
     where s.story_id = $1 and s.key <> $2 order by i.published_utc desc limit 8`, [story, key]).catch(() => none)).rows : [];
  const mine = new Set([...pf.holdings.map((h) => h.code), ...pf.watch]);
  const myLinked = (articles.find((y) => y.key === key)?.direct ?? []).filter((c) => mine.has(c));
  const impact = (x?.impacts ?? []).find((i) => i.impact && i.impact !== "neutral");
  // 관련 기업(피그마 527:6148): 이 기사에 걸린 국내 종목(내 종목 먼저, 오늘 예상 함께) + 기사에서 뽑은 해외 기업(나라 · 티커)
  const krCodes = articles.find((y) => y.key === key)?.direct ?? [];
  const fresh = dm?.t === kstNow().ymd && dm?.card?.status === "ok";
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
        <div className="foot"><span className="src">{a.source || a.outlet} · {fullTime(a.published_utc)}</span><a className="go" href={a.link} target="_blank" rel="noreferrer noopener">원문 보기 <b>↗</b></a></div>
        <section className="ai">
          <div className="top"><span className="badge">AI 요약</span></div>
          {k?.text ? <p className="para">{k.text}</p>
            : <p className="pending">{x?.extracted ? "AI 요약을 준비하고 있어요. 잠시 뒤 다시 열어 주세요."
              : "AI가 요약하지 않은 기사예요(본문을 받지 못했거나 보도자료·영상인 기사, 또는 아직 처리 전). 원문 보기로 확인해 주세요."}</p>}
          {k?.impact_note || impact || myLinked.length ? (
            <p className="nview">
              {impact && IMPACT_LABEL[impact.impact] ? <span className={`verdict ${IMPACT_LABEL[impact.impact][1]}`}>{IMPACT_LABEL[impact.impact][0]}</span> : null}
              <span>{k?.impact_note || `${impact?.name ?? ""} 관련 소식`}{myLinked.length ? <><br /><b>내 종목</b> {myLinked.map((c) => <Link key={c} href={`/mine/${c}`} className="stchip">{uStock(c)?.name ?? c} ›</Link>)}</> : null}</span>
            </p>
          ) : null}
          <p className="note">AI가 요약·판정했어요. 원문과 다를 수 있어요.</p>
        </section>
        {follow.length ? (
          <section className="follow">
            <h2>후속 보도</h2>
            {follow.map((f) => (
              <a key={String(f.key)} href={String(f.link)} target="_blank" rel="noreferrer noopener" className="frow"><span>{kstTime(new Date(f.published_utc as string).toISOString())}</span><b>{String(f.short_summary ?? f.title)}</b><em>↗</em></a>
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
