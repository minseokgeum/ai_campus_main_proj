// 첫 사용 · 알림 받기(피그마 531:6274). 사용자 결정(2026-11-20): 알림은 화면만 두고 실제로 보내지 않는다. 어느 단추든 홈으로.
import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function FirstAlerts() {
  await requireUser();
  return (
    <main className="start">
      <div className="intro">
        <div className="ibox"><div className="icard"><b>투자 브리핑 · 07:30</b><p><span>오늘 시가 예상이 나왔어요</span></p><p><span>내 종목 오늘 시가 예상</span><em className="up">+0.40%</em></p></div></div>
        <h1>{"오늘 시가 예상을\n알림으로 받을까요?"}</h1>
        <ul className="alist2">
          <li><b>07:30</b>오늘 시가 예상 범위가 나왔을 때</li>
          <li><b>08:11</b>NXT 체결가가 범위 밖인 종목이 있을 때</li>
          <li><b>09:05</b>실제 시가로 채점이 끝났을 때</li>
        </ul>
      </div>
      <div className="startbtns">
        <Link href="/" className="cta">알림 받기</Link>
        <Link href="/" className="tlinkc muted">나중에 할게요</Link>
      </div>
    </main>
  );
}
