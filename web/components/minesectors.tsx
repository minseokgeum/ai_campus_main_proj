// 내 종목 v3 업종 비중(피그마 배포용 1108:1839 · 업종 비중 창 1108:2233, 변경 기록 41, 2026-11-25).
// 한 줄 막대(조각 사이 2px 틈) + 아래 이름표(점 · 업종 · %). 색은 비중 큰 순서대로 파스텔 4개, 5번째부터는 회색 '그 외'로 묶는다(업종이 딱 5개면 5번째 업종 이름 그대로 회색).
// 비중 = 수량 × 어제 종가(종가가 없으면 종목 수). '자세히 ›'를 누르면 업종별 비중 · 금액 · 종목이 아래에서 올라오는 창으로.
// 홈 나눠 보기의 '업종별 투자 비중' 카드(components/sectorshare.tsx)는 그대로 두고 이 화면만 새 모양.
import { Sheet } from "@/components/sheet";
import { uStock } from "@/lib/portfolio";
import { won } from "@/lib/format";

const COLORS = ["#5DBDB2", "#EFC65E", "#A897E0", "#F2A488"];
const OTHER = "#E4EBEB";

type Px = Map<string, { close: number; prev: number }>;
type Group = { name: string; codes: string[]; w: number; color: string };

export function sectorGroups(holdings: { code: string; qty: number }[], px: Px): { groups: Group[]; byValue: boolean } {
  const val = (h: { code: string; qty: number }) => h.qty * (px.get(h.code)?.close ?? 0);
  const byValue = holdings.reduce((a, h) => a + val(h), 0) > 0;
  const m = new Map<string, { codes: string[]; w: number }>();
  for (const h of holdings) {
    const s = uStock(h.code)?.sector || "기타";
    const cur = m.get(s) ?? { codes: [], w: 0 };
    cur.codes.push(h.code);
    cur.w += byValue ? val(h) : 1;
    m.set(s, cur);
  }
  const sorted = [...m.entries()].sort((a, b) => b[1].w - a[1].w);
  const top = sorted.length <= 5 ? sorted : sorted.slice(0, 4);
  const rest = sorted.length <= 5 ? [] : sorted.slice(4);
  const groups: Group[] = top.map(([name, x], i) => ({ name, codes: x.codes, w: x.w, color: COLORS[i] ?? OTHER }));
  if (rest.length) groups.push({ name: "그 외", codes: rest.flatMap((r) => r[1].codes), w: rest.reduce((a, r) => a + r[1].w, 0), color: OTHER });
  return { groups, byValue };
}

function Bar({ groups }: { groups: Group[] }) {
  return (
    <div className="m3-bar" aria-hidden>
      {groups.map((g) => <i key={g.name} style={{ flexGrow: g.w, background: g.color }} />)}
    </div>
  );
}

export function MineSectors({ holdings, px }: { holdings: { code: string; qty: number }[]; px: Px }) {
  const { groups, byValue } = sectorGroups(holdings, px);
  const total = groups.reduce((a, g) => a + g.w, 0) || 1;
  const share = (g: Group) => `${Math.round((g.w / total) * 100)}%`;
  const names = (codes: string[]) => {
    const ns = codes.map((c) => uStock(c)?.name ?? c);
    if (ns.length <= 2) return ns.join(" · ");
    const k = (ns[0] + ns[1]).length <= 12 ? 2 : 1;   // 이름이 길면 하나만(피그마: '한화에어로스페이스 외 2', 'KB금융 · 하이브 외 6')
    return `${ns.slice(0, k).join(" · ")} 외 ${ns.length - k}`;
  };
  return (
    <section className="m3-sec">
      <div className="m3-sech">
        <b>업종 비중</b>
        <Sheet className="m3-more" close="none" title="업종 비중" sub={byValue ? "입력한 수량 · 어제 종가 기준" : "어제 종가가 없어 종목 수 기준"} trigger={<>자세히 ›</>}>
          <Bar groups={groups} />
          <ul className="m3-slist">
            {groups.map((g) => (
              <li key={g.name}>
                <i style={{ background: g.color }} aria-hidden />
                <div className="l"><b>{g.name}</b><span>{names(g.codes)}</span></div>
                <div className="r"><b>{share(g)}</b>{byValue ? <span className="amt">{won(g.w)}</span> : <span>{g.codes.length}종목</span>}</div>
              </li>
            ))}
          </ul>
        </Sheet>
      </div>
      <Bar groups={groups} />
      <ul className="m3-legend">
        {groups.map((g) => <li key={g.name}><i style={{ background: g.color }} aria-hidden />{g.name}<b>{share(g)}</b></li>)}
      </ul>
    </section>
  );
}
