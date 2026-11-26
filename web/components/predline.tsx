// 종목 상세 '오늘 예측 요약 줄' + 누르면 올라오는 '오늘 아침 예상' 창(피그마 1033:2012 · 1042:7536, 변경 기록 27·28·44, 2026-11-25).
// 줄: 민트(모델 추정, 누르면 창) · 회색(안내). 창: 예상 시작가 → 노란 띠(components/yband.tsx: 어제 종가 점선 · 평단 · ① 06:30 예상 · ② 08:11 2차 예상 · 실제 시가 빨간 원) → 가격대 3줄과 내 금액 → 평단 · 08:10 줄 → 지난 20거래일 그래프 → 안내.
// 자료는 lib/stockpred.ts. 숫자 모양은 밤사이 종목 창과 같다(components/stockpanel.tsx의 pctText · wonText).
import { Sheet } from "@/components/sheet";
import { YBand } from "@/components/yband";
import { pct, swon, won } from "@/lib/format";
import type { Pred, PredDay } from "@/lib/stockpred";
import { MiniIcon, MiniPost, MiniPre } from "@/components/marks";
import { expAmt, tick } from "@/lib/tick";

// 숫자 모양은 밤사이 종목 창(components/stockpanel.tsx)과 같다. 그 파일은 브라우저용이라 서버 화면에서 부를 수 없어 같은 규칙을 여기 둔다
const pctText = (v: number) => pct(v * 100);
const wonText = won, swonText = swon;
const colorOf = (v: number) => (v > 0 ? "#d35d66" : v < 0 ? "#4c6fc3" : "#8a9598");

const md = (t: string) => `${Number(t.slice(4, 6))}/${Number(t.slice(6))}`;
const p1 = (v: number) => pctText(v).replace(/(\.\d)\d%$/, "$1%");   // 줄에는 소수 한 자리(−4.7%)

const Arrow = () => <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="go"><path d="M6 4L10 8L6 12" fill="none" stroke="#66777A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export function PredLine({ p, name, qty, avg }: { p: Pred; name: string; qty: number; avg: number | null }) {
  if (p.kind === "info") return <div className="d4-pred off"><div className="in"><span className="t1"><b>{p.title}</b><span className="tx">{p.text}</span></span></div></div>;
  const hit = p.hit ? `이 종목 적중 ${p.hit[0]}/${p.hit[1]}일` : null;
  const line = p.kind === "post" && p.y != null ? (
    <>
      <span className="t1"><span className="tx2">예상 {p1(p.est)}</span><b className="arrow" style={{ color: colorOf(p.y) }}>→ 실제 {p1(p.y)}</b>
        {p.in80 != null ? <em className={p.in80 ? "in" : "out"}>{p.in80 ? "범위 안 ✓" : "범위 밖"}</em> : null}</span>
      {hit ? <span className="t2">{hit}</span> : null}
    </>
  ) : (
    <>
      <span className="t1"><b>오늘 아침 예상</b><b className="v" style={{ color: colorOf(p.est) }}>{p1(p.est)}</b>
        {p.kind === "nxt" && p.nxt != null ? <span className="nx">06:30 예상 {p1(p.h)}</span> : <span className="tag">모델 추정</span>}</span>
      <span className="t2">{p.kind === "nxt"
        ? (p.nxt == null ? "장전 가격이 없어 06:30 예상을 유지했어요" : p.nxt >= p.l80 && p.nxt <= p.u80 ? "08:11 2차 예상(장전 가격) · 06:30 범위 안" : "08:11 2차 예상(장전 가격) · 06:30 범위 밖")
        : `범위 ${p1(p.l80)} ~ ${p1(p.u80)}${hit ? ` · ${hit}` : ""}`}</span>
    </>
  );
  return (
    <Sheet className="d4-pred" title={`${name} · 오늘 아침 예상`} trigger={<><span className="in">{line}</span><Arrow /></>}>
      <PredBody p={p} qty={qty} avg={avg} />
    </Sheet>
  );
}

function PredBody({ p, qty, avg }: { p: Extract<Pred, { kind: "pre" | "nxt" | "post" }>; qty: number; avg: number | null }) {
  const price = (v: number) => tick(p.pc * (1 + v));   // 호가 단위로 맞춘 가격(lib/tick.ts)
  const amt = (v: number) => expAmt(qty, p.pc, v);
  const rows: [string, string, number, number, number][] = [   // [점 색, 이름, 변화, 가격, 내 금액]
    ["#FFD970", "범위 위쪽 끝", p.u80, price(p.u80), amt(p.u80)],
    ["#2F3437", "예상 시작가", p.est, price(p.est), amt(p.est)],
    ["#FFD970", "범위 아래쪽 끝", p.l80, price(p.l80), amt(p.l80)],
  ];
  if (p.kind === "post" && p.y != null && p.open != null) rows.push(["#008C82", "실제 시가", p.y, p.open, qty * (p.open - p.pc)]);
  const avgGap = avg ? price(p.est) / avg - 1 : null;
  return (
    <div className="d4-ps">
      <p className="asof">{p.asOf}</p>
      <p className="lab">예상 시작가</p>
      <p className="big"><b>{wonText(price(p.est))}</b><span style={{ color: colorOf(p.est) }}>{pctText(p.est)}</span></p>
      <p className="vs">어제 종가 {wonText(p.pc)} 대비</p>
      {/* 노란 띠: 당신이 잠든 사이에 카드·밤사이 종목 창과 같은 부품(2026-11-25 사용자 시안) */}
      <YBand name="이 종목" l={p.l80} u={p.u80} h={p.h} nxt={p.nxt} y={p.y} avg={avg ? avg / p.pc - 1 : null} phase={p.kind} after0811={p.kind !== "pre"} qty={qty} pc={p.pc} play={p.kind !== "post"} />
      <table className="d4-pt">
        <thead><tr><th>{qty ? `${qty.toLocaleString("ko-KR")}주 · 어제 대비` : "어제 대비"}</th><th>가격</th>{qty ? <th>내 금액</th> : null}</tr></thead>
        <tbody>
          {rows.map(([dot, label, v, pr, a]) => (
            <tr key={label}>
              <td><i style={{ background: dot }} />{label} <span style={{ color: colorOf(v) }}>{pctText(v)}</span></td>
              <td>{wonText(pr)}</td>
              {qty ? <td><b className="amt" style={{ color: colorOf(a) }}>{swonText(a)}</b></td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="d4-pn">
        {avg ? <><dt>평단</dt><dd><span className="avgwon">{wonText(avg)} · </span>예상 시작가가 평단보다 {pctText(Math.abs(avgGap!)).replace(/^[+−]/, "")} {avgGap! >= 0 ? "높아요" : "낮아요"}</dd></> : null}
        <dt>08:11</dt><dd>{p.nxt != null ? <>2차 예상(08:10 장전 가격) <b style={{ color: colorOf(p.nxt) }}>{pctText(p.nxt)}</b> · 띠 위 ②, 06:30 예상(①)은 {pctText(p.h)}이에요</> : p.kind === "pre" ? "08:11에 장전 가격이 나오면 띠 위에 ②로 표시해요" : "장전 가격이 없어 06:30 예상을 유지했어요"}</dd>
      </dl>
      {p.days.length ? <Days days={p.days} hit={p.hit} /> : null}
      <p className="d4-pdis">모델 추정이에요. 실제 시가와 다를 수 있고 투자 권유가 아니에요.</p>
    </div>
  );
}

/** 지난 20거래일(변경 기록 44): 노란 막대 = 예상 범위, 진회색 점 = 06:30 예상, 빨간 빈 원 = 실제 시가(2026-11-26 사용자 결정 · 2차 예상은 찍지 않음).
 *  실제 시가가 나온 날은 점을 연하게(0.5). 날짜 사이가 약 15px이라 번호 없는 작은 표식. 높이 190px(±6% 사이가 눌리지 않게, 130 → 190). 0% 기준선과 ±6% 눈금 */
function Days({ days, hit }: { days: PredDay[]; hit: [number, number] | null }) {
  const vals = days.flatMap((d) => [d.l80, d.u80, d.y ?? 0]);
  const M = Math.max(0.06, ...vals.map(Math.abs)) * 1.08;
  const W = 342, H = 190, L = 4, R = 36;
  const X = (i: number) => L + (i + 0.5) * ((W - L - R) / Math.max(1, days.length));
  const Y = (v: number) => 6 + (1 - (v + M) / (2 * M)) * (H - 12);
  return (
    <section className="d4-days">
      <div className="h"><b>지난 {days.length}거래일</b>{hit ? <span>범위 안 <b>{hit[0]}/{hit[1]}일</b></span> : null}</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`지난 ${days.length}거래일 예상 범위와 실제 시가`}>
        {[0.06, 0, -0.06].map((v) => <g key={v}><line x1={L} x2={W - R + 4} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? "#d8dfe0" : "#eef1f2"} /><text x={W - R + 8} y={Y(v) + 3} fontSize={10} fill="#66777a">{v === 0 ? "0%" : v > 0 ? "+6%" : "−6%"}</text></g>)}
        {days.map((d, i) => (
          <g key={d.t}>
            <rect x={X(i) - 4} y={Y(d.u80)} width={8} height={Math.max(2, Y(d.l80) - Y(d.u80))} rx={4} fill="#FFD970" fillOpacity={0.7} />   {/* 기록 46: 끝 둥글게(4) · 노랑 70% */}
            <MiniPre x={X(i)} y={Y(d.h)} age={d.y != null ? 1 : 0} />
            {d.y != null ? <MiniPost x={X(i)} y={Y(d.y)} /> : null}
          </g>
        ))}
      </svg>
      <div className="ax"><span>{md(days[0].t)}</span><span>{md(days[days.length - 1].t)}</span></div>
      <p className="lg"><span><MiniIcon k="pre" />06:30 예상</span><span><MiniIcon k="post" />실제 시가</span><span><i className="b" />예상 범위</span><span><i className="z" />0% = 어제 종가</span></p>
    </section>
  );
}
