// 내 종목 v2(피그마 보유 513:9980 · 관심 513:10329 · 보유 없음 541:7546). 계정별 보유·관심(DB), 평가금액·비중·어제 손익은 최근 종가(model.stock_daily).
import Link from "next/link";
import { BottomNav, Head } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { portfolio, uStock } from "@/lib/portfolio";
import { pct, swon, won } from "@/lib/format";
import { lastCloses } from "@/lib/prices";
import { signColor } from "@/components/model";
import { MaskToggle, Sheet } from "@/components/sheet";
import { dateLabel } from "@/lib/format";
import { isoDay } from "@/lib/model";
import { kstNow } from "@/lib/calendar";
import { appNow } from "@/lib/clock";

const SECTOR_COLORS = ["#008C82", "#6250D6", "#A8582F", "#2A9FD6"]; // 규칙표(331:1379 업종): 지도와 같이 비중 큰 4개까지 따로, 5번째부터 '그 외' #B8C0C3
const ICON = [["rgba(241,163,60,0.18)", "#b86e12"], ["rgba(139,111,214,0.18)", "#6a4fb8"], ["rgba(154,164,168,0.18)", "#5e6e72"]];

const SORTS = [["", "비중 큰 순"], ["pnl", "손익 큰 순"], ["chg", "등락률 큰 순"], ["name", "이름 순"]] as const;

export default async function Mine({ searchParams }: { searchParams: Promise<{ v?: string; o?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const pf = await portfolio(user.id);
  const view = sp.v === "watch" ? "watch" : "hold";
  // 업종별 비중(평가금액 기준, 종가가 없으면 종목 수 기준)
  const px = await lastCloses([...pf.holdings.map((h) => h.code), ...pf.watch]);
  const val = (h: { code: string; qty: number }) => h.qty * (px.get(h.code)?.close ?? 0);
  const totalValue = pf.holdings.reduce((a, h) => a + val(h), 0);
  const dayPnl = pf.holdings.reduce((a, h) => a + h.qty * ((px.get(h.code)?.close ?? 0) - (px.get(h.code)?.prev ?? 0)), 0);
  const byValue = totalValue > 0;
  const sectors = new Map<string, { names: string[]; w: number }>();
  for (const h of pf.holdings) {
    const s = uStock(h.code)?.sector || "기타";
    const cur = sectors.get(s) ?? { names: [], w: 0 };
    sectors.set(s, { names: [...cur.names, uStock(h.code)?.name ?? h.code], w: cur.w + (byValue ? val(h) : 1) });
  }
  const totalW = [...sectors.values()].reduce((a, x) => a + x.w, 0) || 1;
  const sorted = [...sectors.entries()].sort((a, b) => b[1].w - a[1].w);
  const top = sorted.slice(0, 4), rest = sorted.slice(4);
  const base = view === "hold" ? pf.holdings : pf.watch.map((code) => ({ code, qty: 0, avg: null as number | null }));
  const chgOf = (c: string) => { const p = px.get(c); return p && p.prev ? p.close / p.prev - 1 : 0; };
  const pnlOf = (h: { code: string; qty: number; avg: number | null }) => { const p = px.get(h.code); return h.avg && p ? h.qty * (p.close - h.avg) : 0; };
  const list = [...base].sort((a, b) => sp.o === "name" ? (uStock(a.code)?.name ?? "").localeCompare(uStock(b.code)?.name ?? "", "ko")
    : sp.o === "chg" ? Math.abs(chgOf(b.code)) - Math.abs(chgOf(a.code)) : sp.o === "pnl" ? pnlOf(b) - pnlOf(a)
      : view === "hold" ? val(b) - val(a) : (px.get(b.code)?.close ?? 0) - (px.get(a.code)?.close ?? 0));
  const bars = [...top, ...(rest.length ? [["그 외", { names: rest.flatMap((r) => r[1].names), w: rest.reduce((a, r) => a + r[1].w, 0) }]] as [string, { names: string[]; w: number }][] : [])];
  return (
    <>
      <Head title="내 종목" sub={`${dateLabel(isoDay(kstNow(await appNow()).ymd)).replace(/\((.)\)$/, "$1요일")} · 어제 종가 기준`} />
      <main className="scroll" style={{ gap: 14, paddingTop: 8 }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Link href="/mine/add" className="addlink">＋ 종목 추가</Link>
        </div>
        <section className="pcard">
          <div className="hrow"><b className="pt">업종별 투자 비중</b><span className="masklab"><MaskToggle /> 금액 숨기기</span></div>
          <p className="ptotal">{pf.holdings.length ? (byValue ? <span className="amt tot">{won(totalValue)}</span> : `보유 ${pf.holdings.length}종목`) : "보유 종목이 없어요"}</p>
          {byValue ? <p className="dayp">어제 <b style={{ color: signColor(dayPnl) }}>{dayPnl > 0 ? "▲" : dayPnl < 0 ? "▼" : ""} <span className="amt">{won(Math.abs(dayPnl))}</span> ({pct((dayPnl / (totalValue - dayPnl || 1)) * 100)})</b></p> : null}
          {pf.holdings.length ? <p className="fine">입력한 수량 기준</p> : null}
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
          <div className="seg" style={{ background: "rgba(255,255,255,0.6)" }}>
            <Link href="/mine" className={view === "hold" ? "on" : ""}>보유 {pf.holdings.length}</Link>
            <Link href="/mine?v=watch" className={view === "watch" ? "on" : ""}>관심 {pf.watch.length}</Link>
          </div>
        </section>

        {(view === "hold" ? pf.holdings.length : pf.watch.length) ? (
          <div className="lhead mlh">
            <Sheet className="linkish" title="정렬" close="none" trigger={<span>{(SORTS.find((s) => s[0] === (sp.o ?? "")) ?? SORTS[0])[1]} ▾</span>}>
              <div className="sortopts">{SORTS.map(([o, label]) => <Link key={o} href={`/mine?${new URLSearchParams({ ...(view === "watch" ? { v: "watch" } : {}), ...(o ? { o } : {}) })}`} className={(sp.o ?? "") === o ? "on" : ""}><span>{label}</span>{(sp.o ?? "") === o ? <em>✓</em> : null}</Link>)}</div>
            </Sheet>
          </div>
        ) : null}
        <section className="plist">
          {view === "hold" && pf.holdings.length === 0 ? (
            <div className="emptycard"><b>보유 종목이 없어요</b><p>보유 종목을 넣으면 매일 아침 내 계좌 예상과 종목 지도를 보여 줘요.</p>
              <Link href="/mine/add" className="primary">종목 추가하기</Link></div>
          ) : null}
          {view === "watch" && pf.watch.length === 0 ? <div className="emptycard"><b>관심 종목이 없어요</b><p>수량 없이 추가하면 관심 종목이 돼요.</p><Link href="/mine/add" className="primary">관심 종목 추가하기</Link></div> : null}
          {list.map((h, i) => {
            const st = uStock(h.code);
            const [bg, fg] = ICON[i % ICON.length];
            const p = px.get(h.code);
            const chg = p && p.prev ? p.close / p.prev - 1 : 0;
            const pnl = h.avg && p ? h.qty * (p.close - h.avg) : null;
            return (
              <Link key={h.code} href={`/mine/${h.code}`} className="prow">
                <span className="pic" style={{ background: bg, color: fg }}>{(st?.name ?? h.code).slice(0, 1)}</span>
                <div className="pname">
                  <b>{st?.name ?? h.code}</b>
                  <span>{view === "hold" ? `${h.qty.toLocaleString("ko-KR")}주${h.avg ? ` · 평단 ${won(h.avg)}` : ""}` : st?.sector}</span>
                </div>
                <div className="pval">
                  {view === "hold" && p ? <b className="amt">{won(h.qty * p.close)}</b> : p ? <b>{won(p.close)}</b> : <span className="fine">{st?.market}</span>}
                  {pnl != null ? <small style={{ color: signColor(pnl) }}><span className="amt">{swon(pnl)}</span> ({pct((p!.close / h.avg! - 1) * 100)})</small>
                    : p ? <small style={{ color: signColor(chg) }}>어제 {pct(chg * 100)}</small> : null}
                  {view === "hold" && byValue && p ? <small className="w">비중 {Math.round((h.qty * p.close / totalValue) * 100)}%</small> : null}
                </div>
              </Link>
            );
          })}
        </section>
      </main>
      <BottomNav active="mine" />
    </>
  );
}
