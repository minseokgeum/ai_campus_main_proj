// 오늘 아침 내 종목 지도 카드. 홈 나눠 보기와 내 종목 탭(업종별 투자 비중과 넘겨 보기, 2026-11-24)에서 같이 쓴다.
// 오늘 예상이 나왔으면 예상 시가 색 지도, 그 전(07:30 전·주말·휴장일·지연)엔 보유 금액 크기만 있는 지도('07:30 공개'·'쉬는 날'·'준비 중').
import Link from "next/link";
import { Sheet } from "@/components/sheet";
import { MapLegend, TreeMap, type MapStock } from "@/components/treemap";
import { uStock } from "@/lib/portfolio";
import { dayModel, isoDay } from "@/lib/model";
import { buildRows, type Row } from "@/lib/night";
import { byStock, nightNews } from "@/lib/news";
import { kstNow } from "@/lib/calendar";
import { appNow } from "@/lib/clock";
import { isClosedDay, marketDay, nextOpenDay } from "@/lib/marketdays";
import { dateLabel } from "@/lib/format";

export type MapInfo = { stocks: MapStock[]; sub: string; idle?: string };
type Px = Map<string, { close: number }>;

/** 홈에서 이미 계산한 값으로 지도 내용을 만든다. 보여 줄 칸이 없으면 null */
export function mapInfo(p: { today: string; fresh: boolean; off: boolean; delayed: boolean; slot0811: boolean; preRows: Row[];
  holdings: { code: string; qty: number }[]; px: Px; news: Map<string, unknown[]> }): MapInfo | null {
  if (p.fresh) {
    if (!p.preRows.some((r) => r.value)) return null;
    return {
      sub: `${p.slot0811 ? "08:11" : "07:30"} 기준 · 장 전 · 오늘 예상 시가`,
      stocks: p.preRows.map((r) => ({
        code: r.code, name: r.name, sector: r.sector, value: r.value ?? r.qty * (p.px.get(r.code)?.close ?? 0),
        pct: r.kind === "notservice" || r.kind === "nocalc" ? null : r.pct, grade: r.s?.grade ?? null,
        l80: r.s?.l80 ?? null, u80: r.s?.u80 ?? null, news: p.news.get(r.code)?.length ?? 0 })),
    };
  }
  const stocks = p.holdings.map((h) => { const u = uStock(h.code); return { code: h.code, name: u?.name ?? h.code, sector: u?.sector ?? "기타", value: h.qty * (p.px.get(h.code)?.close ?? 0), pct: null, grade: null, l80: null, u80: null, news: p.news.get(h.code)?.length ?? 0 }; });
  if (!p.holdings.length || !stocks.some((s) => s.value > 0)) return null;
  return {
    stocks, idle: p.off ? "쉬는 날" : p.delayed ? "준비 중" : "07:30 공개",
    sub: `보유 비중 · ${p.off ? `다음 예상 ${dateLabel(isoDay(nextOpenDay(p.today)))} 07:30` : p.delayed ? "오늘 예상은 준비되면 채워져요" : "오늘 예상은 07:30에 채워져요"}`,
  };
}

/** 내 종목 탭처럼 홈 밖에서 쓸 때: 홈과 같은 규칙으로 아침 예상·밤사이 기사 수를 읽어 지도 내용을 만든다 */
export async function loadMapInfo(holdings: { code: string; qty: number }[], px: Px): Promise<MapInfo | null> {
  if (!holdings.length) return null;
  const now = kstNow(await appNow());
  const today = now.ymd;
  const before0730 = now.hour < 7 || (now.hour === 7 && now.minute < 30);
  const [m, { articles }] = await Promise.all([dayModel().catch(() => null), nightNews()]);
  const fresh = m?.t === today && !before0730 && m.card?.status === "ok";
  return mapInfo({
    today, fresh,
    off: isClosedDay(today) || m?.card?.status === "holiday",
    delayed: !before0730 && !isClosedDay(today) && m?.t !== today,
    slot0811: m?.card?.slot === "0811" && (marketDay(today)?.premarket ?? true),
    preRows: m?.card?.status === "ok" ? buildRows(m, holdings, "pre") : [],
    holdings, px, news: byStock(articles, holdings.map((h) => h.code)),
  });
}

export function MapCard({ info }: { info: MapInfo }) {
  return (
    <section className="mapsec">
      <div className="hrow"><h3 className="tq">오늘 아침 내 종목 지도<MapHelp /></h3><Link href="/night" className="linkish teal">밤사이 자세히 ›</Link></div>
      <p className="fine">{info.sub}</p>
      <TreeMap stocks={info.stocks} idle={info.idle} />
      <MapLegend idle={!!info.idle} />
    </section>
  );
}

function MapHelp() {
  return (
    <Sheet className="qmark" title="오늘 아침 내 종목 지도" confirm="확인" trigger={<span aria-label="지도 설명">?</span>}>
      <div className="help">
        <b>어떻게 읽나요?</b><p>업종별로 내 종목을 모았어요. 칸이 클수록 보유 금액이 커요.</p>
        <b>색</b><p>예상 시가가 어제 종가보다 위면 빨강, 아래면 파랑이에요. 진할수록 많이 움직일 것으로 예상해요(±10%까지).</p>
        <b>흐린 칸</b><p>믿을 정도가 낮아서 방향이 불확실한 종목이에요.</p>
        <b>소식</b><p>밤사이 그 종목과 관련된 미국 기사 수예요.</p>
      </div>
    </Sheet>
  );
}
