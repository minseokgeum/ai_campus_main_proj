// 노란 띠 카드의 상태 한 줄 글(2026-11-25 사용자 시안). 서버 화면(당신이 잠든 사이에)과 밤사이 종목 창이 함께 쓴다(그래서 "use client" 없이).
import type { ReactNode } from "react";

/** 상태 한 줄의 방향 등급(시안 "장전 방향 유지 · 높음 96.5%"): 등급과 확률만 굵게(청록). 문턱 처리는 lib/trust gradeText와 같다 */
export function gradeLine(grade: string | null, p: number | null, nxt: number | null): ReactNode {
  if (nxt === 0) return "장전 보합 · 방향 등급 없음";
  if (!grade) return "방향 유지 등급 미산출";
  const per = p != null && Number.isFinite(p) && p >= 0 && p <= 1 ? (p * 100).toFixed(1) : null;
  const tail = per == null ? "" : grade === "낮음" && per === "75.0" ? " 75% 미만" : grade === "보통" && per === "90.0" ? " 90% 미만" : per === "100.0" ? " 99.9% 이상" : ` ${per}%`;
  return <>장전 방향 유지 · <b>{grade}{tail}</b></>;
}

/** 채점 뒤 상태 한 줄: 띠 안/밖 · 예상(2차 예상, 없으면 06:30)보다 몇 %p */
export function postLine(y: number, est: number, l: number, u: number): ReactNode {
  const d = Math.round((y - est) * 1000) / 10, inb = l <= y && y <= u;
  return <><b className={inb ? "in" : "out"}>{inb ? "띠 안" : "띠 밖"}</b> · {d === 0 ? "예상과 같게" : `예상보다 ${Math.abs(d).toFixed(1)}%p ${d > 0 ? "높게" : "낮게"}`}</>;
}
