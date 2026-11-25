// 업종별 투자 비중 카드(피그마 내 종목 513:9980). 내 종목 탭과 홈 나눠 보기(지도와 넘겨 보기, 2026-11-24)에서 같이 쓴다.
// 평가금액 = 수량 × 최근 종가. 종가가 없으면 종목 수 기준. 비중 큰 4개 업종까지 따로, 5번째부터 '그 외'.
import { uStock } from "@/lib/portfolio";
import { pct, won } from "@/lib/format";
import { signColor } from "@/components/model";
import { MaskToggle } from "@/components/sheet";

const SECTOR_COLORS = ["#008C82", "#6250D6", "#A8582F", "#2A9FD6"]; // 규칙표(331:1379 업종): 지도와 같이 비중 큰 4개까지 따로, 5번째부터 '그 외' #B8C0C3

type Px = Map<string, { close: number; prev: number }>;

export function SectorShare({ holdings, px }: { holdings: { code: string; qty: number }[]; px: Px }) {
  const val = (h: { code: string; qty: number }) => h.qty * (px.get(h.code)?.close ?? 0);
  const totalValue = holdings.reduce((a, h) => a + val(h), 0);
  const dayPnl = holdings.reduce((a, h) => a + h.qty * ((px.get(h.code)?.close ?? 0) - (px.get(h.code)?.prev ?? 0)), 0);
  const byValue = totalValue > 0;
  const sectors = new Map<string, { names: string[]; w: number }>();
  for (const h of holdings) {
    const s = uStock(h.code)?.sector || "기타";
    const cur = sectors.get(s) ?? { names: [], w: 0 };
    sectors.set(s, { names: [...cur.names, uStock(h.code)?.name ?? h.code], w: cur.w + (byValue ? val(h) : 1) });
  }
  const totalW = [...sectors.values()].reduce((a, x) => a + x.w, 0) || 1;
  const sorted = [...sectors.entries()].sort((a, b) => b[1].w - a[1].w);
  const top = sorted.slice(0, 4), rest = sorted.slice(4);
  const bars = [...top, ...(rest.length ? [["그 외", { names: rest.flatMap((r) => r[1].names), w: rest.reduce((a, r) => a + r[1].w, 0) }]] as [string, { names: string[]; w: number }][] : [])];
  return (
    // 홈에서 지도 옆 장(2026-11-25 사용자 요청): 회색 카드 바탕 없이, 제목·설명 줄을 지도('오늘 아침 내 종목 지도')와 같은 모양으로
    <section className="sshare">
      <div className="hrow"><h3>업종별 투자 비중</h3><span className="masklab"><MaskToggle /> 금액 숨기기</span></div>
      {holdings.length ? <p className="fine">입력한 수량 · 어제 종가 기준</p> : null}
      <p className="ptotal">{holdings.length ? (byValue ? <span className="amt tot">{won(totalValue)}</span> : `보유 ${holdings.length}종목`) : "보유 종목이 없어요"}</p>
      {byValue ? <p className="dayp">어제 <b style={{ color: signColor(dayPnl) }}>{dayPnl > 0 ? "▲" : dayPnl < 0 ? "▼" : ""} <span className="amt">{won(Math.abs(dayPnl))}</span> ({pct((dayPnl / (totalValue - dayPnl || 1)) * 100)})</b></p> : null}
      {bars.map(([s, x], i) => {
        const share = Math.round((x.w / totalW) * 100);
        const color = s === "그 외" ? "#B8C0C3" : SECTOR_COLORS[i] ?? "#B8C0C3";
        return (
          <div key={s} className="srow">
            <div className="sline">
              <i style={{ background: color }} /><b>{s}</b><span className="names">{x.names.join(" · ")}</span>{byValue ? <span className="sv amt">{won(x.w)}</span> : null}<b>{share}%</b>
            </div>
            <div className="bar"><div style={{ width: `${share}%`, background: color }} /></div>
          </div>
        );
      })}
      {bars[0] && bars[0][0] !== "그 외" && bars[0][1].w / totalW >= 0.5 ? (
        <p className="conc"><span aria-hidden>ⓘ</span>{bars[0][0]} 업종이 {Math.round((bars[0][1].w / totalW) * 100)}%예요. 같이 움직이는 날에는 계좌 전체가 크게 흔들릴 수 있어요.</p>
      ) : null}
    </section>
  );
}
