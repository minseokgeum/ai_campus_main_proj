// 미국시장 지표 상세(피그마 230:181 다우 · 230:467 S&P 500 · 230:753 나스닥 · 230:1039 환율): 홈의 칩을 누르면 그 지표가 맨 위로.
import Link from "next/link";
import { UsChart } from "@/components/uschart";
import { signColor } from "@/components/model";
import { requireUser } from "@/lib/auth";
import { md, US, usIntraday, usLatest } from "@/lib/market";

export const dynamic = "force-dynamic";

export default async function UsPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const latest = await usLatest();
  const order = [...US].sort((a, b) => (a.sym === sp.s ? -1 : b.sym === sp.s ? 1 : 0));
  const data = await Promise.all(order.map(async (u) => ({ u, d: latest.get(u.sym), pts: latest.get(u.sym) ? await usIntraday(u.sym, latest.get(u.sym)!.usDate) : [] })));
  return (
    <>
      <main className="sheet">
        <div className="shead"><Link href="/" aria-label="뒤로">‹</Link><span className="ttl">미국시장 지표</span></div>
        <p className="fine">ⓘ 차트를 누를 때마다 시점이 옮겨가며 값이 보여요</p>
        {data.map(({ u, d, pts }) => {
          const fx = u.sym === "KRW=X";
          const dg = fx ? 2 : 2;
          const f = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: dg, maximumFractionDigits: dg });
          return (
            <section key={u.sym} id={u.sym} className="ussec">
              <h2>{u.name}</h2>
              {!d ? <p className="fine">자료 준비 중이에요.</p> : (
                <>
                  <p className="fine">{fx ? "외환 · " : "정규장 마감 · "}{md(d.usDate)} 16:00 (미 동부)</p>
                  <p className="usbig">{f(d.close)}</p>
                  <p className="uschg" style={{ color: signColor(d.chg) }}>{d.chg >= 0 ? "▲" : "▼"} {f(Math.abs(d.close - d.prev))} ({d.chg >= 0 ? "+" : "−"}{Math.abs(d.chg * 100).toFixed(2)}%) <span>전일 {f(d.prev)}</span></p>
                  <UsChart points={pts} prev={d.prev} digits={dg} />
                  <div className="ohlc">
                    <span>시가</span><b>{f(d.open)}</b><span>전일 종가</span><b>{f(d.prev)}</b>
                    <span>고가</span><b style={{ color: "#d35d66" }}>{f(d.high)}</b><span>저가</span><b style={{ color: "#4c6fc3" }}>{f(d.low)}</b>
                  </div>
                </>
              )}
            </section>
          );
        })}
        <p className="fine">자료: Yahoo Finance(yfinance). 정규장 5분봉 기준이며 실시간 시세가 아니에요.</p>
      </main>
    </>
  );
}
