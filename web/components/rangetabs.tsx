"use client";
// 종목 상세 주가 기간 단추(2026-11-25): 누르면 보던 자리를 그대로 두고(맨 위로 올리지 않음) 그래프만 바꾼다.
// 새 기간 자료를 받는 동안(1초 안팎)은 이전 그래프가 보이므로, 누른 단추를 바로 선택된 모양으로 바꿔 반영 중임을 보여 준다.
import Link from "next/link";
import { useEffect, useState } from "react";

export function RangeTabs({ on, items }: { on: string; items: { key: string; label: string; href: string }[] }) {
  const [pick, setPick] = useState(on);
  useEffect(() => setPick(on), [on]);
  return (
    <div className="ranges">
      {items.map((x) => (
        <Link key={x.key} href={x.href} scroll={false} replace className={x.key === pick ? "on" : ""} aria-current={x.key === on ? "page" : undefined}
          onClick={() => setPick(x.key)}>{x.label}</Link>
      ))}
    </div>
  );
}
