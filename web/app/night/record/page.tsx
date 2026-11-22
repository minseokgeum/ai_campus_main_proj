// 밤사이 · 기록(피그마 밤사이 v4 기록 379:3029): 지난 20거래일 내 보유 종목이 예상 범위 안에서 열린 비율, 날짜 칸(모두 안 · 일부 벗어남 · 함께 벗어남),
// 종목별 20일 기록(노란 막대 = 그날 80% 범위, 가로줄 = 예상, 동그라미 = 실제 시가).
import Link from "next/link";
import { BottomNav } from "@/components/ui";
import { HScroll } from "@/components/hscroll";
import { NightHead } from "@/components/nighthead";
import { requireUser } from "@/lib/auth";
import { portfolio, uStock } from "@/lib/portfolio";
import { recordData } from "@/lib/model";
import { pct } from "@/lib/format";

export const dynamic = "force-dynamic";

const md = (t: string) => `${Number(t.slice(4, 6))}/${Number(t.slice(6))}`;

export default async function Record({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const pf = await portfolio(user.id);
  const codes = pf.holdings.map((h) => h.code);
  const { dates, cells } = await recordData(codes, 20);
  const days = dates.map((t) => {
    const m = cells.get(t);
    const scored = m ? [...m.entries()].filter(([, c]) => c.in80 != null) : [];
    const out = scored.filter(([, c]) => !c.in80);
    return { t, n: scored.length, out: out.map(([code]) => code), kind: !scored.length ? "none" : out.length === 0 ? "ok" : out.length <= 2 ? "one" : "many" };
  });
  const scoredAll = days.flatMap((d) => (d.n ? [d] : []));
  const inN = scoredAll.reduce((a, d) => a + d.n - d.out.length, 0), totN = scoredAll.reduce((a, d) => a + d.n, 0);
  const share = totN ? Math.round((inN / totN) * 100) : null;
  const cnt = { ok: days.filter((d) => d.kind === "ok").length, one: days.filter((d) => d.kind === "one").length, many: days.filter((d) => d.kind === "many").length };
  const manyDays = days.filter((d) => d.kind === "many");
  const sectorOut = new Map<string, number>();
  for (const d of manyDays) for (const c of d.out) { const s = uStock(c)?.sector ?? "기타"; sectorOut.set(s, (sectorOut.get(s) ?? 0) + 1); }
  const topSec = [...sectorOut.entries()].sort((a, b) => b[1] - a[1])[0];
  const pick = sp.c && codes.includes(sp.c) ? sp.c : codes[0];
  const series = pick ? dates.map((t) => ({ t, c: cells.get(t)?.get(pick) ?? null })) : [];
  const pIn = series.filter((x) => x.c?.in80).length, pN = series.filter((x) => x.c?.in80 != null).length;
  // 종목 차트 축
  const vals = series.flatMap((x) => (x.c ? [x.c.l80, x.c.u80, x.c.y ?? 0] : []));
  const M = Math.max(0.02, ...vals.map(Math.abs)) * 1.15;
  const W = 342, H = 170, X = (i: number) => 18 + (i + 0.5) * ((W - 50) / Math.max(1, series.length)), Y = (v: number) => 8 + (1 - (v + M) / (2 * M)) * (H - 16);

  return (
    <>
      <NightHead tab="rec" />
      <main className="scroll nt">
        <section className="acct rec">
          <div className="at"><span><b>지난 {dates.length}거래일 기록</b></span><Link href="/saved" className="linkish teal">전체 기록 ›</Link></div>
          {share == null ? <p className="wb">채점 기록이 쌓이면 보여 줘요. 거래일 09:05마다 하루씩 쌓여요.</p> : (
            <>
              <div className="big"><span style={{ color: "var(--ink)" }}>{share}%</span><small style={{ color: "var(--muted)", fontWeight: 400 }}>예상 범위 안에 들어온 비율 · 목표 80%</small></div>
              <div className="rgrid">{days.map((d) => <Link key={d.t} href={`/saved?d=${d.t}`} className={d.kind} title={`${md(d.t)} ${d.n ? `${d.n - d.out.length}/${d.n} 범위 안` : "채점 전"}`} />)}</div>
              <div className="legend"><span><i className="ok" />모두 안 {cnt.ok}일</span><span><i className="one" />일부 벗어남 {cnt.one}일</span><span><i className="many" />함께 벗어남 {cnt.many}일</span></div>
              {manyDays.length && topSec ? <p className="rnote">여러 종목이 함께 벗어난 날이 {manyDays.length}일 있었어요. 같은 재료로 묶인 종목({topSec[0]} {topSec[1]}종목)이 한꺼번에 움직였을 가능성이 커요.</p>
                : <p className="rnote">함께 벗어난 날은 없었어요. 벗어난 날은 종목 하나씩 따로 움직였어요.</p>}
            </>
          )}
        </section>

        <div className="lhead"><b>종목별 보기</b><span className="fine">종목을 고르면 그 종목의 {dates.length}일 기록</span></div>
        {codes.length ? (
          <>
            <HScroll className="chipsx">{codes.map((c) => <Link key={c} href={`/night/record?c=${c}`} className={c === pick ? "on" : ""}>{uStock(c)?.name ?? c}</Link>)}</HScroll>
            {pick ? (
              <section className="pcard">
                <b className="pt">지난 {dates.length}거래일 · {uStock(pick)?.name ?? pick}</b>
                <p className="fine">범위 안에서 열린 날 <b>{pIn}/{pN}일</b> · 노란 막대가 그날 범위, 가로줄이 예상, 동그라미가 실제 시가예요.</p>
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="rchart" role="img" aria-label={`${uStock(pick)?.name} ${dates.length}일 기록`}>
                  {[-M / 1.15, 0, M / 1.15].map((v) => <g key={v}><line x1={10} x2={W - 40} y1={Y(v)} y2={Y(v)} stroke="#eef1f2" /><text x={W - 36} y={Y(v) + 3} fontSize={9} fill="#66777a">{pct(v * 100).replace(/(\.\d)\d%/, "$1%")}</text></g>)}
                  {series.map((x, i) => x.c ? (
                    <g key={x.t}>
                      <rect x={X(i) - 4} y={Y(x.c.u80)} width={8} height={Math.max(2, Y(x.c.l80) - Y(x.c.u80))} rx={3} fill="#FFD970" />
                      <line x1={X(i) - 6} x2={X(i) + 6} y1={Y(x.c.h)} y2={Y(x.c.h)} stroke="#192d31" strokeWidth={1.4} />
                      {x.c.y != null ? <circle cx={X(i)} cy={Y(x.c.y)} r={4} fill={x.c.in80 ? "#3fae8c" : "#d35d66"} stroke="#fff" strokeWidth={1} /> : null}
                    </g>
                  ) : null)}
                </svg>
                <div className="axis"><span>{dates[0] ? md(dates[0]) : ""}</span><span>{dates.length ? md(dates[dates.length - 1]) : ""}</span></div>
              </section>
            ) : null}
          </>
        ) : <p className="state">보유 종목을 넣으면 종목별 기록을 보여 줘요.</p>}
      </main>
      <BottomNav active="night" />
    </>
  );
}
