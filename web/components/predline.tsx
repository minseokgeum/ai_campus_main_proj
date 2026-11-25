// 종목 상세 '오늘 예측 요약 줄' + 누르면 올라오는 '오늘 아침 예상' 창(피그마 1033:2012 · 1042:7536, 변경 기록 27·28·44, 2026-11-25).
// 줄: 민트(모델 추정, 누르면 창) · 회색(안내). 창: 예상 시작가 → 범위 띠(어제 종가 점선 · 평단 청록 선 · 08:10 빨간 선) → 가격대 3줄과 내 금액 → 평단 · 08:10 줄 → 지난 20거래일 그래프 → 안내.
// 자료는 lib/stockpred.ts. 숫자 모양은 밤사이 종목 창과 같다(components/stockpanel.tsx의 pctText · wonText).
import { Sheet } from "@/components/sheet";
import { pct, swon, won } from "@/lib/format";
import type { Pred, PredDay } from "@/lib/stockpred";

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
        {p.kind === "nxt" && p.nxt != null ? <span className="nx">08:10 거래 {p1(p.nxt)}</span> : <span className="tag">모델 추정</span>}</span>
      <span className="t2">{p.kind === "nxt"
        ? (p.nxt == null ? "오늘은 08:10 장전 거래가 없었어요" : p.nxt >= p.l80 && p.nxt <= p.u80 ? "08:10 장전 거래가 예상 범위 안이에요" : "08:10 장전 거래가 예상 범위 밖이에요")
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
  const price = (v: number) => p.pc * (1 + v);
  const amt = (v: number) => qty * p.pc * v;
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
      <Band p={p} avg={avg} />
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
        <dt>08:10</dt><dd>{p.nxt != null ? <>장전 거래 <b style={{ color: colorOf(p.nxt) }}>{pctText(p.nxt)}</b> · 띠 위 빨간 선이에요</> : p.kind === "pre" ? "장전 거래가 나오면 띠 위에 빨간 선으로 보여드려요" : "오늘은 장전 거래가 없었어요"}</dd>
      </dl>
      {p.days.length ? <Days days={p.days} hit={p.hit} /> : null}
      <p className="d4-pdis">모델 추정이에요. 실제 시가와 다를 수 있고 투자 권유가 아니에요.</p>
    </div>
  );
}

/** 범위 띠(밤사이 종목 창과 같은 모양, 끌기 없음) */
function Band({ p, avg }: { p: Extract<Pred, { kind: "pre" | "nxt" | "post" }>; avg: number | null }) {
  const base0 = avg ? avg / p.pc - 1 : null;
  const m = Math.max(0.01, Math.abs(p.l80), Math.abs(p.u80), Math.abs(p.est), Math.abs(p.nxt ?? 0), Math.abs(p.y ?? 0)) * 1.25;
  const W = 342, pad = 10, X = (v: number) => pad + ((v + m) / (2 * m)) * (W - 2 * pad);
  const near = base0 != null && Math.abs(X(base0) - X(0)) < 44;
  return (
    <svg width="100%" viewBox={`0 0 ${W} 62`} className="d4-band" role="img" aria-label={`예상 범위 ${pctText(p.l80)} ~ ${pctText(p.u80)}, 예상 ${pctText(p.est)}`}>
      <text x={X(0)} y={10} textAnchor="middle" fontSize={10} fill="#66777a">어제 종가</text>
      <rect x={pad} y={23} width={W - 2 * pad} height={8} rx={4} fill="#eef1f2" />
      <rect x={X(p.l80)} y={21} width={Math.max(3, X(p.u80) - X(p.l80))} height={12} rx={6} fill="#FFD970" />
      <line x1={X(0)} x2={X(0)} y1={15} y2={39} stroke="#8a9598" strokeWidth={1.5} strokeDasharray="3 3" />
      {base0 != null && Math.abs(base0) <= m ? <>
        <rect x={X(base0) - 1} y={17} width={2} height={20} fill="#008c82" />
        <text x={X(base0)} y={near ? 49 : 10} textAnchor="middle" fontSize={10} fontWeight={700} fill="#008c82">평단</text>
      </> : null}
      {p.nxt != null ? <rect x={X(p.nxt) - 1} y={16} width={2} height={22} fill="#d35d66" /> : null}
      {p.y != null ? <circle cx={X(p.y)} cy={27} r={5} fill="#008c82" stroke="#fff" strokeWidth={2} /> : null}
      <circle cx={X(p.est)} cy={27} r={6} fill="#2f3437" stroke="#fff" strokeWidth={2} />
      <text x={X(p.l80)} y={56} textAnchor="middle" fontSize={11} fill={colorOf(p.l80)}>{pctText(p.l80)}</text>
      <text x={X(p.u80)} y={56} textAnchor="middle" fontSize={11} fill={colorOf(p.u80)}>{pctText(p.u80)}</text>
    </svg>
  );
}

/** 지난 20거래일(변경 기록 44): 노란 막대 = 예상 범위, 검은 가로줄 = 예상, 점 = 실제 시가(범위 안 청록 채움 · 범위 밖 주황 빈 점). 0% 기준선과 ±6% 눈금 */
function Days({ days, hit }: { days: PredDay[]; hit: [number, number] | null }) {
  const vals = days.flatMap((d) => [d.l80, d.u80, d.y ?? 0]);
  const M = Math.max(0.06, ...vals.map(Math.abs)) * 1.08;
  const W = 342, H = 130, L = 4, R = 36;
  const X = (i: number) => L + (i + 0.5) * ((W - L - R) / Math.max(1, days.length));
  const Y = (v: number) => 6 + (1 - (v + M) / (2 * M)) * (H - 12);
  return (
    <section className="d4-days">
      <div className="h"><b>지난 {days.length}거래일</b>{hit ? <span>범위 안 <b>{hit[0]}/{hit[1]}일</b></span> : null}</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`지난 ${days.length}거래일 예상 범위와 실제 시가`}>
        {[0.06, 0, -0.06].map((v) => <g key={v}><line x1={L} x2={W - R + 4} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? "#d8dfe0" : "#eef1f2"} /><text x={W - R + 8} y={Y(v) + 3} fontSize={10} fill="#66777a">{v === 0 ? "0%" : v > 0 ? "+6%" : "−6%"}</text></g>)}
        {days.map((d, i) => (
          <g key={d.t}>
            <rect x={X(i) - 4} y={Y(d.u80)} width={8} height={Math.max(2, Y(d.l80) - Y(d.u80))} rx={3} fill="#FFD970" />
            <line x1={X(i) - 6} x2={X(i) + 6} y1={Y(d.h)} y2={Y(d.h)} stroke="#192d31" strokeWidth={1.6} />
            {d.y != null ? (d.in80 ? <circle cx={X(i)} cy={Y(d.y)} r={3.5} fill="#008c82" stroke="#fff" strokeWidth={1} />
              : <circle cx={X(i)} cy={Y(d.y)} r={3.5} fill="#fff" stroke="#b86e12" strokeWidth={1.6} />) : null}
          </g>
        ))}
      </svg>
      <div className="ax"><span>{md(days[0].t)}</span><span>{md(days[days.length - 1].t)}</span></div>
      <p className="lg"><span><i className="b" />예상 범위</span><span><i className="e" />예상</span><span><i className="y" />실제 시가</span><span><i className="o" />범위 밖</span></p>
    </section>
  );
}
