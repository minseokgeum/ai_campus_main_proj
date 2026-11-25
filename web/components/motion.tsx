"use client";
// 화면 전환 움직임(피그마 배포용 변경 기록 31·32·36, 2026-11-25 사용자 결정 '동작은 다 피그마 기준'). 움직임 모양은 globals.css '화면 전환 움직임'.
//  · 뒤로(‹, 기록 36): 앱 안에서 들어온 화면이면 브라우저 기록으로 뒤로(history back), 바로 열었으면 그 링크 주소로. 뒤로 갈 때는 반대 방향 움직임.
//  · 아래에서 올라온 창 닫기(✕ · 닫기 · 확인 · 취소 · 바깥 · Esc): 창이 내려가고 배경이 밝아진 뒤(0.24초) 원래 닫기 동작을 한다.
//    창 부품이 여러 곳(components/sheet.tsx 외 8곳)에 따로 있어 여기서 한 번에 처리한다.
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const CLOSE_MS = 240;
const DEPTH = "navDepth";
const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const getDepth = () => { try { return Number(sessionStorage.getItem(DEPTH) || 0); } catch { return 0; } };
const setDepth = (n: number) => { try { sessionStorage.setItem(DEPTH, String(Math.max(0, n))); } catch { /* 저장소를 못 쓰면 늘 링크로 */ } };
const markBack = () => { document.documentElement.dataset.nav = "back"; window.setTimeout(() => { delete document.documentElement.dataset.nav; }, 600); };

export function Motion() {
  const path = usePathname();
  const qs = useSearchParams();
  // 앱 안에서 몇 화면 들어왔는지(뒤로 단추가 history back을 써도 되는지)
  useEffect(() => {
    if (document.documentElement.dataset.nav === "back") setDepth(getDepth() - 1);
    else setDepth(getDepth() + 1);
  }, [path, qs]);
  useEffect(() => {
    const onPop = () => markBack();
    window.addEventListener("popstate", onPop);
    // 첫 화면은 들어온 화면 수 0부터(새로 열거나 새로 고침)
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav && nav.type !== "back_forward") setDepth(0);
    let passing = false;
    const onClick = (e: MouseEvent) => {
      if (passing || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const t = e.target as Element | null;
      if (!t) return;
      // 1) 뒤로 단추
      const a = t.closest<HTMLAnchorElement>('a[aria-label="뒤로"], a.hback, .shead > a:first-child, a.backlink');
      if (a && !/^이전/.test(a.getAttribute("aria-label") ?? "") && (a.textContent?.trim() === "‹" || a.getAttribute("aria-label") === "뒤로")) {
        markBack();
        if (getDepth() > 0) { e.preventDefault(); e.stopPropagation(); history.back(); }   // 0 = 이 화면이 앱에서 처음 연 화면
        return;
      }
      // 2) 창 닫기
      const back = t.closest<HTMLElement>(".sheet-back");
      if (!back || back.classList.contains("closing") || reduce()) return;
      const closer = t === back ? back : t.closest<HTMLElement>('button.x, button.txt, button.sheet-ok, button.dcancel, button[aria-label="닫기"], .sheet-close');
      if (!closer || !back.contains(closer)) return;
      e.preventDefault(); e.stopPropagation();
      back.classList.add("closing");
      window.setTimeout(() => { passing = true; try { closer.click(); } finally { passing = false; } }, CLOSE_MS);
    };
    const onKey = (e: KeyboardEvent) => {
      if (passing || e.key !== "Escape" || reduce()) return;
      const all = document.querySelectorAll<HTMLElement>(".sheet-back:not(.closing)");
      const back = all[all.length - 1];
      if (!back) return;
      e.stopImmediatePropagation();
      back.classList.add("closing");
      window.setTimeout(() => { passing = true; try { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } finally { passing = false; } }, CLOSE_MS);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("popstate", onPop); document.removeEventListener("click", onClick, true); document.removeEventListener("keydown", onKey, true); };
  }, []);
  return null;
}
