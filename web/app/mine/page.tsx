// 내 종목 v3(피그마 배포용 보유 1108:1839 · 관심 1108:1985 · 보유/관심 고르기 메뉴 1108:2164 · 업종 비중 창 1108:2233, 변경 기록 41, 2026-11-25).
// 카드 없는 흰 바탕. 위에서부터 큰 제목(누르면 보유/관심 고르기) → 총 평가금액 → 업종 비중 → 종목 목록. 관심은 총액·업종 없이 목록만.
// 계정별 보유·관심(DB), 평가금액·어제 등락은 최근 종가(model.stock_daily), 종목 줄의 '소식 n'은 밤사이 브리핑에서 그 종목에 이어진 기사 수(밤사이 탭과 같은 규칙).
import Link from "next/link";
import { BottomNav } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { portfolio, uStock } from "@/lib/portfolio";
import { pct, won } from "@/lib/format";
import { lastCloses } from "@/lib/prices";
import { MineSectors } from "@/components/minesectors";
import { signColor } from "@/components/model";
import { MaskToggle, Sheet } from "@/components/sheet";
import { dateLabel } from "@/lib/format";
import { isoDay } from "@/lib/model";
import { kstNow } from "@/lib/calendar";
import { appNow } from "@/lib/clock";
import { byStock, nightNews } from "@/lib/news";

const SORTS_HOLD = [["", "비중 큰 순"], ["pnl", "손익 큰 순"], ["chg", "등락률 큰 순"], ["name", "이름 순"]] as const;
const SORTS_WATCH = [["", "추가한 순"], ["chg", "등락률 큰 순"], ["name", "이름 순"]] as const;

const Chevron = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden><path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export default async function Mine({ searchParams }: { searchParams: Promise<{ v?: string; o?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const pf = await portfolio(user.id);
  const view = sp.v === "watch" ? "watch" : "hold";
  const px = await lastCloses([...pf.holdings.map((h) => h.code), ...pf.watch]);
  const news = await nightNews().then(({ articles }) => byStock(articles, [...pf.holdings.map((h) => h.code), ...pf.watch])).catch(() => new Map());
  const val = (h: { code: string; qty: number }) => h.qty * (px.get(h.code)?.close ?? 0);
  const totalValue = pf.holdings.reduce((a, h) => a + val(h), 0);
  const dayPnl = pf.holdings.reduce((a, h) => { const p = px.get(h.code); return a + (p && p.prev ? h.qty * (p.close - p.prev) : 0); }, 0);
  const chgOf = (c: string) => { const p = px.get(c); return p && p.prev ? p.close / p.prev - 1 : 0; };
  const pnlOf = (h: { code: string; qty: number; avg: number | null }) => { const p = px.get(h.code); return h.avg && p ? h.qty * (p.close - h.avg) : 0; };
  const base = view === "hold" ? pf.holdings : pf.watch.map((code) => ({ code, qty: 0, avg: null as number | null }));
  const sorts = view === "hold" ? SORTS_HOLD : SORTS_WATCH;
  const o = sorts.some((s) => s[0] === sp.o) ? sp.o ?? "" : "";
  const list = o === "" && view === "watch" ? base   // 추가한 순(app.watch added_at)
    : [...base].sort((a, b) => o === "name" ? (uStock(a.code)?.name ?? "").localeCompare(uStock(b.code)?.name ?? "", "ko")
      : o === "chg" ? Math.abs(chgOf(b.code)) - Math.abs(chgOf(a.code)) : o === "pnl" ? pnlOf(b) - pnlOf(a) : val(b) - val(a));
  const n = view === "hold" ? pf.holdings.length : pf.watch.length;
  const sortHref = (k: string) => `/mine?${new URLSearchParams({ ...(view === "watch" ? { v: "watch" } : {}), ...(k ? { o: k } : {}) })}`;
  return (
    <>
      <header className="m3-head">
        <div className="row">
          <h1>내 종목</h1>
          <div className="r">
            <Link href="/mine/add" aria-label="종목 추가">
              <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden><path d="M11 2V20M2 11H20" stroke="#008C82" strokeWidth="2" strokeLinecap="round" /></svg>
            </Link>
            <Link href="/my" aria-label="마이">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden><path d="M11 2C13.2 2 15 3.8 15 6C15 8.2 13.2 10 11 10C8.8 10 7 8.2 7 6C7 3.8 8.8 2 11 2Z" stroke="#192D31" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 16.75C4 11.75 18 11.75 19 16.75" stroke="#192D31" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Link>
          </div>
        </div>
        {/* 보유/관심: 제목 아래 큰 글자 탭(피그마 배포용 변경 기록 48, 2026-11-25 사용자 결정 · 숫자는 빼기). 예전 '보유 종목 ⌄' 메뉴 대신 */}
        <nav className="ntabs" aria-label="보유·관심">
          <Link href="/mine" className={view === "hold" ? "on" : ""} aria-current={view === "hold" ? "page" : undefined}>보유</Link>
          <Link href="/mine?v=watch" className={view === "watch" ? "on" : ""} aria-current={view === "watch" ? "page" : undefined}>관심</Link>
        </nav>
        <p className="sub">{dateLabel(isoDay(kstNow(await appNow()).ymd)).replace(/\((.)\)$/, "$1요일")} · 어제 종가 기준</p>
      </header>
      <main className="scroll m3">
        {view === "hold" && pf.holdings.length ? (
          <>
            <section className="m3-total">
              <div className="h"><span>총 평가금액</span><MaskToggle /></div>
              <p className="v"><span className="amt tot">{won(totalValue)}</span></p>
              {totalValue > 0 ? (
                <p className="d" style={{ color: signColor(dayPnl) }}>어제보다 {dayPnl > 0 ? "▲ " : dayPnl < 0 ? "▼ " : ""}<span className="amt">{won(Math.abs(dayPnl))}</span> ({pct((dayPnl / (totalValue - dayPnl || 1)) * 100)})</p>
              ) : null}
            </section>
            <MineSectors holdings={pf.holdings} px={px} />
          </>
        ) : null}

        {n ? (
          <div className="m3-lh">
            <b>종목 {n}</b>
            <Sheet className="m3-sort" title="정렬" close="none" trigger={<>{(sorts.find((s) => s[0] === o) ?? sorts[0])[1]}<Chevron /></>}>
              <div className="sortopts">{sorts.map(([k, label]) => <Link key={k} href={sortHref(k)} className={o === k ? "on" : ""}><span>{label}</span>{o === k ? <em>✓</em> : null}</Link>)}</div>
            </Sheet>
          </div>
        ) : (
          <div className="m3-empty">
            <b>{view === "hold" ? "보유 종목이 없어요" : "관심 종목이 없어요"}</b>
            <p>{view === "hold" ? "보유 종목을 넣으면 매일 아침 내 계좌 예상과 밤사이 소식을 보여 줘요." : "수량 없이 추가하면 관심 종목이 돼요."}</p>
            <Link href="/mine/add" className="primary">{view === "hold" ? "종목 추가하기" : "관심 종목 추가하기"}</Link>
          </div>
        )}

        <section className="m3-list">
          {list.map((h) => {
            const st = uStock(h.code);
            const p = px.get(h.code);
            const chg = chgOf(h.code);
            const nNews = news.get(h.code)?.length ?? 0;
            return (
              <Link key={h.code} href={`/mine/${h.code}`} className="m3-row">
                <span className="ic">{(st?.name ?? h.code).slice(0, 1)}</span>
                <div className="body">
                  <div className="l">
                    <b>{st?.name ?? h.code}</b>
                    <span>{view === "hold" ? `${h.qty.toLocaleString("ko-KR")}주` : st?.sector}
                      {nNews ? <><i className="sep">·</i><em className="news">소식 {nNews}</em></> : null}</span>
                  </div>
                  <div className="pval r">
                    {p ? (view === "hold" ? <b className="amt">{won(h.qty * p.close)}</b> : <b>{won(p.close)}</b>) : <b className="muted">—</b>}
                    {p && p.prev ? <small style={{ color: signColor(chg) }}>{pct(chg * 100)}</small> : null}
                  </div>
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
