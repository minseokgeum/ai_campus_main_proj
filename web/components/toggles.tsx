"use client";
// 알림 설정의 켜기·끄기(화면 상태만, 저장하지 않음)
import { useState } from "react";

const GROUPS = [
  { h: "아침 시가 예상", items: [{ k: "a0730", t: "06:30 오늘 시가 예상", d: "매일 아침 내 계좌 예상이 준비되면 알려요", on: true }] },
  { h: "장 시작 전 (08:11)", items: [
    { k: "out", t: "범위 밖 종목이 생기면", d: "NXT 08:10 체결가가 예상 범위를 벗어난 종목이 있으면 08:11에 알려요", on: true },
    { k: "low", t: "방향 유지 등급이 낮은 종목", d: "오늘 방향 유지 등급이 낮은 보유 종목이 있으면 알려요", on: false }] },
  { h: "확인 결과", items: [{ k: "check", t: "09:05 확인 결과", d: "실제 시가가 예상 범위 안에 들었는지 확인하면 알려요", on: false }] },
];

export function AlertToggles() {
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(GROUPS.flatMap((g) => g.items.map((i) => [i.k, i.on]))));
  const [scope, setScope] = useState<"hold" | "all">("hold");
  return (
    <div className="toggles">
      {GROUPS.map((g) => (
        <section key={g.h}>
          <h3>{g.h}</h3>
          {g.items.map((i) => (
            <label key={i.k} className="tg">
              <span><b>{i.t}</b><small>{i.d}</small></span>
              <input type="checkbox" role="switch" checked={on[i.k]} onChange={() => setOn({ ...on, [i.k]: !on[i.k] })} />
            </label>
          ))}
        </section>
      ))}
      <section>
        <h3>알림 받을 종목</h3>
        <div className="seg">
          <button type="button" className={scope === "hold" ? "on" : ""} onClick={() => setScope("hold")}>보유 종목만</button>
          <button type="button" className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>보유 + 관심</button>
        </div>
      </section>
    </div>
  );
}
