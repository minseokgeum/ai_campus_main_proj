// 미리 만든 시연 계정(user1~user10, 예전 공용 guest). 여러 사람이 같은 아이디로 들어오므로 2026-11-26 사용자 결정으로 '보기 전용':
// 종목 추가·수정·삭제·처음 종목 고르기·회원 탈퇴를 막고 '시연 계정은 바꿀 수 없어요 · 먼저 둘러볼게요로 시작해 주세요'를 보여 준다(components/demolock.tsx).
// 사람마다 만드는 체험 계정(guest_…)은 각자 것이라 바꿀 수 있다.
export const DEMO_USERS = new Set(["user1", "user2", "user3", "user4", "user5", "user6", "user7", "user8", "user9", "user10", "guest"]);
export const isFixedDemo = (name?: string | null) => !!name && DEMO_USERS.has(name);
/** 둘러보기 체험 계정(guest_…): 바꾸기는 되지만 종목 추가는 막는다(2026-11-26 사용자 결정 — 뉴스는 시연 계좌 종목 중심으로 모아서 다른 종목은 뉴스가 비어 보임) */
export const isGuest = (name?: string | null) => !!name && name.startsWith("guest_");
