// 코스피200 야간선물 상세(피그마 363:2): 18:00 ~ 06:00 1분봉 흐름, 최고·최저, 마감.
import Link from "next/link";
import { ChartScrub } from "@/components/scrub";
import { NightChart, signColor } from "@/components/model";
import { FuturesHelp } from "@/components/helps";
import { requireUser } from "@/lib/auth";
import { dayModel, modelDates } from "@/lib/model";
import { P } from "@/lib/night";
import { pct } from "@/lib/format";

export const dynamic = "force-dynamic";


export default async function Futures({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const dates = await modelDates();
  const t = sp.d && dates.includes(sp.d) ? sp.d : dates[0];
  const m = t ? await dayModel(t) : null;
  const n = m?.night;
  const pts = n?.points ?? [];
  const hi = pts.reduce((a, p) => (p.r > a.r ? p : a), pts[0] ?? { m: 0, r: 0 });
  const lo = pts.reduce((a, p) => (p.r < a.r ? p : a), pts[0] ?? { m: 0, r: 0 });
  const lvl = (r: number) => (n ? (n.dayClose * (1 + r)).toFixed(2) : "—");
  return (
    <>
      <main className="sheet">
        <div className="shead"><Link href={sp.d ? `/night?d=${sp.d}` : "/night"} aria-label="닫기">‹</Link><span className="ttl tq">코스피200 야간선물<FuturesHelp /></span></div>
        {!n ? <p className="quiet">야간선물 자료가 아직 없어요.</p> : (
          <>
            <p className="slabel">야간 거래 마감 · {m ? `${Number(m.t.slice(4, 6))}.${Number(m.t.slice(6))}` : ""} 06:00</p>
            <p className="usbig">{lvl(n.last ?? 0)}</p>
            <p className="uschg" style={{ color: signColor(n.last ?? 0) }}>{(n.last ?? 0) >= 0 ? "▲" : "▼"} {Math.abs(n.dayClose * (n.last ?? 0)).toFixed(2)} ({pct(P(n.last ?? 0))}) <span>어제 마감 {n.dayClose.toFixed(2)}</span></p>
            <ChartScrub points={n.points} dayClose={n.dayClose}><div className="fut big"><NightChart night={n} h={180} detail /></div></ChartScrub>
            <div className="axis scrubaxis"><span>18:00</span><span>00:00</span><span>06:00 마감</span></div>
            <p className="fine">ⓘ 어제 마감보다 위는 빨강, 아래는 파랑으로 칠했어요</p>
            <div className="ohlc">
              <span>시작가</span><b>{lvl(pts[0]?.r ?? 0)}</b><span>어제 마감</span><b>{n.dayClose.toFixed(2)}</b>
              <span>고가</span><b style={{ color: signColor(hi.r) }}>{lvl(hi.r)}</b><span>저가</span><b style={{ color: signColor(lo.r) }}>{lvl(lo.r)}</b>
            </div>
            <div className="flegend"><span><i className="u" />어제 마감보다 높음</span><span><i className="d" />어제 마감보다 낮음</span></div>
            <p className="fine">야간 거래는 어제 18:00부터 오늘 06:00까지 열려요. 오늘 정규장은 09:00에 시작하고, 실제 시초가와는 차이가 날 수 있어요. 06:00 마감 변화가 예상 시가 계산의 입력이에요.</p>
          </>
        )}
      </main>
    </>
  );
}
