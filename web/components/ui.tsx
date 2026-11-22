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

export function BottomNav({ active, acct }: { active: TabKey | null; acct?: string }) {   // null: 마이처럼 다섯 탭에 속하지 않는 화면(선택 없음)
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

export function Head({ title, sub, help }: { title: string; sub?: ReactNode; help?: ReactNode }) {
  return (
    <header className="head">
      <h1>{title}{help}</h1>
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

const ExtIcon = () => <svg aria-hidden width="16" height="16" viewBox="0 0 16 16"><path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/** 뉴스 목록 한 줄(배포용 변경 '뉴스 · 시장 / 산업별도 내 종목과 같은 목록 규칙', 피그마 784:1739 · 769:9749):
 *  흰 바탕 목록 + 구분선, (시장만) 주제 / 제목 / 매체 · 시각 / 관련 종목 · 종목 / 오른쪽 바깥 링크 아이콘. 칩 없음 */
export function NewsCard({ a, tag }: { a: Article; tag?: string }) {
  const k = tag ? null : a.themes[0];   // 주제는 시장 탭에서만(산업별은 업종이 이미 정해져 있음)
  const names = a.direct.slice(0, 3).map(stockName); // 그 종목 고유 검색어로 걸린 종목
  return (
    <article className="nline">
      <div className="nl">
        {k ? <span className="ntopic">{k}</span> : null}
        <Title a={a} />
        <span className="nmeta">{a.source} · {kstTime(a.published)}</span>
        {names.length ? <span className="nrel"><b>관련</b> {names.join(" · ")}</span> : null}
      </div>
      <a className="next" href={a.link} target="_blank" rel="noreferrer noopener" aria-label="원문 보기"><ExtIcon /></a>
    </article>
  );
}

/** 종목 블록 안 뉴스 한 줄(배포용 변경 '뉴스 · 내 종목 읽기 쉽게', 피그마 794:157): 왼쪽 세로 판정 막대 · 제목 · '판정 · 매체 · 시각' · 바깥 링크 아이콘 */
export function StockNews({ a, impact }: { a: Article; impact?: string | null }) {
  const v = impact ? IMPACT_LABEL[impact] : null;
  return (
    <article className={`nline sn ${v ? v[1] : ""}`}>
      <div className="nl">
        <Title a={a} />
        <span className="nmeta">{v ? <b className={`verdict ${v[1]}`}>{v[0]}</b> : null}{v ? " · " : ""}{a.source} · {kstTime(a.published)}</span>
      </div>
      <a className="next" href={a.link} target="_blank" rel="noreferrer noopener" aria-label="원문 보기"><ExtIcon /></a>
    </article>
  );
}

const AV_COLORS = ["#2f7d73", "#7a5ba8", "#b86e12", "#45555a", "#3d8a5a", "#8a5a3c"];   // 종목 아이콘 색(상승·하락 빨강·파랑과 겹치지 않게)
/** 종목·업종 아이콘(28px 동그라미, 첫 글자). sector면 민트 바탕 청록 글자 */
export function Avatar({ name, sector, size = 28 }: { name: string; sector?: boolean; size?: number }) {
  const c = AV_COLORS[[...name].reduce((h, ch) => h + ch.charCodeAt(0), 0) % AV_COLORS.length];
  return <span className={`av ${sector ? "sec" : ""}`} aria-hidden style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: sector ? undefined : c }}>{name.slice(0, 1)}</span>;
}

/** 보유 종목 소식 한눈에(배포용 변경 '뉴스 · 내 종목 읽기 쉽게', 피그마 794:157): 종목 아이콘 · 이름 · 판정 비율 막대(부정 주황 / 긍정 초록 / 중립 회색 / 판정 없음 연회색) · 기사 수 */
export function VerdictGlance({ title, rows }: { title: string; rows: { name: string; href: string; total: number; neg: number; pos: number; neu: number }[] }) {
  if (!rows.length) return null;
  return (
    <section className="glance vg">
      <h3>{title}<span>부정 소식 있는 종목 먼저</span></h3>
      {rows.map((r) => {
        const w = (n: number) => `${(n / Math.max(1, r.total)) * 100}%`;
        return (
          <Link key={r.name} href={r.href} className="grow">
            <Avatar name={r.name} size={22} /><b>{r.name}</b>
            <i className="vbar" aria-label={`부정 ${r.neg} · 긍정 ${r.pos} · 중립 ${r.neu} · 판정 없음 ${r.total - r.neg - r.pos - r.neu}`}>
              <em className="neg" style={{ width: w(r.neg) }} /><em className="pos" style={{ width: w(r.pos) }} /><em className="neu" style={{ width: w(r.neu) }} />
            </i>
            <span>{r.total}건</span>
          </Link>
        );
      })}
      <p className="vleg"><span><i className="neg" />부정</span><span><i className="pos" />긍정</span><span><i className="neu" />중립</span><span><i />판정 없음</span></p>
    </section>
  );
}

/** 한눈에 카드(산업별 '○○ 뉴스 속 내 종목', 업종 전체 '선택 업종 뉴스 한눈에'): 아이콘 · 이름 · 기사 수 막대(청록) · n건 */
export function Glance({ title, rows, sector }: { title: string; rows: { name: string; n: number; href?: string }[]; sector?: boolean }) {
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className="glance">
      <h3>{title}</h3>
      {rows.map((r) => {
        const inner = <><Avatar name={r.name} sector={sector} size={22} /><b>{r.name}</b><i><em style={{ width: `${(r.n / max) * 100}%` }} /></i><span>{r.n}건</span></>;
        return r.href ? <Link key={r.name} href={r.href} className="grow">{inner}</Link> : <div key={r.name} className="grow">{inner}</div>;
      })}
    </section>
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

/** 큰 상태 칸(피그마 '공통/상태 · 비어 있음' · '불러오지 못함', 배포 784:2521 · 784:2173): 동그라미 기호, 제목, 설명, 버튼 하나 */
export function StateBox({ mark, tone = "teal", title, body, action }: { mark: string; tone?: "teal" | "gray"; title: string; body: ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className={`statebox ${tone}`}>
      <span className="mk" aria-hidden>{mark}</span>
      <b>{title}</b>
      <p>{body}</p>
      {action ? <Link href={action.href} className="sb">{action.label}</Link> : null}
    </div>
  );
}

export function Empty({ text = "오늘은 관련 소식이 없어요" }: { text?: string }) {
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
