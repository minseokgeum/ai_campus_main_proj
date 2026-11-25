// 보관(피그마 날짜 이동 270:487, 날짜별 297:491 모두 범위 안 · 297:659 2종목 이상 · 297:829 오늘 채점 전 · 297:998 주말 · 297:1173 기록 없음,
// 달력 창 287:491). 지난 아침 카드와 그날 AI 아침 정리, 내 보유 종목 채점.
import Link from "next/link";
import { BottomNav, Head } from "@/components/ui";
import { signColor } from "@/components/model";
import { CalendarSheet } from "@/components/calendar";
import { requireUser } from "@/lib/auth";
import { portfolio } from "@/lib/portfolio";
import { dayModel, isoDay, modelDates, myChecks } from "@/lib/model";
import { buildRows, P } from "@/lib/night";
import { aiBrief } from "@/lib/summary";
import { addDays, isWeekend, kstNow, weekday } from "@/lib/calendar";
import { closedDays, closedName, marketDay } from "@/lib/marketdays";
import { dateLabel, pct } from "@/lib/format";
import { appNow } from "@/lib/clock";

export const dynamic = "force-dynamic";

const wd = (t: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", weekday: "short" }).format(new Date(`${isoDay(t)}T12:00:00+09:00`));

export default async function Saved({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const [pf, dates] = await Promise.all([portfolio(user.id), modelDates(120)]);
  const codes = pf.holdings.map((h) => h.code);
  const today = kstNow(await appNow()).ymd;
  const t = sp.d && /^\d{8}$/.test(sp.d) ? sp.d : dates[0];
  const has = t ? dates.includes(t) : false;
  const i = t ? dates.indexOf(t) : -1;
  // 위 날짜 줄: 고른 날이 든 주의 월~금 5칸(피그마 270:487). 주말을 고르면 그 주 월~금
  const mon = t ? addDays(t, weekday(t) === 0 ? -6 : 1 - weekday(t)) : today;
  const strip = [0, 1, 2, 3, 4].map((k) => addDays(mon, k));
  const checks = await myChecks(dates, codes);
  const mark = (d: string) => {
    const c = checks.get(d);
    if (!c?.length) return undefined;
    // 점 색은 그날 채점한 종목 중 예상 범위 안에 든 비율로(2026-11-22: 예전엔 벗어난 종목 수 0·1·2개 이상이라 보유 종목이 많을수록 주황이 잦았음).
    // 노란 띠가 10번 중 8번을 담는 범위라 80% 이상이면 예상대로, 60% 미만이면 주황
    const r = c.filter((x) => x.in80).length / c.length;
    return r >= 0.8 ? "ok" : r >= 0.6 ? "one" : "many";
  };
  const marks = Object.fromEntries(dates.map((d) => [d, mark(d)]).filter(([, v]) => v)) as Record<string, "ok" | "one" | "many">;
  const m = has ? await dayModel(t!) : null;
  const ai = has ? await aiBrief(isoDay(t!)) : null;
  const rows = m ? buildRows(m, pf.holdings.map((h) => ({ code: h.code, qty: h.qty })), "post").filter((r) => r.s && r.c) : [];
  const inN = rows.filter((r) => r.c!.in80).length;
  // ‹ ›는 하루씩(주말은 건너뜀). 기록 없는 날은 '기록 없음' 화면(피그마 297:1173)
  const step = (d: string, n: number) => { let x = addDays(d, n); while (isWeekend(x)) x = addDays(x, n); return x; };
  const prev = t ? step(t, -1) : undefined;
  const nx = t ? step(t, 1) : undefined, next = nx && nx <= today ? nx : undefined;
  const near = t ? (dates.find((d) => d <= t) ?? dates[dates.length - 1]) : undefined;   // 가장 가까운 지난 거래일 기록
  const r1 = (v: number) => { const x = Math.round(v * 1000) / 10; return `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(1)}`; };

  return (
    <>
      <Head title="보관" sub="지난 아침 정리와 그날의 채점 기록" />
      <main className="scroll">
        {!dates.length ? <p className="state">아직 저장된 아침 기록이 없어요. 거래일 아침마다 카드와 채점이 여기에 쌓여요.</p> : (
          <>
            <div className="ndate">
              <div className="nav2">
                {prev ? <Link href={`/saved?d=${prev}`} aria-label="이전 날짜">‹</Link> : <span className="off">‹</span>}
                <b>{t ? dateLabel(isoDay(t)) : ""}</b>
                {next ? <Link href={`/saved?d=${next}`} aria-label="다음 날짜">›</Link> : <span className="off">›</span>}
              </div>
              <CalendarSheet selected={t ?? dates[0]} today={today} marks={marks} records={dates} closed={closedDays()} />
            </div>
            <div className="dstrip">
              {strip.map((d) => d <= today ? (
                <Link key={d} href={`/saved?d=${d}`} className={d === t ? "on" : ""}>
                  <span>{wd(d)}</span><b>{Number(d.slice(6))}</b><i className={mark(d) ?? "none"} />
                </Link>
              ) : <span key={d} className="off"><span>{wd(d)}</span><b>{Number(d.slice(6))}</b><i className="none" /></span>)}
            </div>
            <div className="legend"><span><i className="ok" />80% 이상 범위 안</span><span><i className="one" />60~80%</span><span><i className="many" />60% 미만</span></div>

            {!has ? (
              <section className="pcard noday">
                <span className="moon" aria-hidden>{t && (isWeekend(t) || closedName(t)) ? "☾" : "–"}</span>
                <b>{t && (isWeekend(t) || closedName(t)) ? "이날은 장이 열리지 않았어요" : "이날은 기록이 없어요"}</b>
                {t && closedName(t) ? <p className="hname">{closedName(t)![0] === "공휴일" ? "공휴일" : "증시 휴장"} · {closedName(t)![1]}</p> : null}
                <p>{t && (isWeekend(t) || closedName(t)) ? "주말과 휴장일에는 아침 정리와 채점 기록이 없어요." : "서비스를 쓰기 전이거나 예상을 내지 않은 날이에요."}</p>
                {near ? <Link href={`/saved?d=${near}`} className="nearlink">가장 가까운 거래일 · {dateLabel(isoDay(near))} ›</Link> : null}
              </section>
            ) : (
              <>
                <section className="pcard">
                  <div className="rowh"><b>그날 아침 정리</b><span>{m?.card ? `${m.card.slot === "0811" ? "08:11" : "06:30"} 기준 · 저장된 그대로` : ""}</span></div>
                  {ai?.title ? <p className="mtitle">{ai.title}</p> : null}
                  {ai?.macro.length ? ai.macro.map((l, k) => (
                    <p key={k} className="mline"><b>{ai.headings[k] ?? `핵심 ${k + 1}`}</b>{l}</p>
                  )) : m?.card?.status === "ok" ? (
                    <p className="sline2">야간선물 <b style={{ color: signColor(m.night?.last ?? m.card.x ?? 0) }}>{pct(P(m.night?.last ?? m.card.x ?? 0))}</b> · 예상 범위를 낸 종목 {m.card.nStocks}개</p>
                  ) : <p className="sline2">{m?.card?.reasonText ?? "이 날은 카드가 없어요."}</p>}
                  <div className="vlinks"><Link href={`/night?d=${t}`}>그날 예상 다시 보기 ›</Link>{/* '그날 브리핑 다시 보기'는 뺌(2026-11-25 사용자 결정) */}</div>
                </section>

                <section className="pcard">
                  <div className="rowh"><b>그날의 채점</b><span>{m?.check ? "09:00 시가 기준" : "채점 전"}</span></div>
                  {!m?.check ? <p className="sline2">{t === today ? `오늘은 ${marketDay(today)?.openAt || "09:00"} 시가가 나오면 바로 채점해요.` : "이 날은 채점 기록이 없어요."}</p> : !rows.length ? <p className="sline2">내 보유 종목 중 채점된 종목이 없어요.</p> : (
                    <>
                      <p className="score"><b>{inN} / {rows.length}</b> 종목이 예상 범위 안에서 열렸어요</p>
                      <table className="ctab">
                        <thead><tr><th>종목</th><th>예상 범위</th><th>실제</th><th /></tr></thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.code}>
                              <td><Link href={`/night/${r.code}?d=${t}&p=post`}>{r.name}</Link></td>
                              <td>{r1(r.s!.l80)} ~ {r1(r.s!.u80)}%</td>
                              <td style={{ color: signColor(r.c!.y) }}><b>{pct(P(r.c!.y))}</b></td>
                              <td><span className={r.c!.in80 ? "ck ok" : "ck no"}>{r.c!.in80 ? "✓" : "✕"}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="fine">전체 {m.check.scored}종목 중 {m.check.inBand80.toFixed(1)}%가 80% 범위 안에서 열렸어요.</p>
                    </>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>
      <BottomNav active="saved" />
    </>
  );
}
