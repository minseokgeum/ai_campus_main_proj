// 공통 부품: 화면 머리, 아래 메뉴, 뉴스 카드, 상태(비어 있음·준비 중). 피그마 '공통/…', '뉴스/…' 컴포넌트를 따른다.
import Link from "next/link";
import type { ReactNode } from "react";
import { IMPACT_LABEL, kstTime } from "@/lib/format";
import { stockName } from "@/lib/data";
import type { Article } from "@/lib/news";


const TABS = [
  { key: "home", href: "/", label: "홈", icon: "/icons/tab-home.svg" },
  { key: "news", href: "/news", label: "뉴스 브리핑", icon: "/icons/tab-news-on.svg" },
  { key: "night", href: "/night", label: "밤사이", icon: "/icons/tab-night.svg" },
  { key: "mine", href: "/mine", label: "내 종목", icon: "/icons/tab-mine.svg" },
  { key: "saved", href: "/saved", label: "보관", icon: "/icons/tab-saved.svg" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

/** 계좌 고르기(a)는 메뉴를 옮겨도 따라간다 */
export function withAcct(href: string, acct?: string) {
  return acct ? `${href}${href.includes("?") ? "&" : "?"}a=${acct}` : href;
}

export function BottomNav({ active, acct }: { active: TabKey; acct?: string }) {
  return (
    <nav className="nav" aria-label="아래 메뉴">
      {TABS.map((t) => (
        <Link key={t.key} href={withAcct(t.href, acct)} className={t.key === active ? "on" : ""} aria-current={t.key === active ? "page" : undefined}>
          <span className="ic" style={{ ["--ic" as string]: `url(${t.icon})` }} aria-hidden />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Head({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <header className="head">
      <h1>{title}</h1>
      {sub ? <p className="sub">{sub}</p> : null}
      <Link href="/my" className="my" aria-label="마이">
        <img src="/icons/my.svg" alt="" width={23} height={23} />
      </Link>
    </header>
  );
}

export function Section({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="sec">
      <span className="t">{title}</span>
      {right ? <span className="r">{right}</span> : null}
    </div>
  );
}

function Source({ a }: { a: Article }) {
  return (
    <div className="foot">
      <span className="src">{a.source} · {kstTime(a.published)}</span>
      <a className="go" href={a.link} target="_blank" rel="noreferrer noopener">원문 보기 <b>↗</b></a>
    </div>
  );
}

/** 한국어 한 줄 요약이 있으면 제목으로, 원문 제목은 그 아래 작게 */
function Title({ a }: { a: Article }) {
  return (
    <Link href={`/news/a/${a.key}`} className="tlink">
      {a.ko ? <p className="title">{a.ko}</p> : <p className="title" lang="en">{a.title}</p>}
    </Link>
  );
}

/** 실시간 뉴스 카드(시장·산업별): 제목, 업종 칩 + 종목 칩, 매체 · 시각, 원문 보기 */
export function NewsCard({ a, tag }: { a: Article; tag?: string }) {
  const k = tag ?? a.themes[0];
  const names = a.direct.slice(0, 2).map(stockName); // 그 종목 고유 검색어로 걸린 종목만 칩으로
  return (
    <article className="card">
      <Title a={a} />
      {k || names.length ? (
        <div className="chips">
          {k ? <span className="chip k">{k}</span> : null}
          {names.map((n) => <span key={n} className="chip">{n}</span>)}
        </div>
      ) : null}
      <Source a={a} />
    </article>
  );
}

/** 종목 블록 안 뉴스 한 줄 */
export function StockNews({ a, impact }: { a: Article; impact?: string | null }) {
  const v = impact ? IMPACT_LABEL[impact] : null;
  return (
    <article className="snews">
      <Title a={a} />
      {v ? <div className="chips"><span className={`verdict ${v[1]}`}>{v[0]}</span></div> : null}
      <Source a={a} />
    </article>
  );
}

/** AI 전체 요약(핫이슈 줄). 줄이 없으면 준비 중 */
/** lines: 글 한 줄, 또는 [굵은 머리말, 글](피그마 522:6842 '반도체 AI 서버 투자…') */
export function AiSummary({ meta, what, lines, note }: { meta: string; what: string; lines: (string | [string, string])[]; note?: string }) {
  if (!lines.length) return <AiPending meta={meta} what={what} />;
  return (
    <section className="ai">
      <div className="top">
        <span className="badge">AI 전체 요약</span>
        <span className="meta">{meta}</span>
      </div>
      {lines.map((l, i) => (
        <p key={i} className="line"><img src="/icons/bullet.svg" alt="" width={5} height={14} />{typeof l === "string" ? l : <span><b>{l[0]}</b> {l[1]}</span>}</p>
      ))}
      <p className="note">{note ?? "AI가 요약했어요. 원문과 다를 수 있어요."}</p>
    </section>
  );
}

/** AI 전체 요약 자리: 처리(news_extract → news_track → 요약)를 켜면 채운다 */
export function AiPending({ meta, what }: { meta: string; what: string }) {
  return (
    <section className="ai">
      <div className="top">
        <span className="badge">AI 전체 요약</span>
        <span className="meta">{meta}</span>
      </div>
      <p className="pending">{what} AI 요약은 준비 중이에요. 아래에서 밤사이 원문 기사를 먼저 볼 수 있어요.</p>
      <p className="note">기사 제목은 원문(영어) 그대로예요.</p>
    </section>
  );
}

export function Empty({ text = "오늘은 관련 소식이 없습니다" }: { text?: string }) {
  return <p className="state">{text}</p>;
}

export function Soon({ title, body }: { title: string; body: string }) {
  return (
    <div className="soon">
      <b>{title}</b>
      <p>{body}</p>
    </div>
  );
}
