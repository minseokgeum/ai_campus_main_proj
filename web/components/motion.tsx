"use client";
// 화면 전환 움직임(피그마 배포용 변경 기록 31·32·36, 2026-11-25 사용자 결정 '동작은 다 피그마 기준'). 움직임 모양은 globals.css '화면 전환 움직임'.
//  · 뒤로(‹, 기록 36): 앱 안에서 들어온 화면이면 브라우저 기록으로 뒤로(history back), 바로 열었으면 그 링크 주소로. 뒤로 갈 때 로그인·가입 화면만 반대 방향 움직임(상세는 2026-11-26부터 제자리에서 서서히).
//  · 아래에서 올라온 창 닫기(✕ · 닫기 · 확인 · 취소 · 바깥 · Esc): 창이 내려가고 배경이 밝아진 뒤(0.24초) 원래 닫기 동작을 한다.
//    창 부품이 여러 곳(components/sheet.tsx 외 8곳)에 따로 있어 여기서 한 번에 처리한다.
//  · 위 진행 막대(2026-11-26 사용자 요청 '화면 전환을 자연스럽고 부드럽게'): 앱 안 링크를 누르고 0.1초 안에 다음 화면이 안 나오면 맨 위에 가는 청록 막대가 차오르고,
//    화면이 바뀌면 끝까지 찬 뒤 사라진다(홈 카드 → 한 화면에 보기가 1초 넘게 아무 반응이 없던 것). 10초가 지나도 안 바뀌면 그냥 지운다.
//  · 같은 화면 안에서 주소 뒤 조건만 바뀔 때(보유↔관심 · 뉴스 탭 · 한 화면에 보기 등): 화면 틀이 새로 그려지지 않아 서서히 나타남이 없던 것을 0.15초 서서히 나타나게.
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

const CLOSE_MS = 240;
const DEPTH = "navDepth";
const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const getDepth = () => { try { return Number(sessionStorage.getItem(DEPTH) || 0); } catch { return 0; } };
const setDepth = (n: number) => { try { sessionStorage.setItem(DEPTH, String(Math.max(0, n))); } catch { /* 저장소를 못 쓰면 늘 링크로 */ } };
const markBack = () => { document.documentElement.dataset.nav = "back"; window.setTimeout(() => { delete document.documentElement.dataset.nav; }, 600); };

// 위 진행 막대
const BAR_DELAY = 100, BAR_GIVEUP = 10000;
let barShow = 0, barGiveUp = 0;
const bar = () => document.getElementById("navprog");
function barStart() {
  window.clearTimeout(barShow); window.clearTimeout(barGiveUp);
  barShow = window.setTimeout(() => { const b = bar(); if (!b) return; b.className = ""; void b.offsetWidth; b.className = "go"; }, BAR_DELAY);
  barGiveUp = window.setTimeout(barDone, BAR_GIVEUP);
}
function barDone() {
  window.clearTimeout(barShow); window.clearTimeout(barGiveUp);
  const b = bar();
  if (b?.className === "go") b.className = "done";
}
/** 앱 안 다른 주소로 가는 링크인지(새 창·내려받기·같은 주소·# 이동은 제외) */
function internalHref(a: HTMLAnchorElement): boolean {
  if (a.target && a.target !== "_self") return false;
  if (a.hasAttribute("download")) return false;
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin) return false;
  return u.pathname + u.search !== location.pathname + location.search;
}
/** 주소 뒤 조건 중 화면 내용을 바꾸는 것만 비교(open = 종목 창 열기는 뺀다) */
const qsKey = (q: string) => { const u = new URLSearchParams(q); u.delete("open"); u.sort(); return u.toString(); };

export function Motion() {
  const path = usePathname();
  const qs = useSearchParams();
  const prev = useRef<{ path: string; q: string } | null>(null);
  // 앱 안에서 몇 화면 들어왔는지(뒤로 단추가 history back을 써도 되는지) + 진행 막대 끝내기 + 같은 화면 안 조건 바뀜이면 서서히 나타나기
  useEffect(() => {
    if (document.documentElement.dataset.nav === "back") setDepth(getDepth() - 1);
    else setDepth(getDepth() + 1);
    barDone();
    const q = qsKey(qs.toString()), was = prev.current;
    prev.current = { path, q };
    if (was && was.path === path && was.q !== q && !reduce()) {
      document.querySelectorAll<HTMLElement>("main.scroll").forEach((m) => { m.style.animation = "none"; void m.offsetWidth; m.style.animation = ""; });
    }
  }, [path, qs]);
  useEffect(() => {
    const onPop = () => { markBack(); barStart(); };
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
        if (getDepth() > 0) { e.preventDefault(); e.stopPropagation(); history.back(); }   // 0 = 이 화면이 앱에서 처음 연 화면(이때는 링크로 가니 진행 막대를 여기서)
        else if (internalHref(a)) barStart();
        return;
      }
      // 2) 다른 화면으로 가는 링크: 진행 막대(창 닫기와는 겹치지 않음)
      const link = t.closest<HTMLAnchorElement>("a[href]");
      if (link && internalHref(link)) barStart();
      // 3) 창 닫기
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
  return <div id="navprog" aria-hidden />;
}
