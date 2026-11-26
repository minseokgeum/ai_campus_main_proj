"use client";
// 노란 띠(2026-11-25 사용자 시안 9장 '줄글 없는 버전 · 글을 그림과 이름표로'). 당신이 잠든 사이에 종목 카드 · 밤사이 종목 창 · 종목 상세 예측 창이 함께 쓴다.
//  · 아침 세 값 표식(2026-11-26 사용자 결정 'E안'): ① 06:30 첫 예상(진회색 번호 원) · ② 08:11 2차 예상(청록 번호 원) · 실제 시가(속 빈 빨간 원).
//    띠 위에는 글씨 없이 표식만 두고, 점이 가까우면 제자리에 겹쳐 그린다(오래된 것부터 그려 지금 표식이 맨 위). 지난 표식은 오래될수록 연하게(한 단계 전 0.5 · 두 단계 전 0.25).
//    시각·이름·값은 띠 아래 세 칸 줄에 순서대로(지난 칸도 단계마다 연하게, 아직 안 나온 칸은 점선 '08:11에 나와요' · '개장 뒤 나와요').
//  · 띠 위 글씨는 평단(청록 선 + '평단') 하나만.
//  · 띠 양 끝 %는 띠 바깥 옆에, 그 아래 양 끝 금액(수량 × 어제 종가 × %). 어제 종가는 회색 세로선 + 아래 이름표.
//  · 범례·근거 문장(80%·90%·띠는 06:30 그대로·장전이 띠 밖일 때)은 '예상 범위 ?' 설명 창으로.
//  · 끌어 보기(개발 메모): 손잡이는 평소에 없고, 띠(와 그 주변 줄)를 누르거나 끌면 진한 남색 원(지름 18px, 흰 테두리 2.5px, 그림자) + 말풍선("−4.0% → −218,400원").
//    말풍선 몸통은 띠 양 끝 % 글자보다 위, 긴 꼬리(약 14px)가 손잡이까지 내려온다. 꼬리는 % 글자 뒤에 그려 끝값을 가리지 않는다(위 '예상 범위' 줄·평단 이름표는 잠시 덮일 수 있음).
//    손을 떼도 손잡이와 말풍선은 남고, 띠 밖을 누르면 사라진다(2026-11-26 사용자 결정: 누르는 동안만 보이던 방식이 불편).
//    끄는 동안 실시간으로 바뀌고, 띠 양 끝·어제 종가를 지날 때 살짝 진동. 값은 저장하지 않는다. 0.1% 단위, 그림 왼쪽 끝 ~ 오른쪽 끝.
//    카드를 처음 볼 때 한 번만 "띠를 누르거나 끌어 보세요" 안내.
import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/sheet";
import { Mark, MarkIcon } from "@/components/marks";
import { expAmt } from "@/lib/tick";

export type BandPhase = "pre" | "nxt" | "post";
const W = 342, PAD = 14, BY = 40, TAIL_TOP = 11;   // 그림 폭 · 양 옆 여백(눈금 줄 끝) · 띠 가운데 높이. 2026-11-26: 끝 %를 띠 위로 옮기고 여백 46 → 14
/** 띠 양 끝 글씨 한 쌍(위 %, 아래 금액)의 자리. 띠가 글씨보다 좁으면 띠 가운데를 기준으로 왼쪽 글씨는 왼쪽, 오른쪽 글씨는 오른쪽으로 나눈다.
 *  half = 글씨 폭의 절반(대략). 그림 밖으로 나가지 않게 안쪽으로 당긴다 */
function pair(xl: number, xr: number, half: number): [{ x: number; a: "start" | "middle" | "end" }, { x: number; a: "start" | "middle" | "end" }] {
  if (xr - xl >= 2 * half + 6) return [{ x: Math.max(half, xl), a: "middle" }, { x: Math.min(W - half, xr), a: "middle" }];
  const mid = Math.max(2 * half + 3, Math.min(W - 2 * half - 3, (xl + xr) / 2));
  return [{ x: mid - 3, a: "end" }, { x: mid + 3, a: "start" }];
}
const pc = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(1)}%`;
const won = (v: number) => { const r = Math.round(v); return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toLocaleString("ko-KR")}원`; };
let hintClaimed = false;   // 한 화면에서 안내는 카드 하나에만

const CELL_OP = [1, 0.6, 0.38];    // 아래 세 칸: 띠 위 표식(AGE_OP, components/marks.tsx)과 같은 순서로 연하게
const signColor = (v: number) => (v > 0 ? "#d35d66" : v < 0 ? "#4c6fc3" : "#8a9598");

export function YBand({ l, u, h, nxt, y, avg, phase, after0811 = false, qty, pc: close, play = true, l90, u90, name, onPick, clearKey, start = null, bubble = true }: {
  l: number; u: number; h: number; nxt?: number | null; y?: number | null; avg?: number | null;   // avg: 평단(어제 종가 대비 비율)
  phase: BandPhase; qty: number; pc: number; play?: boolean; l90?: number; u90?: number; name: string;
  onPick?: (v: number | null) => void;   // 끌어 고른 값(어제 종가 대비)을 밖으로 알림(밤사이 계산기, 2026-11-26). 손잡이가 지워지면 null
  clearKey?: number;                     // 이 값이 바뀌면 손잡이를 지운다(계산기 '되돌리기')
  start?: number | null;                 // 처음 손잡이 자리(밤사이 계산기: 옆 종목에서 돌아왔을 때)
  bubble?: boolean;                      // 끄는 동안 띠 위 말풍선. 밤사이 종목 창은 위 계산기에서 숫자를 보여 줘서 끈다(2026-11-26)
  after0811?: boolean;   // 08:11이 지났는지(장전 거래가 없는 날 ② 칸을 '08:11에 나와요' 대신 '장전 거래 없음'으로)
}) {
  // 눈금 고정(2026-11-26 사용자 결정): 늘 −6% ~ +6%. 띠 양 끝 · 06:30 · 2차 예상 · 실제 시가 중 하나라도 넘으면 그 종목만 가장 큰 값의 1.08배까지
  // (종목 상세 '지난 20거래일' 그래프와 같은 규칙). 평단은 눈금을 넓히지 않는다(눈금 밖이면 평단 선을 안 그림, 아래 '평단 대비' 줄은 그대로).
  // 지난 238거래일 · 종목 22만여 개 중 ±6%를 넘은 경우 9.8%(2026-11-26 확인)
  const M = Math.max(0.06, ...[l, u, h, nxt ?? 0, y ?? 0].map(Math.abs)) * (Math.max(...[l, u, h, nxt ?? 0, y ?? 0].map(Math.abs)) > 0.06 ? 1.08 : 1);
  const lo = -M, hi = M;
  const X = (v: number) => PAD + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (W - 2 * PAD);
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(start);
  const [hint, setHint] = useState(false);
  const lastZone = useRef<number | null>(null);
  const down = useRef(false);   // 누르고 있는 중(이때만 움직임을 따라간다)
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  useEffect(() => { pickRef.current?.(drag); }, [drag]);
  const clear0 = useRef(clearKey);   // 처음 그릴 때의 값은 무시(옆 종목에서 돌아와 다시 그릴 때 기억한 손잡이가 지워지지 않게)
  useEffect(() => { if (clearKey !== clear0.current) { clear0.current = clearKey; setDrag(null); } }, [clearKey]);
  // 띠 밖을 누르면 손잡이·말풍선을 지운다. 밤사이 종목 창(말풍선 없음)은 계산기 '모두 되돌리기'로만 지운다(옆 종목·수량 단추를 눌러도 고른 가격이 남게)
  useEffect(() => {
    if (drag == null || !bubble) return;
    const off = (e: PointerEvent) => { if (!svg.current?.contains(e.target as Node)) setDrag(null); };
    document.addEventListener("pointerdown", off, true);
    return () => document.removeEventListener("pointerdown", off, true);
  }, [drag != null]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!play || hintClaimed) return;
    try { if (localStorage.getItem("yband-hint") === "1") return; } catch { return; }
    hintClaimed = true; setHint(true);
    return () => { hintClaimed = false; };
  }, [play]);
  const val = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, ((clientX - r.left) / r.width * W - PAD) / (W - 2 * PAD)));
    return Math.round((lo + f * (hi - lo)) * 1000) / 1000;
  };
  const zone = (v: number) => (v < l ? 0 : v <= u ? 1 : 2) * 2 + (v < 0 ? 0 : 1);   // 띠 양 끝 · 어제 종가를 지나면 바뀐다
  const move = (clientX: number) => {
    const v = val(clientX), z = zone(v);
    if (lastZone.current != null && z !== lastZone.current) try { navigator.vibrate?.(8); } catch { /* 진동 없는 기기 */ }
    lastZone.current = z; setDrag(v);
  };
  const end = () => { down.current = false; lastZone.current = null; };   // 손을 떼도 마지막 자리는 남긴다
  const seen = () => { if (hint) { setHint(false); try { localStorage.setItem("yband-hint", "1"); } catch { /* 무시 */ } } };

  // 지금까지 나온 표식(오래된 순). age = 그 뒤에 나온 표식 수
  const showNxt = nxt != null && phase !== "pre", showY = y != null && phase === "post";
  const pts: { k: "pre" | "nxt" | "post"; v: number }[] = [{ k: "pre", v: h }];
  if (showNxt) pts.push({ k: "nxt", v: nxt! });
  if (showY) pts.push({ k: "post", v: y! });
  const ageOf = (k: string) => pts.length - 1 - pts.findIndex((p) => p.k === k);
  const avgIn = avg != null && avg >= lo && avg <= hi;
  // 아래 세 칸: [표식, 시각·이름, 값 또는 안내, 연한 정도]
  const noNxt = !showNxt && (after0811 || phase !== "pre");
  const cells: { k: "pre" | "nxt" | "post"; t: string; v: number | null; wait?: string; op: number }[] = [
    { k: "pre", t: "06:30 첫 예상", v: h, op: CELL_OP[Math.min(2, ageOf("pre"))] },
    showNxt ? { k: "nxt", t: "08:11 2차 예상", v: nxt!, op: CELL_OP[Math.min(2, ageOf("nxt"))] }
      : noNxt ? { k: "nxt", t: "08:11 장전 없음", v: null, wait: "06:30 유지", op: CELL_OP[1] }
      : { k: "nxt", t: "08:11 2차 예상", v: null, wait: "08:11에 나와요", op: 1 },
    showY ? { k: "post", t: "실제 시가", v: y!, op: 1 } : { k: "post", t: "실제 시가", v: null, wait: "개장 뒤 나와요", op: 1 },
  ];
  const amt = qty > 0;
  const pctAt = pair(X(l), X(u), 21);                 // 위 %(예: −2.6%) 폭 약 42px
  const wonAt = pair(X(l), X(u), amt ? Math.max(won(expAmt(qty, close, l)).length, won(expAmt(qty, close, u)).length) * 3.4 : 0);   // 아래 금액
  return (
    <div className="yband">
      <div className="yb-h"><span>예상 범위</span><BandHelp l90={l90} u90={u90} />{hint && drag == null ? <span className="yb-hint">띠를 누르거나 끌어 보세요</span> : null}</div>
      <div className="yb-wrap">
        {/* 말풍선 몸통은 띠 끝 % 글자 위(꼬리는 그림 안에서 손잡이까지). 그림 밖으로 나가지 않게 몸통만 안쪽으로 당기고 꼬리는 제자리 */}
        {drag != null && bubble ? <span className="yb-bub" style={{ left: `clamp(${amt ? 74 : 30}px, ${(X(drag) / W) * 100}%, calc(100% - ${amt ? 74 : 30}px))` }}>{pc(drag)}{amt ? <> → {won(expAmt(qty, close, drag))}</> : null}</span> : null}
        <svg ref={svg} width="100%" viewBox={`0 0 ${W} 84`} className={`yb-svg${play ? " play" : ""}`}
          role={play ? "slider" : "img"} tabIndex={play ? 0 : undefined}
          aria-label={`${name} 예상 범위 ${pc(l)} ~ ${pc(u)}, 06:30 첫 예상 ${pc(h)}${showNxt ? `, 08:11 2차 예상 ${pc(nxt!)}` : ""}${showY ? `, 실제 시가 ${pc(y!)}` : ""}${play ? ". 누르고 끌면 그 가격의 금액을 보여 줘요" : ""}`}
          aria-valuenow={play ? Math.round((drag ?? h) * 1000) / 10 : undefined}
          onPointerDown={play ? (e) => { seen(); down.current = true; svg.current?.setPointerCapture?.(e.pointerId); move(e.clientX); } : undefined}
          onPointerMove={play ? (e) => { if (down.current) move(e.clientX); } : undefined}
          onPointerUp={play ? end : undefined} onPointerCancel={play ? end : undefined} onLostPointerCapture={play ? end : undefined}>
          {/* 눈금 줄(진한 회색 2px) + 양 끝 마감선 + 어제 종가 선. 중간 작은 눈금은 뺌(2026-11-26 사용자 결정) */}
          <line x1={X(lo)} x2={X(hi)} y1={BY} y2={BY} stroke="#b8c0c3" strokeWidth={2} strokeLinecap="round" />
          {[lo, hi].map((v) => <line key={v} x1={X(v)} x2={X(v)} y1={BY - 4} y2={BY + 4} stroke="#b8c0c3" strokeWidth={1.2} />)}
          <line x1={X(0)} x2={X(0)} y1={BY - 14} y2={BY + 14} stroke="#8a9598" strokeWidth={1.4} />
          <rect x={X(l)} y={BY - 4} width={Math.max(4, X(u) - X(l))} height={8} rx={4} fill="#ffd970" />
          {/* 양 끝 %: 띠 끝 바로 위(눈금 줄을 가로지르지 않게). 흰 테두리는 어제 종가 선 끝과 겹칠 때만 보인다 */}
          {/* 말풍선 꼬리: 몸통 아래(y 11)에서 손잡이 위끝까지. 끝 % 글자보다 먼저 그려 글자가 위에 보이게 */}
          {drag != null && bubble ? <polygon points={`${X(drag) - 5},${TAIL_TOP} ${X(drag) + 5},${TAIL_TOP} ${X(drag)},${BY - 10}`} fill="#192d31" /> : null}
          {pctAt.map((p, i) => <text key={i} x={p.x} y={BY - 12} textAnchor={p.a} fontSize={12.5} fontWeight={700} fill="#192d31" paintOrder="stroke" stroke="#fff" strokeWidth={4} strokeLinejoin="round">{pc(i ? u : l)}</text>)}
          {avgIn ? <>
            <rect x={X(avg!) - 1} y={BY - 10} width={2} height={20} fill="#008c82" />
            <text x={Math.min(W - 16, Math.max(16, X(avg!)))} y={11} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#008c82">평단</text>
          </> : null}
          {/* ① → ② → 실제 시가: 오래된 것부터 그려 겹치면 지금 표식이 맨 위 */}
          {pts.map((p, j) => <Mark key={p.k} k={p.k} x={X(p.v)} y={BY} age={pts.length - 1 - j} />)}
          {amt ? wonAt.map((p, i) => <text key={i} x={p.x} y={BY + 24} textAnchor={p.a} fontSize={10.5} fill="#8a9598">{won(expAmt(qty, close, i ? u : l))}</text>) : null}
          <text x={Math.min(W - 26, Math.max(26, X(0)))} y={BY + 40} textAnchor="middle" fontSize={10} fill="#9aa5a8">어제 종가</text>
          {drag != null ? <circle cx={X(drag)} cy={BY} r={9} fill="#192d31" stroke="#fff" strokeWidth={2.5} className="yb-knob" /> : null}
        </svg>
      </div>
      <div className="yb-leg">
        {cells.map((c) => (
          <div key={c.k} className={`it${c.v == null && !c.wait?.includes("유지") ? " wait" : ""}`} style={c.op < 1 ? { opacity: c.op } : undefined}>
            <span className="t"><MarkIcon k={c.k} />{c.t}</span>
            {c.v != null ? <b style={{ color: signColor(c.v) }}>{pc(c.v)}</b> : <span className="w">{c.wait}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

type Stat = { from: string | null; to: string | null; n: number; out: number };
const md = (t: string) => `${Number(t.slice(4, 6))}/${Number(t.slice(6))}`;

/** '예상 범위 ?' 설명 창(시안 1번 '노란 띠는 이렇게 읽어요'). 넷째 줄 숫자는 서버 기록에서(app/api/bandstats) */
export function BandHelp({ l90, u90 }: { l90?: number; u90?: number }) {
  const [st, setSt] = useState<Stat | null>(null);
  const load = () => { if (!st) fetch("/api/bandstats").then((r) => r.json()).then(setSt).catch(() => setSt({ from: null, to: null, n: 0, out: 0 })); };
  const k = st && st.n ? Math.round((10 * st.out) / st.n) : null;
  return (
    <span onPointerDown={load} onFocus={load}>
      <Sheet className="qmark" title="노란 띠는 이렇게 읽어요" trigger={<span aria-label="노란 띠 읽는 법">?</span>}>
        <div className="yb-help">
          <p><b>노란 띠</b> · 비슷한 아침 10번 중 8번은 이 안에서 시작했어요</p>
          {l90 != null && u90 != null ? <p><b>더 넓게 보면</b> · 10번 중 9번은 {pc(l90)} ~ {pc(u90)} 안에서 시작했어요</p> : null}
          <p><b>띠는 06:30 그대로예요</b> · 8시 장전 거래 뒤에도 바뀌지 않고, 9시 실제 시가 확인도 이 띠로 해요</p>
          <p><b>장전이 띠 밖이면</b> · {k != null ? <>10번 중 {k}번은 실제 시작도 띠 밖이었어요{st!.from && st!.to ? ` (${md(st!.from)}~${md(st!.to)})` : ""}</> : "지난 기록을 불러오는 중이에요"}</p>
        </div>
      </Sheet>
    </span>
  );
}
