"use client";
// 홈 '한 화면에 보기'의 조작(2026-11-24): 원래 버전(overnight_briefing/service/web/orig/js app.js·band.js·screens.js)과 같은 규칙.
// ① 노란 띠를 누르거나 끌면 "그 가격에 열리면" 금액(손을 떼면 그 값으로 가정, ✕로 풀기) ② 수량 −/+(길게 누르면 빨라짐, 숫자를 누르면 직접 입력)
// ③ 바꾼 것이 있으면 맨 위에 되돌리기 ④ 순서: 먼저 볼 순(먼저 확인할 것에 나온 종목 먼저) · 보유 금액 순 ⑤ 전체·보유·관심 나눠 보기
// ⑥ 평단: 띠 위 청록 선 + "예상 시작가는 내 평균 단가보다 x%" ⑦ 처음 한 번 안내.
// 바꾼 수량은 이 브라우저 탭에만(밤사이 종목 창과 같은 저장 칸 qty:날짜), 가정한 시작가는 화면을 다시 열면 풀린다. 계정 보유 종목·주문과는 상관없다.
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MaskToggle } from "@/components/sheet";
import { signColor } from "@/components/model";
import { pct, swon, won } from "@/lib/format";
import type { CardStock, CheckRow } from "@/lib/model";

const P = (v: number) => v * 100;
const BAND = "#FFD970";
const MAXQ = 99999;

export type PlayCard = {
  code: string; name: string;
  qty: number;               // 계정 수량(관심 종목은 0)
  avg: number | null;        // 평단(넣은 종목만)
  watch: boolean;            // 관심 종목
  warn: boolean;             // 확인 필요(장전 거래·시작가가 예상 밖)
  s: CardStock; c: CheckRow | null;
  pct: number;               // 장전: 예상 시가 변화(08:11은 보정값) · 장후: 실제 시가 변화
  nxt: number | null; y: number | null;   // 띠 표식: 08:10 장전 거래 · 실제 시가
  icon: ReactNode; chips: ReactNode; flow: ReactNode; combined: ReactNode; links: ReactNode;
};

type Step = { t: string; label: string; done: boolean; at?: string };

function lsGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* 저장하지 못해도 화면은 그대로 */ } }

export function AllPlay(p: {
  t: string; post: boolean; slot0811: boolean; steps: Step[];
  cards: PlayCard[]; need: string[];          // need: 먼저 확인할 것 순서(종목코드)
  firstLook: ReactNode; record: { inN: number; n: number } | null; tail: ReactNode;
}) {
  const key = `qty:${p.t}`;
  const [ovr, setOvr] = useState<Record<string, number>>({});
  const loaded = useRef(false);
  useEffect(() => { try { setOvr(JSON.parse(sessionStorage.getItem(key) ?? "{}")); } catch { /* 저장소 없으면 처음 수량 */ } loaded.current = true; }, [key]);
  useEffect(() => { if (loaded.current) try { sessionStorage.setItem(key, JSON.stringify(ovr)); } catch { /* 무시 */ } }, [key, ovr]);
  const [pins, setPins] = useState<Record<string, number>>({});
  const [live, setLive] = useState<{ code: string; v: number } | null>(null);
  const [ord, setOrd] = useState<"need" | "value">("need");
  const [hold, setHold] = useState<"all" | "own" | "watch">("all");
  const [coach, setCoach] = useState(false);
  useEffect(() => { if (lsGet("all.ord") === "value") setOrd("value"); if (!lsGet("all.coach")) setCoach(true); }, []);
  const coachDone = () => { setCoach(false); lsSet("all.coach", "1"); };

  const qOf = (c: PlayCard) => ovr[c.code] ?? c.qty;
  const setQ = (c: PlayCard, f: (cur: number) => number) => setOvr((o) => {
    const cur = o[c.code] ?? c.qty, q = Math.max(0, Math.min(MAXQ, Math.round(f(cur))));
    if (q === cur) return o;   // 끝(0주·최대)에 닿으면 그대로
    const n = { ...o };
    if (q === c.qty) delete n[c.code]; else n[c.code] = q;
    return n;
  });
  const pinOf = (c: PlayCard) => (p.post ? undefined : live && live.code === c.code ? live.v : pins[c.code]);

  // 지금 값(바꾼 수량·가정한 시작가 반영)
  const now = p.cards.map((c) => {
    const q = qOf(c), value = q * c.s.pc, pin = pinOf(c);
    const v = p.post ? (c.c ? c.c.y : null) : pin ?? c.pct;
    const amount = p.post ? (c.c ? q * (c.c.open - c.s.pc) : null) : v == null ? null : value * v;
    return { c, q, value, pin, v, amount };
  });
  const calc = now.filter((x) => x.q > 0 && x.amount != null);
  const value = calc.reduce((a, x) => a + x.value, 0), amount = calc.reduce((a, x) => a + x.amount!, 0);
  const changed = now.some((x) => x.q !== x.c.qty), pinned = !p.post && now.some((x) => x.pin != null);
  const reset = () => { setOvr((o) => { const n = { ...o }; p.cards.forEach((c) => delete n[c.code]); return n; }); setPins({}); setLive(null); };

  // 기여: 합계와 같은 방향 종목 중 가장 큰 종목이 그 방향 금액의 몇 %인가(원래 버전 "줄어들 금액의 84%가 SK하이닉스예요")
  const same = calc.filter((x) => Math.sign(x.amount!) === Math.sign(amount) && x.amount !== 0).sort((a, b) => Math.abs(b.amount!) - Math.abs(a.amount!));
  const sameSum = same.reduce((a, x) => a + Math.abs(x.amount!), 0);
  const top = same[0];
  const verb = amount < 0 ? (p.post ? "줄어든" : "줄어들") : (p.post ? "늘어난" : "늘어날");
  // 종목별로 보면: 금액 변화 큰 3종목 + 그 외
  const byAmt = [...calc].sort((a, b) => Math.abs(b.amount!) - Math.abs(a.amount!));
  const absSum = byAmt.reduce((a, x) => a + Math.abs(x.amount!), 0) || 1;
  const head = byAmt.slice(0, 3), rest = byAmt.slice(3);
  const restAmt = rest.reduce((a, x) => a + x.amount!, 0);
  const maxAbs = Math.max(1, ...head.map((x) => Math.abs(x.amount!)), Math.abs(restAmt));
  const bars: [string, number, string][] = [...head.map((x) => [x.c.name, x.amount!, x.c.code] as [string, number, string]), ...(rest.length ? [[`그 외 ${rest.length}종목`, restAmt, ""] as [string, number, string]] : [])];

  // 순서: 계정 수량 기준으로 한 번 정한다(수량을 누르는 동안 카드가 자리를 옮기지 않게)
  const baseAmt = (c: PlayCard) => (p.post ? (c.c ? c.qty * (c.c.open - c.s.pc) : 0) : c.qty * c.s.pc * c.pct);
  const needAt = new Map(p.need.map((c, i) => [c, i]));
  const sorted = [...p.cards].sort(ord === "value"
    ? (a, b) => b.qty * b.s.pc - a.qty * a.s.pc
    : (a, b) => (needAt.get(a.code) ?? 1e9) - (needAt.get(b.code) ?? 1e9) || Math.abs(baseAmt(b)) - Math.abs(baseAmt(a)));
  const nOwn = p.cards.filter((c) => !c.watch).length, nWatch = p.cards.length - nOwn;
  const hf = nOwn && nWatch ? hold : "all";
  const shown = sorted.filter((c) => hf === "all" || (hf === "watch") === c.watch);
  const coachAt = !p.post && coach ? shown[0]?.code : undefined;
  const nowOf = new Map(now.map((x) => [x.c.code, x]));

  return (
    <>
      {/* ① 9시 내 주식 변화 */}
      <section className="acct allacct">
        <div className="at"><span>{p.post ? "오늘 시가로 실제 바뀐 내 주식" : pinned ? "내가 정한 시작가로 본 내 주식 변화" : "9시에 예상되는 내 주식 변화"}</span><MaskToggle /></div>
        <div className="big" style={{ color: signColor(amount) }}><span className="amt tot">{swon(amount)}</span><small>{pct(P(value ? amount / value : 0))}</small></div>
        {top && sameSum ? <p className="allwho">{verb} 금액의 <b>{Math.round((Math.abs(top.amount!) / sameSum) * 100)}%</b>가 {top.c.name}예요.</p> : null}
        <div className="flow">
          <div><small>어제 종가 기준</small><b className="amt">{won(value)}</b></div><span aria-hidden>→</span>
          <div className="r"><small>{p.post ? "실제 시가 기준" : pinned ? "정한 시작가 기준" : "예상 시가 기준"}</small><b className="amt">{won(value + amount)}</b></div>
        </div>
        {changed || pinned ? (
          <div className="whatif"><span>{changed && pinned ? "수량과 시작가를" : changed ? "수량을" : "시작가를"} 바꿔서 보는 중이에요</span><button type="button" onClick={reset}>↺ 되돌리기</button></div>
        ) : null}
        {bars.length ? (
          <div className="allbars">
            <p className="ab-h"><span>종목별로 보면</span><span>가운데 = 어제 종가</span></p>
            {bars.map(([name, amt, code]) => {
              const w = (Math.abs(amt) / maxAbs) * 50;
              return (
                <div key={name} className="ab-r">
                  <span className="ab-n">{code ? <a href={`#ac-${code}`}>{name}</a> : name}</span>
                  <span className="ab-b"><i style={{ left: amt < 0 ? `${50 - w}%` : "50%", width: `${w}%`, background: signColor(amt) }} /></span>
                  <span className="ab-v"><b className="amt" style={{ color: signColor(amt) }}>{swon(amt)}</b><small>{Math.round((Math.abs(amt) / absSum) * 100)}%</small></span>
                </div>
              );
            })}
          </div>
        ) : null}
        <ol className="allsteps">
          {p.steps.map((s) => <li key={s.t} className={s.done ? "done" : ""}>{s.at
            ? <a href={`/demo-time?at=${s.at}&back=/`} aria-label={`${s.t} ${s.label} 시점 화면 보기`}><i /><b>{s.t}</b><span>{s.label}</span></a>
            : <><i /><b>{s.t}</b><span>{s.label}</span></>}</li>)}
        </ol>
      </section>

      {/* ② 먼저 확인할 것(서버에서 계정 수량 기준으로 만든 것) */}
      {p.firstLook}

      {/* ④ 내 종목 카드 */}
      <section className="allsec">
        <div className="hrow"><h3>{nOwn && nWatch ? "내 종목" : nWatch ? `관심 종목 ${nWatch}` : `보유 종목 ${nOwn}`}</h3><Link href="/night" className="linkish teal">밤사이 자세히 ›</Link></div>
        <div className="allord" role="group" aria-label="종목 순서">
          {([["need", "먼저 볼 순"], ["value", "보유 금액 순"]] as const).map(([v, t]) => (
            <button key={v} type="button" className={ord === v ? "on" : ""} aria-pressed={ord === v} onClick={() => { setOrd(v); lsSet("all.ord", v); }}>{t}</button>
          ))}
        </div>
        {nOwn && nWatch ? (
          <div className="allhold" role="group" aria-label="보유·관심 나눠 보기">
            {([["all", "전체", p.cards.length], ["own", "보유 종목", nOwn], ["watch", "관심 종목", nWatch]] as const).map(([v, t, n]) => (
              <button key={v} type="button" className={hf === v ? "on" : ""} aria-pressed={hf === v} onClick={() => setHold(v)}>{t}<small>{n}</small></button>
            ))}
          </div>
        ) : null}
        {p.record ? <Link href="/night/record" className="allrec"><span>지난 20거래일 동안 내 종목 <b>{p.record.inN}/{p.record.n}</b>번이 예상 범위 안에서 열렸어요(목표 80%)</span><em>›</em></Link> : null}
        <p className="alllegend"><span><i className="lb" />노란 띠 · 80% 예상 범위</span><span><i className="ld" />대표 예상</span>
          {p.slot0811 && !p.post ? <span><i className="ln" />08:10 장전 거래</span> : null}{p.post ? <span><i className="lo" />실제 시가</span> : null}
          {p.cards.some((c) => c.avg) ? <span><i className="la" />내 평균 단가</span> : null}{pinned ? <span><i className="lp" />내가 정한 시작가</span> : null}</p>
        {shown.map((c) => {
          const x = nowOf.get(c.code)!, s = c.s, q = x.q, zero = c.watch && q === 0;
          const avg0 = c.avg ? c.avg / s.pc - 1 : null;
          const e = c.avg && x.v != null ? (s.pc * (1 + x.v)) / c.avg - 1 : null;
          return (
            <article key={c.code} id={`ac-${c.code}`} className={`allcard ${c.warn ? "warn" : ""}`}>
              <div className="ac-h">
                {c.icon}
                <div className="ac-n"><b>{c.name}</b><small>어제 {won(s.pc)} → {p.post && c.c ? `실제 ${won(c.c.open)}` : `${x.pin != null ? "가정" : "예상"} ${won(s.pc * (1 + (x.v ?? 0)))}`}</small></div>
                <div className="ac-v"><b style={{ color: signColor(x.v ?? 0) }}>{x.v != null ? `${x.pin != null ? "가정 " : ""}${pct(P(x.v))}` : "—"}</b>
                  <small className={zero ? "" : "amt"} style={{ color: zero ? undefined : signColor(x.amount ?? 0) }}>{zero ? "관심" : x.amount != null ? swon(x.amount) : ""}</small></div>
              </div>
              {coachAt === c.code ? (
                <div className="allcoach" role="note"><span>노란 띠를 눌러 보세요. 그 가격에 시작하면 내 금액이 바로 보여요.</span><button type="button" onClick={coachDone}>알겠어요</button></div>
              ) : null}
              <PlayBand s={s} nxt={c.nxt} y={c.y} pin={x.pin} avg0={avg0} play={!p.post}
                onLive={(v) => { if (coach) coachDone(); setLive(v == null ? null : { code: c.code, v }); }}
                onPin={(v) => { setLive(null); setPins((o) => ({ ...o, [c.code]: v })); }} />
              <div className="ac-foot">
                <Stepper q={q} name={c.name} changed={q !== c.qty} set={(f) => setQ(c, f)} />
                <span className="ac-range">
                  {q !== c.qty ? <em>{c.qty ? `잔고 ${c.qty.toLocaleString("ko-KR")}주` : "관심 종목"}에서 바꿔 보는 중</em> : null}
                  {q === 0 ? <>금액은 <b>수량을 넣으면 보여요</b></> : p.post && c.c ? <>실제 시가로 <b className="amt">{swon(x.amount ?? 0)}</b></>
                    : <>노란 띠 안이면 <b className="amt">{swon(q * s.pc * s.l80)}</b> ~ <b className="amt">{swon(q * s.pc * s.u80)}</b></>}
                </span>
              </div>
              <div className="schips">
                {c.watch ? <span className="g">관심 종목</span> : null}
                {x.pin != null && pins[c.code] != null ? (
                  <button type="button" className="pinchip" aria-label="정한 시작가 지우기" onClick={() => setPins((o) => { const n = { ...o }; delete n[c.code]; return n; })}>시작가 {pct(P(pins[c.code]))} 가정 ✕</button>
                ) : null}
                {c.chips}
                {e != null ? <span className="n">{p.post ? "실제" : x.pin != null ? "정한" : "예상"} 시작가는 내 평균 단가보다 <b style={{ color: signColor(e) }}>{pct(P(e))}</b></span> : null}
              </div>
              {c.flow}
              {c.combined}
              {c.links}
            </article>
          );
        })}
        {p.tail}
        <p className="fine">{p.post ? "수량을 바꾸면 실제 시가로 본 금액이 다시 계산돼요." : "노란 띠를 누르거나 끌면 그 가격에 시작했을 때 내 금액을 볼 수 있어요."} 수량을 바꿔도 실제 주문은 나가지 않고, 계정의 보유 종목도 바뀌지 않아요.</p>
      </section>
    </>
  );
}

/** 수량 −/+ (원래 버전 stepper): 누르고 있으면 0.38초 뒤부터 빨라진다(15번 뒤 5주씩, 40번 뒤 10주씩). 숫자를 누르면 직접 입력 */
function Stepper({ q, name, changed, set }: { q: number; name: string; changed: boolean; set: (f: (cur: number) => number) => void }) {
  const hold = useRef<{ t?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval>; n: number }>({ n: 0 });
  const [edit, setEdit] = useState(false);
  const stop = () => { clearTimeout(hold.current.t); clearInterval(hold.current.i); };
  const start = (dir: number) => {
    stop(); hold.current.n = 0;
    const go = () => { const n = ++hold.current.n; set((cur) => cur + dir * (n > 40 ? 10 : n > 15 ? 5 : 1)); };
    go(); hold.current.t = setTimeout(() => { hold.current.i = setInterval(go, 70); }, 380);
    window.addEventListener("pointerup", stop, { once: true });   // 단추 밖에서 손을 떼도 멈춘다
  };
  useEffect(() => stop, []);
  useEffect(() => { if (q <= 0 || q >= MAXQ) stop(); }, [q]);   // 끝에 닿아 단추가 꺼지면(꺼진 단추는 손 뗌을 못 받음) 반복을 멈춘다
  const btn = (dir: number, label: string, sign: string, off: boolean) => (
    <button type="button" aria-label={`${name} ${label}`} disabled={off}
      onPointerDown={(e) => { e.preventDefault(); start(dir); }} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); set((cur) => cur + dir); } }}>{sign}</button>
  );
  return (
    <span className={`allstep${changed ? " changed" : ""}`}>
      {btn(-1, "수량 줄이기", "−", q <= 0)}
      {edit ? (
        <input type="number" inputMode="numeric" min={0} max={MAXQ} defaultValue={q} autoFocus aria-label={`${name} 수량`}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => { const v = parseInt(e.currentTarget.value, 10); if (Number.isFinite(v)) set(() => v); setEdit(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEdit(false); }} />
      ) : (
        <button type="button" className="q" aria-label={`${name} 수량 ${q}주, 눌러서 직접 입력`} onClick={() => setEdit(true)}>{q.toLocaleString("ko-KR")}<small>주</small></button>
      )}
      {btn(1, "수량 늘리기", "+", q >= MAXQ)}
    </span>
  );
}

/** 노란 띠(누르기·끌기): 80% 예상 범위 · 대표 예상(검은 점) · 어제 종가(회색 점선) · 08:10 장전 거래(빨간 선) · 실제 시가(빈 동그라미)
 *  · 평단(청록 선, 눈금 밖이면 끝에 화살표) · 내가 정한 시작가(청록 동그라미 + "x%에 열리면").
 *  눈금은 띠·표식으로만 정하고 가정 값으로 넓히지 않는다(끄는 동안 손가락 밑에서 띠가 움직이지 않게). 0.1% 단위 */
function PlayBand({ s, nxt, y, pin, avg0, play, onLive, onPin }: {
  s: CardStock; nxt: number | null; y: number | null; pin: number | undefined; avg0: number | null; play: boolean;
  onLive: (v: number | null) => void; onPin: (v: number) => void;
}) {
  const W = 342, pad = 12;
  const { l80: l, u80: u, h } = s;
  const m = Math.max(0.01, Math.abs(l), Math.abs(u), Math.abs(h), Math.abs(nxt ?? 0), Math.abs(y ?? 0)) * 1.25;
  const X = (v: number) => pad + ((Math.max(-m, Math.min(m, v)) + m) / (2 * m)) * (W - 2 * pad);
  const pc = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(2)}%`;
  const near = (a: number, b: number) => Math.abs(X(a) - X(b)) < 34;
  const lx = nxt != null && near(l, nxt) ? Math.max(20, X(nxt) - 36) : X(l);
  const ux = nxt != null && near(u, nxt) ? Math.min(W - 20, X(nxt) + 36) : X(u);
  const svg = useRef<SVGSVGElement>(null), down = useRef(false);
  const val = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, ((clientX - r.left) / r.width * W - pad) / (W - 2 * pad)));
    return Math.round((-m + f * 2 * m) * 1000) / 1000;
  };
  const pinX = pin != null ? X(pin) : null;
  const clash = (x: number) => pinX != null && Math.abs(pinX - x) < 58;   // 말풍선과 겹치는 위쪽 글자는 잠깐 숨긴다
  const avgIn = avg0 != null && Math.abs(avg0) <= m;
  const ax = avg0 != null ? X(avg0) : 0, aNear0 = Math.abs(ax - X(0)) < 44;
  return (
    <svg ref={svg} width="100%" viewBox={`0 0 ${W} 58`} className={`aband${play ? " play" : ""}`}
      role={play ? "slider" : "img"} aria-label={play ? `${s.name} 가정할 시작가 변화(예상 범위 ${pc(l)} ~ ${pc(u)}, 대표 예상 ${pc(h)})` : `예상 범위 ${pc(l)} ~ ${pc(u)}, 대표 예상 ${pc(h)}`}
      aria-valuenow={play ? Math.round((pin ?? h) * 10000) / 100 : undefined} tabIndex={play ? 0 : undefined}
      onKeyDown={play ? (e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); onPin(Math.round(Math.max(-m, Math.min(m, (pin ?? h) + (e.key === "ArrowLeft" ? -0.001 : 0.001))) * 1000) / 1000); } } : undefined}
      onPointerDown={play ? (e) => { down.current = true; svg.current?.setPointerCapture?.(e.pointerId); onLive(val(e.clientX)); } : undefined}
      onPointerMove={play ? (e) => { if (down.current) onLive(val(e.clientX)); } : undefined}
      onPointerUp={play ? (e) => { if (!down.current) return; down.current = false; onPin(val(e.clientX)); } : undefined}
      onPointerCancel={play ? () => { down.current = false; onLive(null); } : undefined}>
      {!clash(X(0)) ? <text x={X(0)} y={10} textAnchor="middle" fontSize={10} fill="#66777a">어제 종가</text> : null}
      <rect x={pad} y={23} width={W - 2 * pad} height={8} rx={4} fill="#eef1f2" />
      <rect x={X(l)} y={21} width={Math.max(3, X(u) - X(l))} height={12} rx={6} fill={BAND} />
      <line x1={X(0)} x2={X(0)} y1={15} y2={39} stroke="#8a9598" strokeWidth={1.5} strokeDasharray="3 3" />
      {avg0 != null && avgIn ? <>
        <rect x={ax - 1} y={15} width={2} height={22} fill="#008c82" />
        {!clash(ax) ? <text x={aNear0 ? ax + (avg0 >= 0 ? 4 : -4) : ax} y={10} textAnchor={aNear0 ? (avg0 >= 0 ? "start" : "end") : "middle"} fontSize={10} fontWeight={700} fill="#008c82">평단</text> : null}
      </> : avg0 != null && !clash(avg0 < 0 ? pad : W - pad) ? (
        <text x={avg0 < 0 ? pad : W - pad} y={10} textAnchor={avg0 < 0 ? "start" : "end"} fontSize={10} fontWeight={700} fill="#008c82">{avg0 < 0 ? `◀ 평단 ${pc(avg0)}` : `평단 ${pc(avg0)} ▶`}</text>
      ) : null}
      {nxt != null ? <><rect x={X(nxt) - 1} y={16} width={2} height={22} fill="#d35d66" /><text x={X(nxt)} y={50} textAnchor="middle" fontSize={10} fontWeight={700} fill="#d35d66">08:10</text></> : null}
      <circle cx={X(h)} cy={27} r={6} fill="#2f3437" stroke="#fff" strokeWidth={2} />
      {y != null ? <circle cx={X(y)} cy={27} r={6} fill="#fff" stroke="#192d31" strokeWidth={2} /> : null}
      {pinX != null ? <>
        <line x1={pinX} x2={pinX} y1={14} y2={40} stroke="#008c82" strokeWidth={1.5} />
        <circle cx={pinX} cy={27} r={8} fill="rgba(0,140,130,.25)" stroke="#008c82" strokeWidth={2} />
        <text x={Math.max(44, Math.min(W - 44, pinX))} y={10} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#008c82">{pc(pin!)}에 열리면</text>
      </> : null}
      <text x={lx} y={55} textAnchor="middle" fontSize={11} fill={signColor(l)}>{pc(l)}</text>
      <text x={ux} y={55} textAnchor="middle" fontSize={11} fill={signColor(u)}>{pc(u)}</text>
    </svg>
  );
}
