// 내 종목 연결 그림: 왼쪽 칸들이 오른쪽 내 종목 칸(흰 바탕 · ●)으로 모인다. 2026-11-25 사용자 시안으로 모양을 바꿈:
// 칸 = 테두리 없는 연회색(이름 · 관계 둘째 줄 · 오른쪽 진한 숫자 = 밤사이 소식 수). 소식이 가장 많은 연결은 민트 칸 + 진한 청록 선,
// 소식이 난 다른 연결은 연한 청록 선, 소식 없는 직접 관계는 회색 선, 업종·테마로 넓게 이어진 것은 점선. 자료는 lib/links.ts(소식 많은 순).
import Link from "next/link";
import { Sheet } from "@/components/sheet";
import type { LinkNode } from "@/lib/links";
import { LangToggle, LinkBox, LinkLang, LinkRow } from "@/components/linkbox";

const ROW = 64, BOX = 52;          // 칸 높이 52px, 칸 사이 12px
const L = 56, R = 70;              // 선이 시작하는 x(왼쪽 칸 오른쪽 끝)·끝나는 x(내 종목 칸 왼쪽 끝), 너비 %(칸 56% · 내 종목 칸 30%, 2026-11-25)

/** 연결 그림: 칸 n개(위에서부터) → 내 종목 칸 하나 */
export function LinkGraph({ name, nodes }: { name: string; nodes: LinkNode[] }) {
  const H = nodes.length * ROW - (ROW - BOX), mid = H / 2;
  const lead = nodes.reduce<LinkNode | null>((a, x) => (x.n > 0 && (!a || x.n > a.n) ? x : a), null)?.key;   // 소식이 가장 많은 연결
  const stroke = (x: LinkNode) => (x.key === lead ? ["#2e8a7e", 2.2] : x.n ? ["#a6d4cc", 1.6] : ["#c5cdcf", 1.4]) as [string, number];
  return (
    <div className="lgraph" style={{ height: H }}>
      <svg aria-hidden className="lglines" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" width="100%" height={H}>
        {/* 선: 왼쪽 칸에서 수평으로 나와 가운데서 휘고 내 종목 칸에 수평으로 들어가는 곡선. 진한 선이 위에 오게 소식 많은 선을 나중에 그린다 */}
        {nodes.map((x, i) => ({ x, y: i * ROW + BOX / 2 })).sort((a, b) => Number(a.x.key === lead) - Number(b.x.key === lead) || Number(!!a.x.n) - Number(!!b.x.n)).map(({ x, y }) => (
          <path key={x.key} d={`M${L},${y} C${(L + R) / 2},${y} ${(L + R) / 2},${mid} ${R},${mid}`} fill="none" vectorEffect="non-scaling-stroke"
            stroke={stroke(x)[0]} strokeWidth={stroke(x)[1]} strokeDasharray={x.direct ? undefined : "2 4"} strokeLinecap="round" />
        ))}
      </svg>
      {nodes.map((x, i) => <LinkBox key={x.key} name={x.name} sub={x.rel} kind={x.kind} n={x.n} terms={x.terms} top={i * ROW} lead={x.key === lead} />)}
      <div className="lgme" style={{ top: mid - 24 }} title={name}><i aria-hidden /><b>{name}</b></div>
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
      <p className="lgnote">연결은 공시·기사에서 모았어요. 숫자는 밤사이 그 연결로 들어온 미국 뉴스 수예요.</p>
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
        <LinkGraph name={name} nodes={nodes.slice(0, 5)} />
        <LinkLegend />
        <p className="lgcount">이어진 것 {nodes.length}개 중 {Math.min(5, nodes.length)}개</p>
        <Link href={`/mine/${code}`} className="cta lgcta">종목 상세에서 보기</Link>
      </Sheet>
    </LinkLang>
  );
}

/** ③ 종목 상세의 '관계도 ›' 창(2026-11-25 시안): 다섯 칸 그림 + 범례, 나머지는 줄 목록 */
export function LinksSheet({ name, nodes }: { name: string; nodes: LinkNode[] }) {
  if (!nodes.length) return null;
  return (
    <LinkLang>
      <Sheet className="d4-tlink" title={`${name} · 이어진 것`} sub="오늘 소식이 난 연결을 위에 보여드려요" trigger={<>관계도 ›</>}>
        <LinkGraph name={name} nodes={nodes.slice(0, 5)} />
        <LinkLegend />
        <p className="lgcount">이어진 것 {nodes.length}개 중 {Math.min(5, nodes.length)}개</p>
        {nodes.length > 5 ? <LinkRows nodes={nodes.slice(5)} /> : null}
      </Sheet>
    </LinkLang>
  );
}

/** ④ 종목 상세 '오늘 소식이 난 연결'(2026-11-25 시안): 소식 난 연결 세 칸을 작은 그림으로 바로, 오른쪽 '관계도 ›'는 전체 창 */
export function HotLinks({ name, nodes }: { name: string; nodes: LinkNode[] }) {
  if (!nodes.length) return null;
  const hot = nodes.filter((x) => x.n > 0);
  return (
    <LinkLang>
      <div className="hotlinks">
        <div className="hh"><b>오늘 소식이 난 연결</b><LinksSheet name={name} nodes={nodes} /></div>
        {hot.length ? <LinkGraph name={name} nodes={hot.slice(0, 3)} /> : <p className="lgnone">밤사이 소식이 난 연결은 없어요</p>}
        {hot.length > 3 ? <p className="lgcount">그 밖에 소식이 난 연결 {hot.length - 3}개</p> : null}
      </div>
    </LinkLang>
  );
}
