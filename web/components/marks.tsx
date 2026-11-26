// 아침 세 값 표식(2026-11-26 사용자 결정 'E안'): ① 06:30 첫 예상(진회색 번호 원) · ② 08:11 2차 예상(청록 번호 원) · 실제 시가(속 빈 빨간 원).
// 노란 띠(components/yband.tsx)와 세로 그림들(밤사이 '종목별 오늘 예상' · 종목 상세 '지난 20거래일' · 밤사이 기록 '종목별 보기')이 같이 쓴다.
// 지난 표식은 오래될수록 연하게(age 1 = 한 단계 전 0.5 · age 2 = 두 단계 전 0.25). s = 크기 배율, num = 안에 번호를 쓸지.
// 번호는 노란 띠에만(2026-11-26 사용자 결정): 밤사이 막대 그림은 같은 원에 번호만 빼고, 날짜가 촘촘한 그림('지난 20거래일' · 기록 '종목별 보기')은 작은 점(MiniPre) · 작은 빨간 원(MiniPost).

export const RED = "#e5484d";
export const AGE_OP = [1, 0.5, 0.25];     // 지금 · 한 단계 전 · 두 단계 전
export type MarkKind = "pre" | "nxt" | "post";

/** 흰 바탕을 먼저 깔고 그 위를 연하게 해서 노란 띠·막대 위에서도 탁해지지 않게 */
export function Mark({ k, x, y, age = 0, s = 1, num = true }: { k: MarkKind; x: number; y: number; age?: number; s?: number; num?: boolean }) {
  if (k === "post") return <circle cx={x} cy={y} r={6.5 * s} fill="#fff" stroke={RED} strokeWidth={3 * s} />;
  const c = k === "pre" ? "#2f3437" : "#2e8a7e";
  const fs = Math.max(8, 10 * s);   // 번호 글씨는 8px 아래로 줄이지 않는다
  return (
    <g>
      <circle cx={x} cy={y} r={8 * s} fill="#fff" />
      <g opacity={AGE_OP[Math.min(2, age)]}>
        <circle cx={x} cy={y} r={8 * s} fill="#fff" stroke={c} strokeWidth={Math.max(1.5, 2 * s)} />
        {num ? <text x={x} y={y + fs * 0.36} textAnchor="middle" fontSize={fs} fontWeight={800} fill={c}>{k === "pre" ? 1 : 2}</text> : null}
      </g>
    </g>
  );
}

/** 범례·아래 칸에 쓰는 작은 표식 */
export const MarkIcon = ({ k, size = 16, num = true }: { k: MarkKind; size?: number; num?: boolean }) => <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden><Mark k={k} x={10} y={10} num={num} /></svg>;

/** 촘촘한 그림용: 06:30 예상 = 진회색 꽉 찬 점(지름 6px, 실제 시가가 나온 날은 연하게) · 실제 시가 = 빨간 빈 원(바깥 지름 8px, 선 1.8px) */
export const MiniPre = ({ x, y, age = 0 }: { x: number; y: number; age?: number }) => <circle cx={x} cy={y} r={3} fill="#2f3437" opacity={AGE_OP[Math.min(2, age)]} />;
export const MiniPost = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={3.1} fill="#fff" stroke={RED} strokeWidth={1.8} />;
export const MiniIcon = ({ k }: { k: "pre" | "post" }) => <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>{k === "pre" ? <MiniPre x={5} y={5} /> : <MiniPost x={5} y={5} />}</svg>;
