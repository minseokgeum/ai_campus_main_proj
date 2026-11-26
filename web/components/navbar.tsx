// 아래 메뉴(다섯 탭). 서버 화면과 불러오는 중 화면(components/routeloading.tsx)이 같이 쓴다 — 서버 전용 자료를 불러오지 않게 따로 둔 파일(2026-11-26, components/ui.tsx에서 옮김).
import Link from "next/link";

// 아이콘(피그마 배포/하단 메뉴 771:173, 변경 기록 33 '투톤', 2026-11-25 반영): 선택 안 됨 = 회색 선만, 선택됨 = 민트 면 + 청록 선.
// 두 가지 색이라 한 색으로 칠하는 마스크 대신 탭마다 파일 두 개(public/icons/nav-*.svg, nav-*-on.svg)
const TABS = [
  { key: "home", href: "/", label: "홈" },
  { key: "news", href: "/news", label: "뉴스 브리핑" },
  { key: "night", href: "/night", label: "밤사이" },
  { key: "mine", href: "/mine", label: "내 종목" },
  { key: "saved", href: "/saved", label: "보관" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

/** 계좌 고르기(a)는 메뉴를 옮겨도 따라간다 */
export function withAcct(href: string, acct?: string) {
  return acct ? `${href}${href.includes("?") ? "&" : "?"}a=${acct}` : href;
}

export function BottomNav({ active, acct }: { active: TabKey | null; acct?: string }) {   // null: 마이처럼 다섯 탭에 속하지 않는 화면(선택 없음)
  return (
    <nav className="nav" aria-label="아래 메뉴">
      {TABS.map((t) => (
        <Link key={t.key} href={withAcct(t.href, acct)} className={t.key === active ? "on" : ""} aria-current={t.key === active ? "page" : undefined}>
          <img className="ic" src={`/icons/nav-${t.key}${t.key === active ? "-on" : ""}.svg`} alt="" width={24} height={24} aria-hidden />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

