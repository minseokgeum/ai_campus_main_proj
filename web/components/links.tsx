// 내 종목 연결 그림(디자인 예시 '내 종목 연결 그림' ①②③, 피그마 미국 연결 기업 794:2 · 794:157 · 794:527의 모양): 왼쪽 칸들이 오른쪽 내 종목 칸으로 모인다.
// 칸 = 이름 · 관계(둘째 줄) · 오른쪽 노란 숫자(밤사이 소식 수), 소식이 난 칸은 연한 노란 바탕. 선: 주황 = 소식이 난 연결, 회색 = 소식 없음 · 실선 = 직접 관계, 점선 = 업종·테마로 넓게 이어진 것. 자료는 lib/links.ts.
import Link from "next/link";
import { Sheet } from "@/components/sheet";
import type { LinkNode } from "@/lib/links";
import { LangToggle, LinkBox, LinkLang, LinkRow } from "@/components/linkbox";

const ROW = 64, BOX = 52;          // 칸 높이 52px, 칸 사이 12px
const L = 54, R = 73;              // 선이 시작하는 x(왼쪽 칸 오른쪽 끝)·끝나는 x(내 종목 칸 왼쪽 끝), 너비 %. 선 위 글자를 칸 안으로 옮겨 칸을 넓힘(2026-11-22)

/** 연결 그림: 칸 n개(위에서부터) → 내 종목 칸 하나 */
export function LinkGraph({ name, nodes }: { name: string; nodes: LinkNode[] }) {
  const H = nodes.length * ROW - (ROW - BOX), mid = H / 2;
  return (
    <div className="lgraph" style={{ height: H }}>
      <svg aria-hidden className="lglines" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" width="100%" height={H}>
        {/* 선(2026-11-24): 왼쪽 칸에서 수평으로 나와 가운데서 휘고 내 종목 칸에 수평으로 들어가는 곡선. 소식 난(주황) 선은 회색 위에 오게 나중에 그린다 */}
        {nodes.map((x, i) => ({ x, y: i * ROW + BOX / 2 })).sort((a, b) => Number(!!a.x.n) - Number(!!b.x.n)).map(({ x, y }) => (
          <path key={x.key} d={`M${L},${y} C${(L + R) / 2},${y} ${(L + R) / 2},${mid} ${R},${mid}`} fill="none" vectorEffect="non-scaling-stroke"
            stroke={x.n ? "#e0a526" : "#b8c0c3"} strokeWidth={x.n ? 2.5 : 1.5} strokeDasharray={x.direct ? undefined : "5 5"} strokeLinecap="round" />
        ))}
      </svg>
      {nodes.map((x, i) => <LinkBox key={x.key} name={x.name} sub={x.rel} kind={x.kind} n={x.n} terms={x.terms} top={i * ROW} />)}
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
      <p className="lgnote">연결은 공시·기사에서 모았어요. 칸 오른쪽 숫자는 밤사이 그 연결로 들어온 미국 뉴스 수예요. 가 ⇄ A나 칸을 누르면 미국 뉴스 검색어 원문으로 바뀌어요.</p>
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

/** ② 뉴스 · 내 종목 뉴스의 '관계 그림 보기 ›' 단추(2026-11-24: 화면에 바로 뜨던 카드 대신 누르면 아래에서 올라오는 창). 이어진 것이 없으면 숨김 */
export function NewsLinksButton({ code, name, nodes }: { code: string; name: string; nodes: LinkNode[] }) {
  if (!nodes.length) return null;
  const hot = nodes.filter((x) => x.n > 0).length;
  return (
    <LinkLang>
      <Sheet className="lgbtn" title={`${name} · 이어진 것`} sub="오늘 소식이 난 연결을 위에 보여드려요" trigger={<>관계 그림 보기{hot ? <em>소식 난 연결 {hot}</em> : null} ›</>}>
        <div className="lgtbar"><LangToggle /></div>
        <LinkGraph name={name} nodes={nodes.slice(0, 5)} />
        <LinkLegend />
        <p className="lgnote">이어진 것 {nodes.length}개 중 {Math.min(5, nodes.length)}개</p>
        <Link href={`/mine/${code}`} className="cta lgcta">종목 상세에서 보기</Link>
      </Sheet>
    </LinkLang>
  );
}

/** ③ 종목 상세 v4의 '미국 연결 기업 소식' 줄 오른쪽 '관계도 보기 ›'(피그마 769:11725, 변경 기록 27·35, 2026-11-25): 큰 그림은 상세에서 빼고 이 창에서만 */
export function LinksSheet({ name, nodes }: { name: string; nodes: LinkNode[] }) {
  if (!nodes.length) return null;
  return (
    <LinkLang>
      <Sheet className="d4-tlink" title={`${name} · 이어진 것`} sub="오늘 소식이 난 연결을 위에 보여드려요" trigger={<>관계도 보기 ›</>}>
        <div className="lgtbar"><LangToggle /></div>
        <LinkGraph name={name} nodes={nodes.slice(0, 5)} />
        <LinkLegend />
        {nodes.length > 5 ? <><p className="lgnote">그 밖에 이어진 것 {nodes.length - 5}개</p><LinkRows nodes={nodes.slice(5)} /></> : null}
      </Sheet>
    </LinkLang>
  );
}
