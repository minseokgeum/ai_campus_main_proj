// 홈 야간선물 카드와 흐름 창(배포용 새 기능 '야간선물 흐름 창', 피그마 843:1577 · 835:1433): 위 줄(제목 · 시간 · 등락률), 선 그래프(어제 종가 위 빨강·아래 파랑),
// 15분마다 나온 미국 기사 수 막대 48칸(가장 많은 칸만 진하게), 18:00 · 00:00 · 06:00. 카드를 누르면 아래에서 창이 올라온다.
import { Sheet } from "@/components/sheet";
import { ChartScrub } from "@/components/scrub";
import { FuturesHelp } from "@/components/helps";
import { NightChart, signColor } from "@/components/model";
import type { Night } from "@/lib/model";
import { pct } from "@/lib/format";

const hhmm = (k: number) => { const m = 18 * 60 + k * 15; return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

function Bars({ b, big }: { b: number[]; big?: boolean }) {
  const max = Math.max(1, ...b), top = b.indexOf(Math.max(...b));
  return (
    <div className={`fbars ${big ? "big" : ""}`} aria-hidden>
      {b.map((n, k) => <i key={k} className={k === top && n > 0 ? "top" : ""} style={{ height: `${Math.max(n ? 8 : 4, (n / max) * 100)}%` }} />)}
    </div>
  );
}

export function FuturesCard({ night, live, buckets }: { night: Night; live: boolean; buckets: number[] }) {
  const r = night.last ?? night.points[night.points.length - 1]?.r ?? 0;
  const top = buckets.indexOf(Math.max(...buckets)), total = buckets.reduce((a, x) => a + x, 0);
  const when = live ? "오늘 밤 18:00부터(진행 중)" : "어젯밤 18:00 ~ 06:00";
  return (
    <div className="futcard">
      {/* 카드 내용은 그냥 그리고, 카드 전체를 덮는 투명 단추가 창을 연다. 물음표는 그 단추 위에 떠서 제목 바로 옆에 붙는다(단추 안에 단추를 둘 수 없어서, 2026-11-22) */}
      <div className="futbody">
        <span className="fhd">
          <span className="nm"><b className="tq">코스피200 야간선물<FuturesHelp /></b><small>{when}</small></span>
          <span className="chg"><b style={{ color: signColor(r) }}>{pct(r * 100)}</b><small>어제 마감 대비</small></span>
          <em aria-hidden>›</em>
        </span>
        <NightChart night={night} h={64} />
        <span className="fcap"><span>미국 기사 수 · 15분마다</span>{total ? <span>가장 많을 때 {hhmm(top)}</span> : null}</span>
        <Bars b={buckets} />
        <span className="fax"><span>18:00</span><span>00:00</span><span>06:00</span></span>
      </div>
      <Sheet className="futtrig" title="코스피200 야간선물" sub={live ? "오늘 밤 18:00부터 · 진행 중" : "어젯밤 18:00 ~ 오늘 06:00"} trigger={<span className="sr">코스피200 야간선물 흐름 크게 보기</span>}>
        <p className="fbig"><b style={{ color: signColor(r) }}>{pct(r * 100)}</b><span>{(night.dayClose * (1 + r)).toFixed(2)}</span></p>
        <p className="fine">어제 주간 종가 {night.dayClose.toFixed(2)} 대비</p>
        {/* 위 그래프와 아래 기사 수 막대를 붙여 같은 시각이 세로로 맞게 두고, 시각 눈금은 둘이 함께 쓴다(비교 선이 글자를 가로지르지 않게, 2026-11-22) */}
        <ChartScrub points={night.points} dayClose={night.dayClose} buckets={buckets}>
          <div className="fut big"><NightChart night={night} h={180} detail /></div>
          <Bars b={buckets} big />
        </ChartScrub>
        <div className="axis scrubaxis"><span>18:00</span><span>21:00</span><span>00:00</span><span>03:00</span><span>06:00</span></div>
        <p className="fcap2">막대: 15분마다 나온 미국 기사 수{total ? ` · 가장 많을 때 ${Math.max(...buckets)}건` : ""}</p>
      </Sheet>
    </div>
  );
}
