"use client";
// 노란 띠(2026-11-25 사용자 시안 9장 '줄글 없는 버전 · 글을 그림과 이름표로'). 당신이 잠든 사이에 종목 카드 · 밤사이 종목 창 · 종목 상세 예측 창이 함께 쓴다.
//  · 띠 위 이름표: 06:30(예상 눈금) · 장전(청록 고리) · 실제(검은 점) · 평단(청록 선). 지난 표시는 흐리게(흐림은 '지난 표시' 한 가지 뜻).
//  · 띠 양 끝 %는 띠 바깥 옆에, 그 아래 양 끝 금액(수량 × 어제 종가 × %). 어제 종가는 회색 세로선 + 아래 이름표.
//  · 범례·근거 문장(80%·90%·띠는 06:30 그대로·장전이 띠 밖일 때)은 '예상 범위 ?' 설명 창으로.
//  · 끌어 보기(개발 메모): 손잡이는 평소에 없고, 띠(와 그 주변 줄)를 만지면 흰 원(24px, 그림자) + 위 말풍선("−4.0% → −218,400원").
//    끄는 동안 실시간으로 바뀌고, 띠 양 끝·어제 종가를 지날 때 살짝 진동. 손을 떼면 사라지고 값은 저장하지 않는다. 0.1% 단위, 그림 왼쪽 끝 ~ 오른쪽 끝.
//    카드를 처음 볼 때 한 번만 "띠를 눌러 끌어 보세요" 안내.
import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/sheet";

export type BandPhase = "pre" | "nxt" | "post";
const W = 342, PAD = 46, BY = 34;   // 그림 폭 · 양 옆 여백(끝 % 자리) · 띠 가운데 높이
const pc = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(1)}%`;
const won = (v: number) => { const r = Math.round(v); return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toLocaleString("ko-KR")}원`; };
let hintClaimed = false;   // 한 화면에서 안내는 카드 하나에만

export function YBand({ l, u, h, nxt, y, avg, phase, qty, pc: close, play = true, l90, u90, name }: {
  l: number; u: number; h: number; nxt?: number | null; y?: number | null; avg?: number | null;   // avg: 평단(어제 종가 대비 비율)
  phase: BandPhase; qty: number; pc: number; play?: boolean; l90?: number; u90?: number; name: string;
}) {
  // 눈금: 띠 · 어제 종가(0) · 표식을 모두 담는 범위에 양쪽 18% 여유(띠가 그림 폭을 넉넉히 쓰게, 시안처럼)
  const marks = [l, u, h, 0, nxt ?? 0, y ?? 0, avg != null && Math.abs(avg) < 0.3 ? avg : 0];
  const lo0 = Math.min(...marks), hi0 = Math.max(...marks), sp = Math.max(0.01, hi0 - lo0);
  const lo = lo0 - sp * 0.18, hi = hi0 + sp * 0.18;
  const m = Math.max(Math.abs(lo), Math.abs(hi));   // 끌기 값 한계(그림 끝)
  const X = (v: number) => PAD + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (W - 2 * PAD);
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hint, setHint] = useState(false);
  const lastZone = useRef<number | null>(null);
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
  const end = () => { setDrag(null); lastZone.current = null; };
  const seen = () => { if (hint) { setHint(false); try { localStorage.setItem("yband-hint", "1"); } catch { /* 무시 */ } } };

  // 띠 위 이름표: 겹치면 옆으로 비킨다(34px)
  type Tag = { x: number; t: string; c: string; b?: boolean };
  const past = (k: BandPhase) => (k === "pre" ? phase !== "pre" : k === "nxt" ? phase === "post" : false);
  const tags: Tag[] = [{ x: X(h), t: "06:30", c: past("pre") ? "#9aa5a8" : "#45555a" }];
  if (nxt != null && phase !== "pre") tags.push({ x: X(nxt), t: "장전", c: phase === "nxt" ? "#2e8a7e" : "#9fc9c1", b: phase === "nxt" });
  if (y != null && phase === "post") tags.push({ x: X(y), t: "실제", c: "#192d31", b: true });
  if (avg != null && avg >= lo && avg <= hi) tags.push({ x: X(avg), t: "평단", c: "#008c82", b: true });
  tags.sort((a, b) => a.x - b.x);
  for (let i = 1; i < tags.length; i++) if (tags[i].x - tags[i - 1].x < 34) tags[i].x = tags[i - 1].x + 34;
  if (tags.length && tags[tags.length - 1].x > W - 16) { const d = tags[tags.length - 1].x - (W - 16); tags.forEach((t) => (t.x -= d)); }
  const amt = qty > 0;
  return (
    <div className="yband">
      <div className="yb-h"><span>예상 범위</span><BandHelp l90={l90} u90={u90} />{hint && drag == null ? <span className="yb-hint">띠를 눌러 끌어 보세요</span> : null}</div>
      <div className="yb-wrap">
        {drag != null ? <span className="yb-bub" style={{ left: `${(X(drag) / W) * 100}%` }}>{pc(drag)}{amt ? <> → {won(qty * close * drag)}</> : null}</span> : null}
        <svg ref={svg} width="100%" viewBox={`0 0 ${W} 76`} className={`yb-svg${play ? " play" : ""}`}
          role={play ? "slider" : "img"} tabIndex={play ? 0 : undefined}
          aria-label={`${name} 예상 범위 ${pc(l)} ~ ${pc(u)}, 06:30 예상 ${pc(h)}${nxt != null && phase !== "pre" ? `, 장전 ${pc(nxt)}` : ""}${y != null && phase === "post" ? `, 실제 ${pc(y)}` : ""}${play ? ". 누르고 끌면 그 가격의 금액을 보여 줘요" : ""}`}
          aria-valuenow={play ? Math.round((drag ?? h) * 1000) / 10 : undefined}
          onPointerDown={play ? (e) => { seen(); svg.current?.setPointerCapture?.(e.pointerId); move(e.clientX); } : undefined}
          onPointerMove={play ? (e) => { if (drag != null) move(e.clientX); } : undefined}
          onPointerUp={play ? end : undefined} onPointerCancel={play ? end : undefined} onLostPointerCapture={play ? end : undefined}>
          <rect x={PAD - 6} y={BY - 2} width={W - 2 * PAD + 12} height={4} rx={2} fill="#eef1f2" />
          <line x1={X(0)} x2={X(0)} y1={BY - 14} y2={BY + 14} stroke="#c5cdcf" strokeWidth={1.2} />
          <rect x={X(l)} y={BY - 7} width={Math.max(4, X(u) - X(l))} height={14} rx={7} fill="#ffd970" />
          {/* 양 끝 %: 어제 종가 선이 글자 자리(48px 안)에 있으면 선 바깥으로 비킨다 */}
          <text x={0 < l && X(l) - X(0) < 48 ? X(0) - 6 : X(l) - 7} y={BY + 4} textAnchor="end" fontSize={12.5} fontWeight={700} fill="#192d31">{pc(l)}</text>
          <text x={0 > u && X(0) - X(u) < 48 ? X(0) + 6 : X(u) + 7} y={BY + 4} textAnchor="start" fontSize={12.5} fontWeight={700} fill="#192d31">{pc(u)}</text>
          {/* 06:30 예상 눈금(장전·채점 뒤엔 흐리게) */}
          <rect x={X(h) - 1.25} y={BY - 9} width={2.5} height={18} rx={1} fill={past("pre") ? "#b8c0c3" : "#2f3437"} />
          {avg != null && avg >= lo && avg <= hi ? <rect x={X(avg) - 1} y={BY - 10} width={2} height={20} fill="#008c82" /> : null}
          {nxt != null && phase !== "pre" ? <circle cx={X(nxt)} cy={BY} r={6} fill="#fff" stroke={phase === "nxt" ? "#2e8a7e" : "#a9d6cd"} strokeWidth={2.5} /> : null}
          {y != null && phase === "post" ? <circle cx={X(y)} cy={BY} r={5.5} fill="#192d31" stroke="#fff" strokeWidth={1.5} /> : null}
          {tags.map((t) => <text key={t.t} x={t.x} y={13} textAnchor="middle" fontSize={10.5} fontWeight={t.b ? 700 : 500} fill={t.c}>{t.t}</text>)}
          {amt ? <>
            <text x={X(l)} y={BY + 24} textAnchor="middle" fontSize={10.5} fill="#8a9598">{won(qty * close * l)}</text>
            <text x={X(u)} y={BY + 24} textAnchor="middle" fontSize={10.5} fill="#8a9598">{won(qty * close * u)}</text>
          </> : null}
          <text x={Math.min(W - 26, Math.max(26, X(0)))} y={74} textAnchor="middle" fontSize={10} fill="#9aa5a8">어제 종가</text>
          {drag != null ? <circle cx={X(drag)} cy={BY} r={12} fill="#fff" className="yb-knob" /> : null}
        </svg>
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
          <p><b>띠는 06:30 그대로예요</b> · 8시 장전 거래 뒤에도 바뀌지 않고, 9시 채점도 이 띠로 해요</p>
          <p><b>장전이 띠 밖이면</b> · {k != null ? <>10번 중 {k}번은 실제 시작도 띠 밖이었어요{st!.from && st!.to ? ` (${md(st!.from)}~${md(st!.to)})` : ""}</> : "지난 기록을 불러오는 중이에요"}</p>
        </div>
      </Sheet>
    </span>
  );
}
