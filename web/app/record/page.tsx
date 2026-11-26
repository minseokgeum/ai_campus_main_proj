// 모델 기록(2026-11-25 사용자 요청, 팀원 원래 버전 '기록' 탭 참고): 날마다 06:30에 낸 아침 예상이 9시 실제 시작가와 얼마나 맞았는지.
// 숫자는 전체 기간(기간별 나눠 보기는 2026-11-25 사용자 결정으로 뺌). 설계 200종목 · 나머지 755종목을 바꿔 본다(사용자 결정).
// 자료: lib/modelrecord.ts(서버가 매일 쌓는 종목별 확인을 그대로 모음).
import Link from "next/link";
import { BottomNav } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { groupSize, modelRecord, sumDays, type RecDay } from "@/lib/modelrecord";

export const dynamic = "force-dynamic";

const md = (t: string) => `${Number(t.slice(4, 6))}/${Number(t.slice(6))}`;
const ymd = (t: string) => `${t.slice(0, 4)}.${Number(t.slice(4, 6))}.${Number(t.slice(6))}`;
const rate = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "–");
const err = (sum: number, n: number) => (n ? `${((100 * sum) / n).toFixed(2)}%p` : "–");
const sgn = (v: number) => { const r = Math.round(v * 1000) / 10; return r === 0 ? "0.0%" : `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(1)}%`; };
const tone = (v: number) => (v > 0 ? "#d35d66" : v < 0 ? "#4c6fc3" : "var(--muted)");

export default async function RecordPage({ searchParams }: { searchParams: Promise<{ g?: string; all?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const group: 1 | 2 = sp.g === "2" ? 2 : 1;
  const days = await modelRecord(group);
  const tot = sumDays(days);
  const recent = [...days].reverse();
  const shown = sp.all === "1" ? recent : recent.slice(0, 20);
  const base = group === 2 ? "/record?g=2" : "/record";

  return (
    <>
      <main className="sheet mrec">
        <div className="shead"><Link href="/night" aria-label="뒤로">‹</Link><span className="ttl">모델 기록</span></div>
        <p className="mr-lead">날마다 06:30에 낸 아침 예상이 9시 실제 시작가와 얼마나 맞았는지 모았어요.</p>
        <nav className="seg w mr-seg" aria-label="종목 묶음">
          <Link href="/record" className={group === 1 ? "on" : ""}>설계 {groupSize(1)}종목</Link>
          <Link href="/record?g=2" className={group === 2 ? "on" : ""}>나머지 {groupSize(2)}종목</Link>
        </nav>
        <p className="fine">{group === 1 ? "팀원이 예상 규칙을 만들고 검증할 때 쓴 종목이에요(코스피 150 · 코스닥 50)." : "코스피 전체와 코스닥150 가운데 설계 종목 밖의 종목이에요. 규칙을 만들 때 쓰지 않았고, 같은 규칙을 그대로 적용했어요."}</p>

        {!tot.n ? <p className="quiet">확인 기록이 아직 없어요.</p> : (
          <>
            <section className="mr-top" aria-label="전체 기간 성적">
              <span className="mr-k">노란 띠(80% 예상 범위) 안에서 시작</span>
              <p className="mr-big"><b>{rate(tot.in80, tot.n)}</b><small>목표 80%</small></p>
              <p className="fine">{ymd(tot.from!)} ~ {ymd(tot.to!)} · {tot.days}거래일 · 예상 {tot.n.toLocaleString("ko-KR")}번</p>
              <div className="mr-kpis">
                <div><span>90% 범위 안에서 시작</span><b>{rate(tot.in90, tot.n)}</b><small>목표 90%</small></div>
                <div><span>예상과 실제 차이(평균)</span><b>{err(tot.eh, tot.n)}</b><small>야간 선물 그대로 {err(tot.ex, tot.n)} · 어제 종가 그대로 {err(tot.e0, tot.n)}</small></div>
                <div><span>08:11 2차 예상과 실제 차이</span><b>{err(tot.eg, tot.ng)}</b><small>개장 전 거래가 있던 {tot.ng.toLocaleString("ko-KR")}번</small></div>
                <div><span>믿을 정도 ‘높음’ 방향 일치</span><b>{rate(tot.hd, tot.hn)}</b><small>{tot.hn.toLocaleString("ko-KR")}번</small></div>
              </div>
            </section>

            <Bars days={days} />

            <section className="mr-sec">
              <h3>날짜별 <small>최근부터</small></h3>
              <table className="mr-tbl mr-days">
                <thead><tr><th>날짜</th><th>야간 선물</th><th>띠 안</th><th>예상 차이</th><th>2차 예상</th></tr></thead>
                <tbody>
                  {shown.map((d) => (
                    <tr key={d.t}>
                      <td><Link href={`/night?d=${d.t}`}>{md(d.t)}</Link></td>
                      <td style={{ color: tone(d.x) }}>{sgn(d.x)}</td>
                      <td className={d.in80 / d.n >= 0.8 ? "mr-hi" : "mr-lo"}>{rate(d.in80, d.n)}</td>
                      <td>{err(d.eh, d.n)}</td>
                      <td>{err(d.eg, d.ng)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {recent.length > 20 ? <Link className="mr-more" href={sp.all === "1" ? base : `${base}${group === 2 ? "&" : "?"}all=1`}>{sp.all === "1" ? "최근 20일만 보기" : `${recent.length}거래일 모두 보기`}</Link> : null}
              <p className="fine">날짜를 누르면 그날 아침 밤사이 화면으로 가요.</p>
            </section>

            <section className="mr-sec mr-how">
              <h3>이 기록을 읽는 법</h3>
              <dl>
                <dt>노란 띠 안에서 시작</dt><dd>실제 9시 시작가가 그날 06:30에 낸 노란 띠(80% 예상 범위) 안이었던 비율이에요. 10번 중 8번이 목표예요.</dd>
                <dt>예상과 실제 차이</dt><dd>06:30 예상 시작가와 실제 시작가의 차이(어제 종가 대비 %p)의 평균이에요. 작을수록 잘 맞았어요. ‘야간 선물 그대로’는 야간 선물 변화를 그대로 예상으로 썼을 때, ‘어제 종가 그대로’는 0%로 예상했을 때예요. 이 둘보다 작아야 모델이 도움이 된 거예요.</dd>
                <dt>08:11 2차 예상</dt><dd>08:10까지 개장 전 거래의 마지막 가격을 그대로 쓴 예상이에요(2026-11-25 팀원 기준). 개장 전 거래가 있던 종목만 세요.</dd>
                <dt>믿을 정도 ‘높음’ 방향 일치</dt><dd>믿을 정도가 ‘높음’이었던 종목에서, 개장 전 거래가 어제 종가보다 오른 쪽(내린 쪽)이었을 때 9시에도 같은 쪽으로 시작한 비율이에요.</dd>
                <dt>지난 날짜</dt><dd>서비스를 시작한 2026-11-20 전의 날은 같은 규칙으로, 그날 이전 자료만 써서 나중에 계산한 기록이에요.</dd>
              </dl>
            </section>
          </>
        )}
      </main>
      <BottomNav active="night" />
    </>
  );
}

/** 날짜별 '노란 띠 안에서 시작' 비율 막대와 80% 기준선 */
function Bars({ days }: { days: RecDay[] }) {
  const W = 342, H = 120, T = 8, B = 18, n = days.length, w = W / Math.max(1, n);
  const Y = (v: number) => T + (1 - v) * (H - T - B);
  return (
    <section className="mr-sec" aria-label="날짜별 노란 띠 안 비율">
      <h3>날짜별 노란 띠 안 비율</h3>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="mr-bars" role="img" aria-label={`${n}거래일 막대`}>
        {[1, 0.5].map((v) => <line key={v} x1={0} x2={W} y1={Y(v)} y2={Y(v)} stroke="#eef1f2" />)}
        {days.map((d, i) => {
          const v = d.in80 / d.n;
          return <rect key={d.t} x={i * w + (w > 3 ? 0.5 : 0)} y={Y(v)} width={Math.max(0.8, w - (w > 3 ? 1 : 0.2))} height={Math.max(1, Y(0) - Y(v))} fill={v >= 0.8 ? "#7cc4b8" : "#f0b48a"} />;
        })}
        <line x1={0} x2={W} y1={Y(0.8)} y2={Y(0.8)} stroke="#192d31" strokeWidth={1} strokeDasharray="3 3" />
        <text x={2} y={Y(0.8) - 3} fontSize={9} fill="#45555a">목표 80%</text>
        <text x={0} y={H - 4} fontSize={9} fill="#66777a">{n ? md(days[0].t) : ""}</text>
        <text x={W} y={H - 4} textAnchor="end" fontSize={9} fill="#66777a">{n ? md(days[n - 1].t) : ""}</text>
      </svg>
      <p className="fine"><i className="mr-sw ok" />80% 이상인 날 {days.filter((d) => d.in80 / d.n >= 0.8).length}일 · <i className="mr-sw lo" />80% 미만인 날 {days.filter((d) => d.in80 / d.n < 0.8).length}일</p>
    </section>
  );
}
