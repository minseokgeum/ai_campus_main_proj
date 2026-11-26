"use client";
// 밤사이 '종목별 오늘 예상' 세로 막대 그래프(피그마 배포용 변경 기록 45, 제안 1128:1658 · 확인 뒤 1128:2328, 2026-11-25 반영).
// 종목 하나 = 노란 세로 막대(06:30 예상 범위 80%, 목록의 작은 띠와 같은 값) + 예상 시가 표식 하나(노란 띠와 같은 표식, components/marks.tsx):
// 08:11 뒤 장전 가격이 있으면 2차 예상(청록 원, = 08:10 장전 가격, 2026-11-25 팀원 기준), 없으면 06:30 예상(진회색 원). 두 예상을 함께 찍지 않고, 원 안 번호도 쓰지 않는다(2026-11-26 사용자 결정).
// 막대 위에 예상 %(장전) 또는 '범위 안/밖' + 실제 %(확인 뒤), 아래 줄에 종목 이름. 확인 뒤에는 실제 시가(속 빈 빨간 원)를 맨 위에, 예상 표식은 연하게(0.5).
// 순서는 받은 그대로(보유 금액 큰 순은 부르는 쪽에서), 범위 없는 종목은 맨 오른쪽 연회색 칸. 한 칸 56px, 옆으로 넘기고 오른쪽 세로 눈금은 고정.
// 세로 눈금: 5% 단위, 보이는 값 중 최댓값을 5 단위로 올림(최소 +5%), 최솟값을 내림(최소 −5%). 막대를 누르면 그 종목 창.
import { colorOf } from "@/components/stockpanel";
import { Mark, MarkIcon } from "@/components/marks";

const p1 = (v: number) => { const r = Math.round(v * 1000) / 10; return r === 0 ? "0.0%" : `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(1)}%`; };   // 막대 위 %는 한 자리(피그마)

export type BarRow = { code: string; name: string; l: number | null; u: number | null; line: number | null; nx?: boolean; open: number | null; in80: boolean | null };

const COL = 56, PT = 44, PH = 180, NAME = 36;

export function NightBars({ rows, post, title, note, onPick }: { rows: BarRow[]; post: boolean; title: string; note: string; onPick: (code: string) => void }) {
  if (!rows.length) return null;
  const has = (r: BarRow) => r.l != null && r.u != null;
  const list = [...rows.filter(has), ...rows.filter((r) => !has(r))];
  const vals = list.flatMap((r) => [r.l, r.u, r.line, post ? r.open : null]).filter((v): v is number => v != null).map((v) => v * 100);
  const top = Math.max(5, Math.ceil(Math.max(0, ...vals) / 5) * 5), bot = Math.min(-5, Math.floor(Math.min(0, ...vals) / 5) * 5);
  const Y = (v: number) => PT + ((top - v * 100) / (top - bot)) * PH;
  const ticks: number[] = [];
  for (let t = top; t >= bot; t -= 5) ticks.push(t);
  const H = PT + PH + NAME;
  return (
    <section className="vbars" aria-label={title}>
      <div className="vb-h"><b>{title}</b><span>{note}</span></div>
      <div className="vb-wrap" style={{ height: H }}>
        <div className="vb-scroll">
          <div className="vb-in" style={{ width: list.length * COL, height: H }}>
            {ticks.map((t) => <i key={t} className={t === 0 ? "vb-zero" : "vb-grid"} style={{ top: Y(t / 100) }} />)}
            {list.map((r, k) => {
              const ok = has(r);
              const y1 = ok ? Y(r.u!) : 0, y2 = ok ? Y(r.l!) : 0;
              const scored = post && r.open != null;
              const lab = scored ? r.open! : r.line;
              const head = Math.min(y1, r.line != null ? Y(r.line) - 9 : y1, scored ? Y(r.open!) - 8 : y1);   // 막대·표식 중 가장 위 끝(글씨를 그 위에)
              return (
                <button key={r.code} type="button" className="vb-col" style={{ left: k * COL, height: H }} onClick={() => onPick(r.code)} aria-label={`${r.name} 종목 창 열기`}>
                  {ok ? <>
                    <span className="vb-bar" style={{ top: y1, height: Math.max(4, y2 - y1) }} />
                    {r.line != null ? <svg className="vb-mk" style={{ top: Y(r.line) - 10 }} width="20" height="20" viewBox="0 0 20 20" aria-hidden><Mark k={r.nx ? "nxt" : "pre"} x={10} y={10} age={scored ? 1 : 0} num={false} /></svg> : null}
                    {scored ? <svg className="vb-mk" style={{ top: Y(r.open!) - 10 }} width="20" height="20" viewBox="0 0 20 20" aria-hidden><Mark k="post" x={10} y={10} /></svg> : null}
                    {lab != null ? (
                      <span className="vb-lab" style={{ top: head - (scored ? 34 : 18) }}>
                        {scored ? <em className={r.in80 ? "in" : "out"}>{r.in80 ? "범위 안" : "범위 밖"}</em> : null}
                        <b style={{ color: colorOf(lab) }}>{p1(lab)}</b>
                      </span>
                    ) : null}
                  </> : <span className="vb-none" style={{ top: Y(0) - 20 }}>범위<br />없음</span>}
                  <span className="vb-name" style={{ top: PT + PH + 6 }}>{r.name.replace(/([A-Za-z0-9])([가-힣])/g, "$1\u200b$2")}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="vb-axis">
          {ticks.map((t) => <span key={t} className={t === 0 ? "z" : ""} style={{ top: Y(t / 100) - 7 }}>{t > 0 ? `+${t}%` : t < 0 ? `−${-t}%` : "0%"}</span>)}
        </div>
      </div>
      <div className="vb-leg">
        {list.some((r) => r.line != null && !r.nx) ? <span><MarkIcon k="pre" num={false} />06:30 예상</span> : null}
        {list.some((r) => r.line != null && r.nx) ? <span><MarkIcon k="nxt" num={false} />08:11 2차 예상</span> : null}
        {post ? <span><MarkIcon k="post" />실제 시가</span> : null}
        <span><i className="b" />예상 범위</span>
        <span><i className="z" />0% = 어제 종가</span>
      </div>
      <p className="fine">범위 없는 종목은 맨 오른쪽 · 막대를 누르면 그 종목 창이 열려요</p>
    </section>
  );
}
