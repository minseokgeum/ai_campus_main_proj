// 내 종목 연결 그림(디자인 예시 '내 종목 연결 그림' ①②③, 피그마 미국 연결 기업 794:2 · 794:157 · 794:527의 모양): 왼쪽 칸들이 오른쪽 내 종목 칸으로 모인다.
// 주황 = 밤사이 소식이 난 연결, 회색 = 소식 없음 · 실선 = 직접 관계, 점선 = 업종·테마로 넓게 이어진 것. 자료는 lib/links.ts.
import Link from "next/link";
import { Sheet } from "@/components/sheet";
import type { LinkNode } from "@/lib/links";
import { LangToggle, LinkBox, LinkLang, LinkRow } from "@/components/linkbox";

const ROW = 64, BOX = 52;          // 칸 높이 52px, 칸 사이 12px
const L = 42, R = 73;              // 선이 시작하는 x(왼쪽 칸 오른쪽 끝)·끝나는 x(내 종목 칸 왼쪽 끝), 너비 %

/** 연결 그림: 칸 n개(위에서부터) → 내 종목 칸 하나 */
export function LinkGraph({ name, nodes }: { name: string; nodes: LinkNode[] }) {
  const H = nodes.length * ROW - (ROW - BOX), mid = H / 2;
  return (
    <div className="lgraph" style={{ height: H }}>
      <svg aria-hidden className="lglines" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" width="100%" height={H}>
        {nodes.map((x, i) => (
          <line key={x.key} x1={L} y1={i * ROW + BOX / 2} x2={R} y2={mid} vectorEffect="non-scaling-stroke"
            stroke={x.n ? "#e0a526" : "#b8c0c3"} strokeWidth={x.n ? 2.5 : 1.5} strokeDasharray={x.direct ? undefined : "5 5"} strokeLinecap="round" />
        ))}
      </svg>
      {nodes.map((x, i) => {
        const cy = i * ROW + BOX / 2;
        return (
          <div key={x.key}>
            <LinkBox name={x.name} sub={`${x.kind}${x.n ? ` · 소식 ${x.n}` : ""}`} hot={x.n > 0} terms={x.terms} top={i * ROW} />
            <span className="lglbl" style={{ top: cy < mid - 1 ? cy - 18 : cy > mid + 1 ? cy + 4 : cy - 18 }}>{x.rel}</span>
          </div>
        );
      })}
      <div className="lgme" style={{ top: mid - 30 }} title={name}><b>{name}</b></div>
      <p className="sr">{nodes.map((x) => `${x.name}(${x.kind}, ${x.rel}${x.n ? `, 소식 ${x.n}건` : ""})`).join(", ")}이 {name}과 이어져 있어요.</p>
    </div>
  );
}

/** 범례와 안내 */
export function LinkLegend() {
  return (
    <>
      <p className="lgleg">
        <span><i className="hot" />오늘 소식 난 연결</span>
        <span><i />직접 관계</span>
        <span><i className="dash" />업종·테마로 이어짐</span>
      </p>
      <p className="lgnote">연결은 공시·기사에서 모았어요. 소식 수는 밤사이 그 연결로 들어온 미국 뉴스 수예요. 가 ⇄ A나 칸을 누르면 미국 뉴스 검색어 원문으로 바뀌어요.</p>
    </>
  );
}

/** 모두 보기 창 안의 목록(칸이 많을 때 그림 대신 줄로) */
function LinkRows({ nodes }: { nodes: LinkNode[] }) {
  return (
    <ul className="lgrows">
      {nodes.map((x) => (
        <LinkRow key={x.key} name={x.name} sub={`${x.kind} · ${x.rel}${x.direct ? "" : " (넓은 연결)"}`} terms={x.terms} n={x.n} />
      ))}
    </ul>
  );
}

/** ① 종목 상세 칸: 다섯 칸까지 그림, 나머지는 '모두 보기' 창의 목록 */
export function StockLinksSection({ name, nodes }: { name: string; nodes: LinkNode[] }) {
  if (!nodes.length) return null;
  const top = nodes.slice(0, 5);
  return (
    <LinkLang><section className="pcard">
      <div className="rowh"><b>내 종목과 이어진 것</b>{nodes.length > 5 ? (
        <Sheet className="linkish teal" title={`${name} · 이어진 것`} sub={`${nodes.length}개 · 오늘 소식이 난 연결 먼저`} trigger={<>{nodes.length}개 모두 보기 ›</>}>
          <div className="lgtbar"><LangToggle /></div>
          <LinkRows nodes={nodes} />
        </Sheet>) : null}</div>
      <div className="lgsub"><p className="sline2">오늘 소식이 난 연결을 위에 보여드려요</p><LangToggle /></div>
      <LinkGraph name={name} nodes={top} />
      {nodes.length > top.length ? <p className="lgmore">그 밖에 이어진 것 {nodes.length - top.length}개</p> : null}
      <LinkLegend />
    </section></LinkLang>
  );
}

/** ② 뉴스 · 내 종목 블록의 카드: 오늘 소식이 난 연결만 세 칸까지. 없으면 숨김. '관계도 ›'는 ③ 창(다섯 칸 그림) */
export function NewsLinksCard({ code, name, nodes }: { code: string; name: string; nodes: LinkNode[] }) {
  const hot = nodes.filter((x) => x.n > 0);
  if (!hot.length) return null;
  return (
    <LinkLang><div className="lcard">
      <div className="lchead">
        <span>오늘 소식이 <b>난 연결</b></span>
        <LangToggle />
        <Sheet className="linkish teal" title={`${name} · 이어진 것`} sub="오늘 소식이 난 연결을 위에 보여드려요" trigger={<>관계도 ›</>}>
          <div className="lgtbar"><LangToggle /></div>
          <LinkGraph name={name} nodes={nodes.slice(0, 5)} />
          <LinkLegend />
          <p className="lgnote">이어진 것 {nodes.length}개 중 {Math.min(5, nodes.length)}개</p>
          <Link href={`/mine/${code}`} className="cta lgcta">종목 상세에서 보기</Link>
        </Sheet>
      </div>
      <LinkGraph name={name} nodes={hot.slice(0, 3)} />
      {hot.length > 3 ? <p className="lgmore">그 밖에 소식이 난 연결 {hot.length - 3}개</p> : null}
    </div></LinkLang>
  );
}
