// 알림 설정(피그마 458:8801). 사용자 결정(2026-11-20): 화면만 두고 저장·발송은 하지 않는다.
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { AlertToggles } from "@/components/toggles";

export default async function AlertSettings() {
  await requireUser();
  return (
    <main className="sheet">
      <div className="shead"><Link href="/alerts" aria-label="뒤로">‹</Link><span className="ttl">알림 설정</span></div>
      <AlertToggles />
      <p className="fine">주말과 휴장일에는 알림을 보내지 않아요. 휴대폰 설정에서 앱 알림이 꺼져 있으면 받을 수 없어요.</p>
    </main>
  );
}
