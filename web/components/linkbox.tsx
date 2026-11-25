"use client";
// 내 종목 연결 그림의 칸·'모두 보기' 줄(components/links.tsx). 누르면 그 칸의 글자가 한글 이름 ↔ 미국 뉴스 검색어 원문으로 바뀐다.
// 한글 이름은 검색어를 옮긴 것이라 어색할 때 원문으로 확인할 수 있게(2026-11-22). 마우스 올리기에 기대지 않아 휴대폰에서도 같다.
// 이름이 길면(10자 넘으면) 글자를 줄여 두 줄까지, 영어 원문은 늘 작은 글자로. 원문이 길면(22자 넘으면) 아래 줄을 빼고 세 줄까지.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// 그림 하나(칸 묶음 · 모두 보기 · 관계도 창)를 한꺼번에 한글 ↔ 원문으로 바꾸는 상태. '가 ⇄ A' 단추가 바꾸고, 칸마다 누르는 것은 그 칸만 바꾼다
const Lang = createContext<{ en: boolean; set: (v: boolean) => void }>({ en: false, set: () => {} });

export function LinkLang({ children }: { children: ReactNode }) {
  const [en, set] = useState(false);
  return <Lang.Provider value={{ en, set }}>{children}</Lang.Provider>;
}

export function LangToggle() {
  const { en, set } = useContext(Lang);
  return (
    <button type="button" className={`lgtoggle ${en ? "on" : ""}`} aria-pressed={en} aria-label={en ? "한글 이름으로 보기" : "미국 뉴스 검색어 원문으로 보기"} onClick={() => set(!en)}>
      <span className={en ? "" : "cur"}>가</span><i aria-hidden>⇄</i><span className={en ? "cur" : ""}>A</span>
    </button>
  );
}

/** 칸 하나의 한글/원문 상태: 처음과 '가 ⇄ A'를 누를 때는 그림 전체를 따르고, 칸을 누르면 그 칸만 바뀐다 */
function useLang(): [boolean, (v: boolean) => void] {
  const { en: all } = useContext(Lang);
  const [en, setEn] = useState(all);
  useEffect(() => setEn(all), [all]);
  return [en, setEn];
}

/** 칸 하나(2026-11-22 모양 바꿈): 첫 줄 이름, 둘째 줄 관계(고객사·주요 사업 등, 예전엔 선 위 글자), 오른쪽 노란 숫자 = 밤사이 소식 수. 소식이 난 칸은 연한 노란 바탕 */
export function LinkBox({ name, sub, kind, n, terms, top, lead }: { name: string; sub: string; kind: string; n: number; terms: string[]; top: number; lead?: boolean }) {   // lead: 소식이 가장 많은 연결(민트 칸)
  const hot = n > 0;
  const [lang, setEn] = useLang();
  const can = terms.length > 0, en = lang && can;
  const text = en ? terms.join(" · ") : name;
  return (
    <div className={`lgbox ${hot ? "hot" : ""}${lead ? " lead" : ""} ${en ? `en ${text.length > 22 ? "enlong" : ""}` : text.length > 9 ? "long" : ""}`} style={{ top }}>
      <button type="button" className="lgbtn" disabled={!can} aria-pressed={en}
        aria-label={`${en ? `${text}, 미국 뉴스 검색어` : `${name}, ${kind}, ${sub}`}${hot ? `, 밤사이 소식 ${n}건` : ""}. 누르면 ${en ? "한글 이름으로" : "검색어 원문으로"}`} onClick={() => setEn(!en)}>
        <b>{text}</b><span>{en ? "미국 뉴스 검색어" : sub}</span>
      </button>
      {hot ? <em className="lgcnt" aria-hidden>{n}</em> : null}
    </div>
  );
}

export function LinkRow({ name, sub, terms, n }: { name: string; sub: string; terms: string[]; n: number }) {
  const [lang, setEn] = useLang();
  const en = lang && terms.length > 0;
  return (
    <li className={en ? "en" : ""}>
      <button type="button" className="lgrowbtn" disabled={!terms.length} aria-pressed={en} onClick={() => setEn(!en)}>
        <b>{en ? terms.join(" · ") : name}</b><span>{en ? "미국 뉴스 검색어" : sub}</span>
      </button>
      {n ? <em>소식 {n}</em> : null}
    </li>
  );
}
