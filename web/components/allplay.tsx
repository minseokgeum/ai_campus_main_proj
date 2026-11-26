"use client";
// 홈 '한 화면에 보기'의 조작(2026-11-24): 원래 버전(overnight_briefing/service/web/orig/js app.js·band.js·screens.js)과 같은 규칙.
// ① 노란 띠를 누르거나 끌면 "그 가격에 열리면" 금액(손을 떼면 그 값으로 가정) ② 수량 −/+(길게 누르면 빨라짐, 숫자를 누르면 직접 입력)
// ③ 바꾼 카드 안에 되돌리기(그 종목 수량·가정 시작가를 원래대로) ④ 순서: 먼저 볼 순(먼저 확인할 것에 나온 종목 먼저) · 보유 금액 순 ⑤ 전체·보유·관심 나눠 보기 ⑥ 처음 한 번 안내.
// 2026-11-24 사용자 결정: 맨 위 되돌리기 줄·평단 표시는 넣지 않는다. 가정·수량을 바꿔도 카드 높이와 범례가 그대로라 아래 카드가 밀리지 않게 한다.
// 바꾼 수량은 이 브라우저 탭에만(밤사이 종목 창과 같은 저장 칸 qty:날짜), 가정한 시작가는 화면을 다시 열면 풀린다. 계정 보유 종목·주문과는 상관없다.
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { YBand, type BandPhase } from "@/components/yband";
import { MaskToggle } from "@/components/sheet";
import { signColor } from "@/components/model";
import { pct, swon, won } from "@/lib/format";
import type { CardStock, CheckRow } from "@/lib/model";
import { expAmt } from "@/lib/tick";

const P = (v: number) => v * 100;
const MAXQ = 99999;
const FIRST = 3;   // 처음에 보여 줄 종목 카드 수(2026-11-24: 다 보여 주면 너무 길어서 5개 + 펼치기, 2026-11-25 사용자 결정 3개)

/** 이 요소를 스크롤하는 조상(없으면 문서) */
function scroller(el: HTMLElement): Element {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement ?? document.documentElement;
}

// 종목 카드로 부드럽게 내려가기(2026-11-24): 바로 점프하면 부자연스러워서. 도착 위치는 화면 맨 위에서 6px 아래
// (카드 사이 간격 8px보다 작게 띄워 윗 카드 글씨가 비치지 않게). '동작 줄이기'를 켠 사람에게는 애니메이션 없이 바로 간다
function glide(el: HTMLElement) {
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  scroller(el).scrollBy({ top: el.getBoundingClientRect().top - 6, behavior: calm ? "auto" : "smooth" });
}

export type PlayCard = {
  code: string; name: string;
  qty: number;               // 계정 수량(관심 종목은 0)
  watch: boolean;            // 관심 종목
  warn: boolean;             // 확인 필요(장전 거래·시작가가 예상 밖)
  s: CardStock; c: CheckRow | null;
  pct: number;               // 장전: 예상 시가 변화(08:11은 마지막 NXT 가격) · 장후: 실제 시가 변화
  nxt: number | null; y: number | null;   // 띠 표식: 08:10 장전 거래 · 실제 시가
  status: ReactNode;          // 큰 숫자 아래 상태 한 줄(실적 태그 · 장전 방향 등급 · 띠 안/밖)
  combined: ReactNode; links: ReactNode;
};

type Step = { t: string; label: string; done: boolean; at?: string };

function lsGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* 저장하지 못해도 화면은 그대로 */ } }

export function AllPlay(p: {
  t: string; post: boolean; slot0811: boolean; steps: Step[]; nowHm: string;   // nowHm: 화면 시각(시연 시각 포함) HHMM
  cards: PlayCard[]; need: string[];          // need: 먼저 확인할 것 순서(종목코드)
  firstLook: ReactNode; record: { inN: number; n: number } | null; tail: ReactNode;
}) {
  const key = `qty:${p.t}`;
  const [ovr, setOvr] = useState<Record<string, number>>({});
  const loaded = useRef(false);
  useEffect(() => { try { setOvr(JSON.parse(sessionStorage.getItem(key) ?? "{}")); } catch { /* 저장소 없으면 처음 수량 */ } loaded.current = true; }, [key]);
  useEffect(() => { if (loaded.current) try { sessionStorage.setItem(key, JSON.stringify(ovr)); } catch { /* 무시 */ } }, [key, ovr]);
  const [ord, setOrd] = useState<"need" | "value">("need");
  const [hold, setHold] = useState<"all" | "own" | "watch">("all");
  useEffect(() => { if (lsGet("all.ord") === "value") setOrd("value"); }, []);   // 띠 첫 안내는 노란 띠 부품(yband)이 한 번 띄운다

  const qOf = (c: PlayCard) => ovr[c.code] ?? c.qty;
  const setQ = (c: PlayCard, f: (cur: number) => number) => setOvr((o) => {
    const cur = o[c.code] ?? c.qty, q = Math.max(0, Math.min(MAXQ, Math.round(f(cur))));
    if (q === cur) return o;   // 끝(0주·최대)에 닿으면 그대로
    const n = { ...o };
    if (q === c.qty) delete n[c.code]; else n[c.code] = q;
    return n;
  });
  // 띠를 끌어 보는 값은 띠 말풍선에만 보이고 카드·합계에는 넣지 않는다(2026-11-25 시안 개발 메모: 손을 떼면 원래대로, 저장하지 않음)
  const pinOf = (_c: PlayCard): number | undefined => undefined;

  // 지금 값(바꾼 수량·가정한 시작가 반영)
  const now = p.cards.map((c) => {
    const q = qOf(c), value = q * c.s.pc, pin = pinOf(c);
    const v = p.post ? (c.c ? c.c.y : null) : pin ?? c.pct;
    const amount = p.post ? (c.c ? q * (c.c.open - c.s.pc) : null) : v == null ? null : expAmt(q, c.s.pc, v);   // 호가 단위로 맞춘 가격(lib/tick.ts)
    return { c, q, value, pin, v, amount };
  });
  const calc = now.filter((x) => x.q > 0 && x.amount != null);
  const value = calc.reduce((a, x) => a + x.value, 0), amount = calc.reduce((a, x) => a + x.amount!, 0);
  const pinned = !p.post && now.some((x) => x.pin != null);
  const resetOne = (code: string) => { setOvr((o) => { const n = { ...o }; delete n[code]; return n; }); };

  // 기여: 합계와 같은 방향 종목 중 가장 큰 종목이 그 방향 금액의 몇 %인가(원래 버전 "줄어들 금액의 84%가 SK하이닉스예요")
  const same = calc.filter((x) => Math.sign(x.amount!) === Math.sign(amount) && x.amount !== 0).sort((a, b) => Math.abs(b.amount!) - Math.abs(a.amount!));
  const sameSum = same.reduce((a, x) => a + Math.abs(x.amount!), 0);
  const top = same[0];
  const verb = amount < 0 ? (p.post ? "줄어든" : "줄어들") : (p.post ? "늘어난" : "늘어날");
  // 종목별로 보면: 금액 변화 큰 3종목 + 그 외. %는 원래 버전처럼 같은 방향(늘어난 쪽·줄어든 쪽) 합계 대비 → 위 "줄어들 금액의 n%" 문장과 같은 숫자. '그 외' 줄도 %(2026-11-25 시안)
  const byAmt = [...calc].sort((a, b) => Math.abs(b.amount!) - Math.abs(a.amount!));
  const sideSum = (v: number) => calc.filter((x) => Math.sign(x.amount!) === Math.sign(v)).reduce((a, x) => a + Math.abs(x.amount!), 0);
  const head = byAmt.slice(0, 3), rest = byAmt.slice(3);
  const restAmt = rest.reduce((a, x) => a + x.amount!, 0);
  const maxAbs = Math.max(1, ...head.map((x) => Math.abs(x.amount!)), Math.abs(restAmt));
  const bars: [string, number, string][] = [...head.map((x) => [x.c.name, x.amount!, x.c.code] as [string, number, string]), ...(rest.length ? [[`그 외 ${rest.length}종목`, restAmt, ""] as [string, number, string]] : [])];

  // 순서: 계정 수량 기준으로 한 번 정한다(수량을 누르는 동안 카드가 자리를 옮기지 않게)
  const baseAmt = (c: PlayCard) => (p.post ? (c.c ? c.qty * (c.c.open - c.s.pc) : 0) : expAmt(c.qty, c.s.pc, c.pct));
  const needAt = new Map(p.need.map((c, i) => [c, i]));
  const sorted = [...p.cards].sort(ord === "value"
    ? (a, b) => b.qty * b.s.pc - a.qty * a.s.pc
    : (a, b) => (needAt.get(a.code) ?? 1e9) - (needAt.get(b.code) ?? 1e9) || Math.abs(baseAmt(b)) - Math.abs(baseAmt(a)));
  const nOwn = p.cards.filter((c) => !c.watch).length, nWatch = p.cards.length - nOwn;
  const hf = nOwn && nWatch ? hold : "all";
  const shown = sorted.filter((c) => hf === "all" || (hf === "watch") === c.watch);
  // 펼치기: 다시 불러오지 않고 그 자리에서. 펼친 뒤 여섯째 카드가 단추가 있던 자리에 오게, 접으면 단추가 보이게 스크롤을 맞춘다
  const [more, setMore] = useState(false);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const keep = useRef<{ code: string; top: number } | { btn: true } | { jump: string } | null>(null);
  const hidden = new Set(shown.slice(FIRST).map((c) => c.code));
  const open = () => { if (moreBtn.current && shown[FIRST]) keep.current = { code: shown[FIRST].code, top: moreBtn.current.getBoundingClientRect().top }; setMore(true); };
  const close = () => { keep.current = { btn: true }; setMore(false); };
  useLayoutEffect(() => {
    const k = keep.current; keep.current = null;
    if (!k) return;
    if ("top" in k) { const el = document.getElementById(`ac-${k.code}`); if (el) scroller(el).scrollBy(0, el.getBoundingClientRect().top - k.top); }
    else if ("btn" in k) window.setTimeout(() => moreBtn.current?.scrollIntoView({ block: "center" }), 260);   // 접는 움직임(0.25초)이 끝난 뒤
    else window.setTimeout(() => { const el = document.getElementById(`ac-${k.jump}`); if (el) glide(el); }, 260);
  }, [more]);
  // 위 막대·먼저 확인할 것에서 종목(#ac-코드)을 누르면 그 카드로 부드럽게. 접혀 있는 종목이면 펼친 뒤에
  const hiddenRef = useRef(hidden); hiddenRef.current = more ? new Set<string>() : hidden;
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="#ac-"]');
      const code = a?.getAttribute("href")?.slice(4);
      if (!code) return;
      if (hiddenRef.current.has(code)) { e.preventDefault(); keep.current = { jump: code }; setMore(true); return; }
      const el = document.getElementById(`ac-${code}`);
      if (el) { e.preventDefault(); glide(el); }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  const nowOf = new Map(now.map((x) => [x.c.code, x]));

  return (
    <>
      {/* ① 9시 내 주식 변화(2026-11-25 사용자 시안): 민트 카드(제목 · 금액 · 가장 큰 종목 문장 · 어제 종가 → 예상 시가) → 종목별로 보면 → 오늘 아침 진행 */}
      <section className="acct allacct a2card">
        <div className="at"><span>{p.post ? "오늘 시가로 바뀐 내 주식" : pinned ? "내가 정한 시작가로 본 내 주식" : "오늘 시가에 예상되는 내 주식"}</span><MaskToggle /></div>
        <div className="big" style={{ color: signColor(amount) }}><span className="amt tot">{swon(amount)}</span><small>{pct(P(value ? amount / value : 0))}</small></div>
        {top && sameSum ? <p className="allwho">{verb} 금액의 <b>{Math.round((Math.abs(top.amount!) / sameSum) * 100)}%</b>가 {top.c.name}{jo(top.c.name)}.</p> : null}
        <div className="a2flow">
          <span>어제 종가 → {p.post ? "실제 시가" : pinned ? "정한 시작가" : "예상 시가"}</span>
          <span><span className="amt">{Math.round(value).toLocaleString("ko-KR")}</span><i aria-hidden>→</i><b className="amt">{won(value + amount)}</b></span>
        </div>
      </section>

      {bars.length ? (
        <section className="a2bars" aria-label="종목별로 보면">
          <div className="a2h"><h3>종목별로 보면</h3><span>보유 {byAmt.length}종목</span></div>
          <div className="a2rows">
            <span className="a2axis" aria-hidden><em>어제 종가</em></span>
            {bars.map(([name, amt, code], i) => {
              const w = (Math.abs(amt) / maxAbs) * 50;
              const tone = !code ? "#c3c9cb" : i === 0 ? signColor(amt) : amt < 0 ? "#8fa2da" : "#e79aa1";   // 가장 큰 종목은 진하게, 나머지는 옅게, 그 외는 회색
              return (
                <div key={name} className={`a2r${i === 0 ? " lead" : ""}${code ? "" : " rest"}`}>
                  <span className="a2n">{code ? <a href={`#ac-${code}`}>{name}</a> : name}</span>
                  {/* 막대는 어제 종가 선에 닿는 쪽은 1자, 바깥쪽만 둥글게(사용자 요청) */}
                  <span className="a2b"><i className={amt < 0 ? "neg" : "pos"} style={{ left: amt < 0 ? `${50 - w}%` : "50%", width: `${w}%`, background: tone }} /></span>
                  <b className="amt a2v">{swon(amt)}</b>
                  <small className="a2p">{amt && sideSum(amt) ? `${Math.round((Math.abs(amt) / sideSum(amt)) * 100)}%` : ""}</small>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <Progress steps={p.steps} post={p.post} nowHm={p.nowHm} />
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
        {/* 범례 줄은 뺌: 띠 아래 세 칸(① 06:30 · ② 08:11 · 실제 시가)과 '예상 범위 ?' 설명 창으로(2026-11-25 사용자 시안, 2026-11-26 E안) */}
        {/* 넷째 종목부터는 늘 그려 두고, 펼칠 때 높이가 0.25초에 걸쳐 늘어난다(피그마 기록 31, 2026-11-25 '움직임은 다 피그마'). 접혀 있을 땐 누를 수 없게(inert) */}
        {[shown.slice(0, FIRST), shown.slice(FIRST)].map((part, pi) => { const cards = part.map((c) => {
          const x = nowOf.get(c.code)!, s = c.s, q = x.q, zero = c.watch && q === 0;
          const moved = q !== c.qty;
          // 카드(2026-11-25 사용자 시안 '줄글 없는 버전'): 종목 · 상태 → 큰 숫자 → 상태 한 줄 → 노란 띠(표식·아래 세 칸·양 끝 금액, 끌어 보기) → 수량 −/+(사용자 결정: 유지)
          const ph: BandPhase = p.post && c.y != null ? "post" : p.slot0811 && !p.post && c.nxt != null ? "nxt" : "pre";
          const state = p.post ? <span className="st on">✓ 실제 시가 반영</span> : p.slot0811 ? <span className={`st${c.nxt != null ? " on" : ""}`}>08:11 · {c.nxt != null ? "장전 거래 반영" : "장전 거래 없음"}</span> : <span className="st">06:30 공개</span>;
          return (
            <article key={c.code} id={`ac-${c.code}`} className={`allcard ${c.warn ? "warn" : ""}`}>
              <div className="ac-h2"><b className="nm">{c.name}{c.warn ? <Siren /> : null}</b><span className="qt">{zero ? "관심" : `${q.toLocaleString("ko-KR")}주`}</span>{state}</div>
              <p className="ac-k">{ph === "post" ? "실제 시작" : ph === "nxt" ? "장전 거래 기준" : "예상 시작"}</p>
              <p className="ac-big"><b style={{ color: signColor(x.v ?? 0) }}>{x.v != null ? pct1(x.v) : "—"}</b>
                {!zero && x.amount != null ? <span className="amt" style={{ color: signColor(x.amount) }}>{swon(x.amount)}</span> : null}</p>
              {c.status ? <p className="ac-stat">{c.status}</p> : null}
              <YBand name={c.name} l={s.l80} u={s.u80} h={s.h} nxt={s.nxtG} y={c.y} phase={ph} after0811={p.slot0811 || p.post} qty={q} pc={s.pc} l90={s.l90} u90={s.u90} play={!p.post} />
              <div className="ac-foot">
                <Stepper q={q} name={c.name} changed={q !== c.qty} set={(f) => setQ(c, f)} />
                {moved ? <button type="button" className="ac-reset" aria-label={`${c.name} 수량 원래대로`} onClick={() => resetOne(c.code)}>↺ 되돌리기</button> : null}
              </div>
              {c.combined}
              {c.links}
            </article>
          );
        }); return pi === 0 ? cards : part.length ? <div key="extra" className={`allextra${more ? " on" : ""}`} inert={!more}><div>{cards}</div></div> : null; })}
        {shown.length > FIRST ? (
          <button type="button" ref={moreBtn} className="allmore" aria-expanded={more} onClick={more ? close : open}>
            {more ? <>접기<i className="chev up" aria-hidden /></> : <>나머지 {shown.length - FIRST}종목 더 보기<i className="chev" aria-hidden /></>}
          </button>
        ) : null}
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

/** 큰 숫자 %: 소수 한 자리(시안 "−3.1%") */
const pct1 = (v: number) => { const r = Math.round(v * 1000) / 10; return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(1)}%`; };

/** 받침에 따라 '이에요/예요' */
function jo(name: string) {
  const c = name.charCodeAt(name.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? "이에요" : "예요";
}

const toMin = (hm: string) => { const d = hm.replace(":", ""); return Number(d.slice(0, 2)) * 60 + Number(d.slice(2, 4)); };

/** 오늘 아침 진행(2026-11-25 사용자 시안): 단계 사이 칸을 지금 시각만큼 채우고, 오른쪽에 '지금 · 다음 단계까지 n분' 또는 '✓ 실제 시가 반영'.
 *  지난 단계는 진한 글자, 지금 단계는 청록, 다음 단계는 회색. 시연 계정은 단계를 누르면 그 시점으로(예전과 같음) */
export function Progress({ steps, post, nowHm, solo }: { steps: Step[]; post: boolean; nowHm: string; solo?: boolean }) {   // solo: 홈 06:30 전 화면에 따로 쓸 때(2026-11-26, 위 선·여백 없이)
  if (steps.length < 2) return null;
  const pts = steps.map((s) => toMin(s.t)), now = post ? pts[pts.length - 1] : toMin(nowHm);
  const cur = pts.reduce((a, m, i) => (m <= now ? i : a), 0);
  const next = steps.find((_, i) => pts[i] > now);
  const left = next ? toMin(next.t) - now : 0;
  const hm = `${nowHm.slice(0, 2)}:${nowHm.slice(2, 4)}`;
  const status = post ? "✓ 실제 시가 반영"   // 2026-11-26 사용자 결정: '09:01 실제 시가 반영' 대신
    : next ? `${hm} · ${next.t} ${next.label}까지 ${left >= 60 ? `${Math.floor(left / 60)}시간 ` : ""}${left % 60}분` : "";
  return (
    <section className={`a2prog${solo ? " solo" : ""}`} aria-label="오늘 아침 진행">
      <div className="a2h"><h3>오늘 아침 진행</h3><span className="tq">{status}</span></div>
      <div className="a2seg" aria-hidden>
        {pts.slice(1).map((m, i) => <i key={i}><b style={{ width: `${Math.max(0, Math.min(1, (now - pts[i]) / Math.max(1, m - pts[i]))) * 100}%` }} /></i>)}
      </div>
      <ol className="a2steps">
        {steps.map((s, i) => {
          const cls = (i === cur ? "s-now" : i < cur ? "s-done" : "") + (i === 0 ? " s-first" : i === steps.length - 1 ? " s-last" : "");
          const body = <><b>{s.t}</b><span>{s.label}</span></>;
          return <li key={s.t} className={cls} style={{ left: `${(100 * i) / (steps.length - 1)}%` }}>{s.at ? <a href={`/demo-time?at=${s.at}&back=${encodeURIComponent("/?view=all")}`} aria-label={`${s.t} ${s.label} 시점 화면 보기`}>{body}</a> : body}</li>;
        })}
      </ol>
    </section>
  );
}

/** 확인이 필요한 종목 표시(2026-11-25 사용자 결정: 주황 테두리 대신 이름 옆 주황 사이렌). 장전 거래·시작가가 예상 범위 밖인 종목 */
function Siren() {
  return (
    <svg className="ac-siren" width="16" height="16" viewBox="0 0 16 16" role="img" aria-label="확인 필요">
      <title>확인 필요</title>
      <path d="M8 1.6v1.5M2.9 3.7l1.05 1.05M13.1 3.7l-1.05 1.05" stroke="#f08a24" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4.6 12V8.9a3.4 3.4 0 0 1 6.8 0V12Z" fill="#f08a24" />
      <path d="M6.6 9.1a1.4 1.4 0 0 1 1.4-1.4" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="3.2" y="12" width="9.6" height="2.2" rx="1.1" fill="#f08a24" />
    </svg>
  );
}
