// 홈 '한 화면에 보기'(2026-11-22): 원래 버전(overnight_briefing/service/web/orig) 브리핑처럼 밤사이 정보를 한 화면에 이어서 보여 준다.
// 순서: ① 9시 내 주식 변화(기여 종목·어제→예상 합계·종목별 막대·오늘 진행) ② 먼저 확인할 것 ③ 내 종목과 이어진 밤사이 소식
//       ④ 보유 종목 카드(노란 띠 80% 예상 범위·08:10 장전 거래·띠 안 금액·믿을 정도·소식·예상과 소식 같이 읽기) ⑤ 소식 더 ⑥ 밤사이 시장(미국 지수·야간선물)
// 모양은 피그마 버전(globals.css의 카드·색·글자)을 쓴다. 숫자는 모두 계산값이고, 소식은 예상 계산에 넣지 않는다(원인 단정 금지).
import Link from "next/link";
import { Avatar, StockNews } from "@/components/ui";
import { MaskToggle } from "@/components/sheet";
import { signColor } from "@/components/model";
import { FuturesCard } from "@/components/futcard";
import { FuturesHelp } from "@/components/helps";
import { account, ordered, P, type Row } from "@/lib/night";
import { impactFor, verdictsOf, type Article } from "@/lib/news";
import type { Night } from "@/lib/model";
import type { UsDay } from "@/lib/market";
import { md, US } from "@/lib/market";
import { pct, swon, won } from "@/lib/format";

const DOTS: Record<string, string> = { 높음: "●●●", 보통: "●●○", 낮음: "●○○" };
const BAND = "#FFD970";

type Props = {
  rows: Row[];               // 장전: 예상 · 장후: 실제(채점)
  preRows: Row[];            // 장전 예상(장후에도 '예상' 칸과 띠에 씀)
  post: boolean;             // 채점 뒤인가
  slot0811: boolean;         // 08:11 카드(장전 거래 반영)인가
  steps: { t: string; label: string; done: boolean }[];
  news: Map<string, Article[]>;   // 종목코드 → 그 종목 기사
  reasons: Map<string, { line: string; relation: string | null; key: string | null }>;
  lines: Map<string, { line: string | null }>;   // 종목 한 줄(hot_company): 이유 문장이 없을 때
  record: { inN: number; n: number } | null;     // 지난 20거래일 내 종목 범위 안
  us: Map<string, UsDay>;
  night: Night | null;
  buckets: number[];
  nightLive: boolean;
  briefSlot?: React.ReactNode;   // 밤사이 뉴스 AI 요약 카드(홈과 같은 것)
};

/** 노란 띠(종목 카드용, 정적): 80% 예상 범위 · 대표 예상(검은 점) · 어제 종가(회색 점선) · 08:10 장전 거래(빨간 선) · 실제 시가(빈 동그라미) */
function Band({ l, u, h, nxt, y }: { l: number; u: number; h: number; nxt?: number | null; y?: number | null }) {
  const W = 342, pad = 12;
  const m = Math.max(0.01, Math.abs(l), Math.abs(u), Math.abs(h), Math.abs(nxt ?? 0), Math.abs(y ?? 0)) * 1.25;
  const X = (v: number) => pad + ((v + m) / (2 * m)) * (W - 2 * pad);
  const pc = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(2)}%`;
  const near = (a: number, b: number) => Math.abs(X(a) - X(b)) < 34;
  const lx = nxt != null && near(l, nxt) ? Math.max(20, X(nxt) - 36) : X(l);
  const ux = nxt != null && near(u, nxt) ? Math.min(W - 20, X(nxt) + 36) : X(u);
  return (
    <svg width="100%" viewBox={`0 0 ${W} 58`} role="img" aria-label={`예상 범위 ${pc(l)} ~ ${pc(u)}, 대표 예상 ${pc(h)}`} className="aband">
      <text x={X(0)} y={10} textAnchor="middle" fontSize={10} fill="#66777a">어제 종가</text>
      <rect x={pad} y={23} width={W - 2 * pad} height={8} rx={4} fill="#eef1f2" />
      <rect x={X(l)} y={21} width={Math.max(3, X(u) - X(l))} height={12} rx={6} fill={BAND} />
      <line x1={X(0)} x2={X(0)} y1={15} y2={39} stroke="#8a9598" strokeWidth={1.5} strokeDasharray="3 3" />
      {nxt != null ? <><rect x={X(nxt) - 1} y={16} width={2} height={22} fill="#d35d66" /><text x={X(nxt)} y={50} textAnchor="middle" fontSize={10} fontWeight={700} fill="#d35d66">08:10</text></> : null}
      <circle cx={X(h)} cy={27} r={6} fill="#2f3437" stroke="#fff" strokeWidth={2} />
      {y != null ? <circle cx={X(y)} cy={27} r={6} fill="#fff" stroke="#192d31" strokeWidth={2} /> : null}
      <text x={lx} y={55} textAnchor="middle" fontSize={11} fill={signColor(l)}>{pc(l)}</text>
      <text x={ux} y={55} textAnchor="middle" fontSize={11} fill={signColor(u)}>{pc(u)}</text>
    </svg>
  );
}

export function AllView(p: Props) {
  const ac = account(p.rows);
  const calc = p.rows.filter((r) => r.amount != null);
  // 기여: 합계와 같은 방향 종목 중 가장 큰 종목이 그 방향 금액의 몇 %인가(원래 버전 "줄어들 금액의 84%가 SK하이닉스예요")
  const same = calc.filter((r) => Math.sign(r.amount!) === Math.sign(ac.amount) && r.amount !== 0).sort((a, b) => Math.abs(b.amount!) - Math.abs(a.amount!));
  const sameSum = same.reduce((a, r) => a + Math.abs(r.amount!), 0);
  const top = same[0];
  const verb = ac.amount < 0 ? (p.post ? "줄어든" : "줄어들") : (p.post ? "늘어난" : "늘어날");
  // 종목별로 보면: 금액 변화 큰 3종목 + 그 외
  const byAmt = [...calc].sort((a, b) => Math.abs(b.amount!) - Math.abs(a.amount!));
  const absSum = byAmt.reduce((a, r) => a + Math.abs(r.amount!), 0) || 1;
  const head = byAmt.slice(0, 3), rest = byAmt.slice(3);
  const restAmt = rest.reduce((a, r) => a + r.amount!, 0);
  const maxAbs = Math.max(1, ...head.map((r) => Math.abs(r.amount!)), Math.abs(restAmt));
  const bars: [string, number, string][] = [...head.map((r) => [r.name, r.amount!, r.code] as [string, number, string]), ...(rest.length ? [[`그 외 ${rest.length}종목`, restAmt, ""] as [string, number, string]] : [])];

  // 먼저 확인할 것: 범위 밖·믿을 정도 낮음(장전), 범위 밖(장후), 부정 소식
  const pre = new Map(p.preRows.map((r) => [r.code, r]));
  const neg = (code: string) => verdictsOf(p.news.get(code) ?? [], code).neg;
  const watch = p.rows.filter((r) => r.kind === "out" || r.kind === "low" || neg(r.code) > 0);
  const why = (r: Row) => [
    r.kind === "out" ? (p.post ? "실제 시가가 예상 범위 밖" : "08:10 장전 거래가 예상 범위 밖") : null,
    r.kind === "low" ? "장전 거래 방향을 믿을 정도 낮음" : null,
    neg(r.code) ? `부정 소식 ${neg(r.code)}건` : null,
  ].filter(Boolean).join(" · ");

  // 내 종목과 이어진 소식: 판정이 있는 기사 먼저, 같은 기사는 한 번만
  const seen = new Set<string>();
  const items: { a: Article; code: string }[] = [];
  for (const r of p.rows) for (const a of p.news.get(r.code) ?? []) if (!seen.has(a.key)) { seen.add(a.key); items.push({ a, code: r.code }); }
  items.sort((x, y) => Number(!!impactFor(y.a, y.code)) - Number(!!impactFor(x.a, x.code)) || y.a.published.localeCompare(x.a.published));
  const nameOf = new Map(p.rows.map((r) => [r.code, r.name]));

  const list = ordered(p.rows.filter((r) => r.kind !== "notservice" && r.kind !== "nocalc"));
  const none = p.rows.filter((r) => r.kind === "notservice" || r.kind === "nocalc");

  return (
    <div className="allview">
      {/* ① 9시 내 주식 변화 */}
      <section className="acct allacct">
        <div className="at"><span>{p.post ? "오늘 시가로 실제 바뀐 내 주식" : "9시에 예상되는 내 주식 변화"}</span><MaskToggle /></div>
        <div className="big" style={{ color: signColor(ac.amount) }}><span className="amt tot">{swon(ac.amount)}</span><small>{pct(P(ac.pct))}</small></div>
        {top && sameSum ? <p className="allwho">{verb} 금액의 <b>{Math.round((Math.abs(top.amount!) / sameSum) * 100)}%</b>가 {top.name}예요.</p> : null}
        <div className="flow">
          <div><small>어제 종가 기준</small><b className="amt">{won(ac.value)}</b></div><span aria-hidden>→</span>
          <div className="r"><small>{p.post ? "실제 시가 기준" : "예상 시가 기준"}</small><b className="amt">{won(ac.after)}</b></div>
        </div>
        <div className="allbars">
          <p className="ab-h"><span>종목별로 보면</span><span>가운데 = 어제 종가</span></p>
          {bars.map(([name, amt, code]) => {
            const w = (Math.abs(amt) / maxAbs) * 50;
            return (
              <div key={name} className="ab-r">
                <span className="ab-n">{code ? <Link href={`/night?open=${code}`}>{name}</Link> : name}</span>
                <span className="ab-b"><i style={{ left: amt < 0 ? `${50 - w}%` : "50%", width: `${w}%`, background: signColor(amt) }} /></span>
                <span className="ab-v"><b className="amt" style={{ color: signColor(amt) }}>{swon(amt)}</b><small>{Math.round((Math.abs(amt) / absSum) * 100)}%</small></span>
              </div>
            );
          })}
        </div>
        <ol className="allsteps">
          {p.steps.map((s) => <li key={s.t} className={s.done ? "done" : ""}><i /><b>{s.t}</b><span>{s.label}</span></li>)}
        </ol>
      </section>

      {/* ② 먼저 확인할 것 */}
      <section className="allsec">
        <div className="hrow"><h3>먼저 확인할 것</h3><Link href="/night?f=out" className="linkish teal">밤사이 목록 ›</Link></div>
        {watch.length ? (
          <ul className="allwatch">
            {watch.map((r) => (
              <li key={r.code}><Link href={`/night?open=${r.code}`}><Avatar name={r.name} size={26} /><span className="aw-t"><b>{r.name}</b><small>{why(r)}</small></span><em style={{ color: signColor(r.pct ?? 0) }}>{r.pct != null ? pct(P(r.pct)) : ""}</em></Link></li>
            ))}
          </ul>
        ) : (
          <p className="allok"><b>✓</b> 지금은 {p.post ? "예상 범위를 벗어난 종목" : "예상을 벗어난 종목"}이 없어요. {p.rows.filter((r) => r.amount != null).length}종목 모두 {p.post ? "범위 안에서 열렸어요" : p.slot0811 ? "장전 거래가 예상 범위 안이에요" : "08:11에 장전 거래로 한 번 더 확인해요"}.</p>
        )}
      </section>

      {/* ③ 내 종목과 이어진 밤사이 소식 */}
      {items.length ? (
        <section className="allsec">
          <div className="hrow"><h3>내 종목과 이어진 밤사이 소식</h3><Link href="/news?tab=mine" className="linkish teal">전체 {items.length}건 ›</Link></div>
          {items.slice(0, 3).map(({ a, code }) => <div key={a.key} className="allnews"><span className="alltag">{nameOf.get(code)}</span><StockNews a={a} impact={impactFor(a, code)} /></div>)}
          <p className="fine">이어졌다는 건 사업 관계가 있다는 뜻이에요. 이 소식 때문에 주가가 움직였다는 뜻은 아니에요.</p>
        </section>
      ) : null}

      {/* ④ 보유 종목 카드 */}
      <section className="allsec">
        <div className="hrow"><h3>보유 종목 {list.length}</h3><Link href="/night" className="linkish teal">밤사이에서 정렬·필터 ›</Link></div>
        {p.record ? <Link href="/night/record" className="allrec"><span>지난 20거래일 동안 내 종목 <b>{p.record.inN}/{p.record.n}</b>번이 예상 범위 안에서 열렸어요(목표 80%)</span><em>›</em></Link> : null}
        <p className="alllegend"><span><i className="lb" />노란 띠 · 80% 예상 범위</span><span><i className="ld" />대표 예상</span>{p.slot0811 && !p.post ? <span><i className="ln" />08:10 장전 거래</span> : null}{p.post ? <span><i className="lo" />실제 시가</span> : null}</p>
        {list.map((r) => {
          const s = r.s!, q = pre.get(r.code), vd = verdictsOf(p.news.get(r.code) ?? [], r.code);
          const nxt = p.slot0811 && !p.post ? s.nxtG ?? null : null;
          const yv = p.post ? r.c?.y ?? null : null;
          const reason = p.reasons.get(r.code)?.line ?? p.lines.get(r.code)?.line ?? null;
          const nArt = p.news.get(r.code)?.length ?? 0;
          return (
            <article key={r.code} className={`allcard ${r.kind === "out" || r.kind === "low" ? "warn" : ""}`}>
              <div className="ac-h">
                <Avatar name={r.name} size={30} />
                <div className="ac-n"><b>{r.name}</b><small>어제 {won(s.pc)} → {p.post && r.c ? `실제 ${won(r.c.open)}` : `예상 ${won(s.pc * (1 + s.h))}`}</small></div>
                <div className="ac-v"><b style={{ color: signColor(r.pct ?? 0) }}>{r.pct != null ? pct(P(r.pct)) : "—"}</b><small className="amt" style={{ color: signColor(r.amount ?? 0) }}>{r.amount != null ? swon(r.amount) : ""}</small></div>
              </div>
              <Band l={s.l80} u={s.u80} h={s.h} nxt={nxt} y={yv} />
              <p className="ac-range">보유 {r.qty.toLocaleString("ko-KR")}주 · 노란 띠 안이면 <b className="amt">{swon(r.qty * s.pc * s.l80)}</b> ~ <b className="amt">{swon(r.qty * s.pc * s.u80)}</b></p>
              <div className="schips">
                {p.slot0811 && s.grade ? <span className="g">믿을 정도 {s.grade} {DOTS[s.grade]}</span> : <span className="n">믿을 정도는 08:11에 나와요</span>}
                {vd.neg || vd.pos ? <span className="n">{vd.neg ? `부정 ${vd.neg}` : ""}{vd.neg && vd.pos ? " · " : ""}{vd.pos ? `긍정 ${vd.pos}` : ""}</span> : <span className="n">{nArt ? `소식 ${nArt}건` : "소식 없음"}</span>}
                {s.earn ? <span className="w">어제 실적 공시</span> : null}
              </div>
              {nxt != null || (p.post && r.c) ? (
                <p className="ac-step">
                  <span>{p.post ? "아침 예상" : "07:30 예상"} <b style={{ color: signColor(q?.pct ?? s.h) }}>{pct(P(s.h))}</b></span><span aria-hidden>→</span>
                  <span>{p.post ? "실제 시가" : "08:10 장전 거래"} <b style={{ color: signColor((p.post ? r.c?.y : nxt) ?? 0) }}>{pct(P((p.post ? r.c?.y : nxt) ?? 0))}</b></span>
                  <em className={r.kind === "out" ? "out" : "in"}>{r.kind === "out" ? "범위 밖" : "범위 안"}</em>
                </p>
              ) : null}
              {reason ? (
                <div className="ac-ai">
                  <p className="ac-ai-h"><span className="aimark">AI</span>예상과 밤사이 소식, 같이 읽기</p>
                  <p>{reason}</p>
                  <small>예상 범위는 야간선물 마감 변화와 지난 기록으로 계산했고, 이 소식은 넣지 않았어요.</small>
                </div>
              ) : null}
              <div className="ac-links"><Link href={`/night?open=${r.code}`}>종목 창 ›</Link>{nArt ? <Link href={`/news?tab=mine&c=${r.code}`}>밤사이 소식 {nArt}건 ›</Link> : null}<Link href={`/mine/${r.code}`}>종목 상세 ›</Link></div>
            </article>
          );
        })}
        {none.length ? (
          <div className="allnone"><b>예상 범위를 계산하지 않는 종목</b>{none.map((r) => <span key={r.code}>{r.name}{r.kind === "notservice" ? " · 서비스 대상 아님" : " · 자료 없음"}</span>)}</div>
        ) : null}
      </section>

      {/* ⑤ 소식 더 */}
      {items.length > 3 ? (
        <section className="allsec">
          <div className="hrow"><h3>내 종목과 이어진 소식 더</h3><Link href="/news?tab=mine" className="linkish teal">뉴스 브리핑 ›</Link></div>
          {items.slice(3, 8).map(({ a, code }) => <div key={a.key} className="allnews"><span className="alltag">{nameOf.get(code)}</span><StockNews a={a} impact={impactFor(a, code)} /></div>)}
        </section>
      ) : null}

      {p.briefSlot ? <section className="allsec"><div className="hrow"><h3>밤사이 뉴스 요약 <span className="aimark">AI</span></h3><Link href="/news" className="linkish teal">뉴스 브리핑 ›</Link></div>{p.briefSlot}</section> : null}

      {/* ⑥ 밤사이 시장 */}
      <section className="allsec">
        <div className="hrow"><h3>밤사이 시장</h3><span className="fine">{(() => { const d = p.us.get("^GSPC")?.usDate; return d ? `${md(d)} 16:00 마감 (미 동부)` : "자료 준비 중"; })()}</span></div>
        <div className="uschips">
          {US.map((u) => { const d = p.us.get(u.sym); return <Link key={u.sym} href={`/us?s=${encodeURIComponent(u.sym)}`} className="uschip"><span>{u.short}</span><b style={{ color: signColor(d?.chg ?? 0) }}>{d ? pct(P(d.chg)) : "—"}</b></Link>; })}
        </div>
        {p.night?.points.length ? <FuturesCard night={p.night} live={p.nightLive} buckets={p.buckets} />
          : <div className="futbar off"><span className="nm"><b className="tq">코스피200 야간선물<FuturesHelp /></b><small>어젯밤 18:00 ~ 06:00</small></span><span className="chg"><b>거래 없음</b></span></div>}
        <p className="fine">야간선물이 밤사이 미국 시장과 소식이 모이는 한국 쪽 가격이에요. 오늘 예상 범위는 06:00 마감 변화로 계산했어요.</p>
      </section>
      <p className="fine">모델 추정이며 투자 권유가 아니에요.</p>
    </div>
  );
}
