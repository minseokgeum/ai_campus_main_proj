"use client";
// 아래에서 올라오는 창(피그마 '창' 화면들). 누르는 부품(trigger)과 창 안 내용(children)을 받는다. 바깥·✕·확인을 누르면 닫힌다.
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** 창을 화면 맨 위층(body)에 그린다. 누른 단추 옆에 그리면 둘레 글자 모양(굵게·회색·제목 크기)을 물려받아서. */
export function Layer({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? createPortal(children, document.body) : null;
}

export function Sheet({ trigger, title, sub, kicker, children, confirm, className, close = "x", center, cancel, xToo }: {
  trigger: ReactNode; title: string; sub?: string; kicker?: ReactNode; children: ReactNode; confirm?: string; className?: string;
  close?: "x" | "text" | "none";
  xToo?: boolean;   // 확인 단추가 있어도 ✕를 함께 둔다(피그마 812:1824)
  center?: boolean; cancel?: string;   // 가운데 작은 확인 창(피그마 539:6276 로그아웃 확인): 취소 단추 + children(실행 단추)   // 닫기 모양: ✕ · '닫기' 글자 · 없음(바깥을 누르면 닫힘)
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [open]);
  return (
    <>
      <button type="button" className={className ?? "sheet-trigger"} onClick={() => setOpen(true)}>{trigger}</button>
      {open ? (<Layer>
        {center ? (
          <div className="sheet-back center" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>
            <section className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
              <h2>{title}</h2>{sub ? <p>{sub}</p> : null}
              <div className="dbtns"><button type="button" className="dcancel" onClick={() => setOpen(false)}>{cancel ?? "취소"}</button>{children}</div>
            </section>
          </div>
        ) : (
        <div className="sheet-back" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>
          <section className="sheet-box" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
            <i className="grab" />
            <div className="sheet-head">
              <div>{kicker}<h2>{title}</h2>{sub ? <p>{sub}</p> : null}</div>
              {(confirm && !xToo) || close === "none" ? null : close === "text" ? <button type="button" className="txt" onClick={() => setOpen(false)}>닫기</button>
                : <button type="button" className="x" aria-label="닫기" onClick={() => setOpen(false)}>✕</button>}
            </div>
            <div className="sheet-body">{children}</div>
            {confirm ? <button type="button" className="sheet-ok" onClick={() => setOpen(false)}>{confirm}</button> : null}
          </section>
        </div>)}
      </Layer>) : null}
    </>
  );
}

/** 금액 숨기기(눈 단추): 화면의 금액(.amt)을 가린다. 이 기기에만 기억 */
export function MaskToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try { setOn(localStorage.getItem("mask") === "1"); } catch { /* 저장소를 못 쓰면 늘 보임 */ }
  }, []);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-mask", on);
    try { localStorage.setItem("mask", on ? "1" : "0"); } catch { /* 무시 */ }
  }, [on]);
  return (
    <button type="button" className="eye" aria-pressed={on} aria-label={on ? "금액 보기" : "금액 숨기기"} onClick={() => setOn(!on)}>
      <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden><path d="M1 6c2-3.3 4.8-5 8-5s6 1.7 8 5c-2 3.3-4.8 5-8 5S3 9.3 1 6Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="9" cy="6" r="2.3" fill="currentColor" />{on ? <path d="M2 11 16 1" stroke="currentColor" strokeWidth="1.5" /> : null}</svg>
    </button>
  );
}

/** 스크롤해서 큰 계좌 카드가 지나가면 위에 작게 붙는 계좌 줄(피그마 448:7077) */
export function StickyAccount({ targetId, children }: { targetId: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);
  return <div className={`stickacct ${show ? "on" : ""}`} aria-hidden={!show}>{children}</div>;
}
