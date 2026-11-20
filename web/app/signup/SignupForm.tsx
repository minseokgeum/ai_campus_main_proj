"use client";
// 가입 → 약관 동의 창(피그마 오버레이 · 약관 동의 바텀 시트 534:6290) → '동의하고 시작하기'로 가입 → 첫 사용 · 보유 종목 등록
import { useRef, useState } from "react";
import { DOCS } from "@/lib/docs";
import { Layer } from "@/components/sheet";

const ITEMS = [
  { k: "terms", t: "(필수) 서비스 이용약관", req: true, doc: "terms" },
  { k: "privacy", t: "(필수) 개인정보 수집·이용", req: true, doc: "privacy" },
  { k: "alarm", t: "(선택) 아침 알림 받기", req: false },
  { k: "event", t: "(선택) 이벤트·혜택 소식 받기", req: false },
] as const;

export function SignupForm({ action, err }: { action: (f: FormData) => Promise<void>; err?: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [doc, setDoc] = useState<"terms" | "privacy" | null>(null);
  const [on, setOn] = useState<Record<string, boolean>>({ terms: false, privacy: false, alarm: true, event: false });
  const all = ITEMS.every((i) => on[i.k]);
  const ok = ITEMS.filter((i) => i.req).every((i) => on[i.k]);
  return (
    <form ref={form} action={action} className="lform" onSubmit={(e) => { if (!ok) { e.preventDefault(); if (form.current?.reportValidity()) setOpen(true); } }}>
      <label>아이디<input name="id" autoComplete="username" placeholder="영문·숫자 4~20자" required /></label>
      <label>비밀번호<input name="pw" type="password" autoComplete="new-password" placeholder="4자 이상" required /></label>
      <label>비밀번호 확인<input name="pw2" type="password" autoComplete="new-password" required /></label>
      <input type="hidden" name="agree" value={ok ? "on" : ""} />
      {err ? <p className="err" role="alert">{err}</p> : null}
      <button type="submit" className="primary">가입하기</button>
      {open ? (
        <Layer><div className="sheet-back" onClick={() => setOpen(false)}>
          <section className="sheet-box" role="dialog" aria-modal="true" aria-label="약관 동의" onClick={(e) => e.stopPropagation()}>
            <i className="grab" />
            {doc ? (
              <>
                <div className="sheet-head"><div><h2>{DOCS[doc].title}</h2></div><button type="button" className="txt" onClick={() => setDoc(null)}>뒤로</button></div>
                <div className="docbody">{DOCS[doc].body.map(([h, p], i) => <section key={i}><h3>{h}</h3><p>{p}</p></section>)}</div>
              </>
            ) : (
              <>
                <div className="sheet-head"><div><h2>서비스 이용에 동의해 주세요</h2></div></div>
                <label className="agall"><input type="checkbox" checked={all} onChange={() => setOn(Object.fromEntries(ITEMS.map((i) => [i.k, !all])))} /> 모두 동의 (선택 포함)</label>
                {ITEMS.map((i) => (
                  <div key={i.k} className="agrow">
                    <label><input type="checkbox" checked={on[i.k]} onChange={() => setOn({ ...on, [i.k]: !on[i.k] })} /> {i.t}</label>
                    {"doc" in i ? <button type="button" className="txt" onClick={() => setDoc(i.doc)}>보기 ›</button> : null}
                  </div>
                ))}
                <button type="button" className="cta" disabled={!ok} onClick={() => { setOpen(false); setTimeout(() => form.current?.requestSubmit(), 0); }}>동의하고 시작하기</button>
              </>
            )}
          </section>
        </div></Layer>
      ) : null}
    </form>
  );
}
