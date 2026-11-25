// 공통 부품: 화면 머리, 아래 메뉴, 뉴스 카드, 상태(비어 있음·준비 중). 피그마 '공통/…', '뉴스/…' 컴포넌트를 따른다.
import Link from "next/link";
import type { ReactNode } from "react";
import { IMPACT_LABEL, kstTime } from "@/lib/format";
import { stockName } from "@/lib/data";
import { foldStories, type Article } from "@/lib/news";


// 아이콘(피그마 배포/하단 메뉴 771:173, 변경 기록 33 '투톤', 2026-11-25 반영): 선택 안 됨 = 회색 선만, 선택됨 = 민트 면 + 청록 선.
// 두 가지 색이라 한 색으로 칠하는 마스크 대신 탭마다 파일 두 개(public/icons/nav-*.svg, nav-*-on.svg)
const TABS = [
  { key: "home", href: "/", label: "홈" },
  { key: "news", href: "/news", label: "뉴스 브리핑" },
  { key: "night", href: "/night", label: "밤사이" },
  { key: "mine", href: "/mine", label: "내 종목" },
  { key: "saved", href: "/saved", label: "보관" },
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
          <img className="ic" src={`/icons/nav-${t.key}${t.key === active ? "-on" : ""}.svg`} alt="" width={24} height={24} aria-hidden />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Head({ title, sub, help, tabs }: { title: ReactNode; sub?: ReactNode; help?: ReactNode; tabs?: ReactNode }) {   // tabs: 제목 아래 보기 전환 줄(뉴스 브리핑, 2026-11-25). 있으면 help는 그 줄 끝에
  return (
    <header className="head">
      <h1>{title}{tabs ? null : help}</h1>
      {tabs ? <div className="htabs">{tabs}{help}</div> : null}
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
function Title({ a, back }: { a: Article; back?: string }) {   // back: 기사 상세에서 뒤로 갈 곳(없으면 뉴스 브리핑)
  return (
    <Link href={back ? `/news/a/${a.key}?back=${encodeURIComponent(back)}` : `/news/a/${a.key}`} className="tlink">
      {a.ko ? <p className="title">{a.ko}</p> : <p className="title" lang="en">{a.title}</p>}
    </Link>
  );
}

const ExtIcon = () => <svg aria-hidden width="16" height="16" viewBox="0 0 16 16"><path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/** 뉴스 목록 한 줄(배포용 변경 '뉴스 · 시장 / 산업별도 내 종목과 같은 목록 규칙', 피그마 784:1739 · 769:9749):
 *  흰 바탕 목록 + 구분선, (시장만) 주제 / 제목 / 매체 · 시각 / 관련 종목 · 종목 / 오른쪽 바깥 링크 아이콘. 칩 없음 */
export function NewsCard({ a, tag, impact, more }: { a: Article; tag?: string; impact?: string | null; more?: ReactNode }) {   // impact: 기사 판정(시장·산업별, articleVerdict) → 판정 글자·왼쪽 막대, more: 정보 줄 끝(같은 소식 n건)
  const k = tag ? null : a.themes[0];   // 주제는 시장 탭에서만(산업별은 업종이 이미 정해져 있음)
  const names = a.direct.slice(0, 3).map(stockName); // 그 종목 고유 검색어로 걸린 종목
  const v = impact ? IMPACT_LABEL[impact] : null;
  return (
    <article className={`nline ${impact !== undefined ? `sn ${v ? v[1] : ""}` : ""}`}>
      <div className="nl">
        {k ? <span className="ntopic">{k}</span> : null}
        <Title a={a} />
        <span className="nmeta">{v ? <span className="vtag"><b className={`verdict ${v[1]}`}>{v[0]}</b> · </span> : null}{a.source} · {kstTime(a.published)}{more}</span>
        {names.length ? <span className="nrel"><b>관련</b> {names.join(" · ")}</span> : null}
      </div>
      <a className="next" href={a.link} target="_blank" rel="noreferrer noopener" aria-label="원문 보기"><ExtIcon /></a>
    </article>
  );
}

/** 판정 묶음(2026-11-24): 부정 → 긍정 → 엇갈림 → 중립 → 판정 없는 순서로 머리줄과 기사들. 뉴스 브리핑 세 화면이 같이 쓴다.
 *  같은 소식(서버 news.stories) 기사는 가장 최근 것 한 줄, 그 정보 줄 끝에 '같은 소식 n건 ⌄'(A안). 누르면 바로 아래에 제목 · 매체 · 시각만 작은 줄로 펼친다.
 *  머리줄 = '부정 소식'(크게) + '주제 14개 · 23건'(중간, 주제 = 같은 소식을 한 줄로 셈, 2026-11-25 사용자 결정). 띠는 묶음 하나에 세로 한 줄, 기사 줄의 판정 글자·막대는 숨긴다.
 *  묶음마다 처음엔 SHOW_ROWS줄만, 나머지는 '나머지 소식 n개 더 보기'로 펼친다. 펼치기는 모두 숨은 체크 칸 + label(스크립트 없이) */
const SHOW_ROWS = 10;
export function VerdictGroups({ groups, render }: { groups: { k: string | null; label: string; xs: Article[] }[]; render: (a: Article, more?: ReactNode) => ReactNode }) {
  return (
    <div className="vgroups">
      {groups.map((g) => {
        const folds = foldStories(g.xs);
        const gid = `vg-${g.k ?? "none"}`;
        const row = (f: { head: Article; rest: Article[] }) => {
          if (!f.rest.length) return <div key={f.head.key} className="nfold">{render(f.head)}</div>;
          const id = `fold-${g.k ?? "none"}-${f.head.key}`.replace(/[^A-Za-z0-9_-]/g, "");
          return (
            <div key={f.head.key} className="nfold">
              <input type="checkbox" id={id} className="fold-cb" hidden />
              {render(f.head, <> · <label htmlFor={id} className="fmore">같은 소식 {f.rest.length}건</label></>)}
              <ul className="nfold-in" aria-label="같은 소식 기사">
                {f.rest.map((a) => (
                  <li key={a.key}>
                    <Link href={`/news/a/${a.key}`} className="nm-tt">{a.ko ?? <span lang="en">{a.title}</span>}</Link>
                    <span className="nm-m">{a.source} · {kstTime(a.published)}</span>
                    <a className="nm-x" href={a.link} target="_blank" rel="noreferrer noopener" aria-label="원문 보기"><ExtIcon /></a>
                  </li>
                ))}
              </ul>
            </div>
          );
        };
        const extra = folds.slice(SHOW_ROWS);
        return (
          <section key={g.label} className={`nsgroup ${gid.replace("vg-negative", "vg-neg").replace("vg-positive", "vg-pos").replace(/vg-(mixed|neutral)/, "vg-neu")}`}>
            <p className="nsg-h"><span className="t">{g.label} 소식</span><span className="c">주제 {folds.length}개 · {g.xs.length}건</span></p>
            {folds.slice(0, SHOW_ROWS).map(row)}
            {extra.length ? <>
              <input type="checkbox" id={`${gid}-more`} className="more-cb" hidden />
              <div className="vg-extra"><div>{extra.map(row)}</div></div>
              <label htmlFor={`${gid}-more`} className="vg-more"><span className="o">나머지 소식 {extra.length}개 더 보기<i className="chev" aria-hidden /></span><span className="x">접기<i className="chev up" aria-hidden /></span></label>
            </> : null}
          </section>
        );
      })}
    </div>
  );
}

/** 종목 블록 안 뉴스 한 줄(배포용 변경 '뉴스 · 내 종목 읽기 쉽게', 피그마 794:157): 왼쪽 세로 판정 막대 · 제목 · '판정 · 매체 · 시각' · 바깥 링크 아이콘 */
export function StockNews({ a, impact, back, more }: { a: Article; impact?: string | null; back?: string; more?: ReactNode }) {
  const v = impact ? IMPACT_LABEL[impact] : null;
  return (
    <article className={`nline sn ${v ? v[1] : ""}`}>
      <div className="nl">
        <Title a={a} back={back} />
        <span className="nmeta">{v ? <span className="vtag"><b className={`verdict ${v[1]}`}>{v[0]}</b> · </span> : null}{a.source} · {kstTime(a.published)}{more}</span>
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

/** AI 표시(2026-11-25 통일, 사용자 시안): 테두리·바탕 없이 세 줄 요약 아이콘 + 'AI'를 진한 초록 계열 그라데이션(초록→앱 청록→진한 청록)으로. 빛이 4초마다 글자 위를 지나간다(움직임 줄이기면 없음).
 *  label: 뒤에 붙일 말(예: '요약', '전체 요약'). small: 문장 앞에 붙는 작은 크기 */
export function AiMark({ label, small }: { label?: string; small?: boolean }) {
  return (
    <span className={`aimk${small ? " sm" : ""}`} aria-label={`AI${label ? ` ${label}` : ""}`}>
      <img src="/icons/ai-lines.svg" alt="" aria-hidden width={small ? 13 : 16} height={small ? 10 : 12} />
      <b aria-hidden>AI</b>{label ? <span className="lb" aria-hidden>{label}</span> : null}
    </span>
  );
}

/** AI 전체 요약(핫이슈 줄). 줄이 없으면 준비 중 */
/** lines: 글 한 줄, 또는 [굵은 머리말, 글](피그마 522:6842 '반도체 AI 서버 투자…') */
/** empty: 요약은 돌았는데 줄이 없을 때 '준비 중' 대신 보여 줄 문구(본문, 아래 작은 글씨). 없으면 준비 중 */
export function AiSummary({ meta, what, lines, note, empty, badge = "AI 전체 요약" }: { meta: string; what: string; lines: (string | [string, string])[]; note?: string; empty?: [string, string]; badge?: string }) {   // badge: 종목 한 장(뉴스 · 내 종목 뉴스)은 'AI 요약'
  if (!lines.length && empty) {
    return (
      <section className="ai">
        <div className="top">
          <span className="badge"><AiMark label={badge.replace(/^AI\s*/, "")} /></span>
          <span className="meta">{meta}</span>
        </div>
        <p className="pending">{empty[0]}</p>
        <p className="note">{empty[1]}</p>
      </section>
    );
  }
  if (!lines.length) return <AiPending meta={meta} what={what} badge={badge} />;
  return (
    <section className="ai">
      <div className="top">
        <span className="badge"><AiMark label={badge.replace(/^AI\s*/, "")} /></span>
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
export function AiPending({ meta, what, badge = "AI 전체 요약" }: { meta: string; what: string; badge?: string }) {
  return (
    <section className="ai">
      <div className="top">
        <span className="badge"><AiMark label={badge.replace(/^AI\s*/, "")} /></span>
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

/** 시연 시각으로 지난 시각을 보는 중일 때 종목 추가·수정 대신 보여 주는 안내(2026-11-23: 과거 시각은 그때 보유 구성으로 보여 줘서 고칠 수 없게) */
export function PastLock({ back }: { back: string }) {
  return (
    <main className="addpage">
      <div className="addtop"><a href={back} aria-label="뒤로">‹</a><b>종목 바꾸기</b></div>
      <h1>지난 시각을 보는 중이에요</h1>
      <p className="lead">지금 화면은 그 시각에 가지고 있던 종목으로 보여 드려요. 종목 추가·수정은 지금 시각에서 할 수 있어요.</p>
      <a className="cta" href={`/demo-time?at=off&back=${encodeURIComponent(back)}`} style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>지금 시각으로 돌아가기</a>
    </main>
  );
}
