"use client";
// 화면을 불러오는 동안 보여 주는 뼈대(2026-11-26 사용자 요청 '동작 방식 점검 후 다 수정'). app 아래 불러오는 중 파일(loading.tsx)이 모두 이 부품을 쓴다.
// 가는 주소를 보고 모양을 고른다:
//  · 아래 탭 화면(홈 · 뉴스 · 밤사이 · 내 종목 · 보관 · 밤사이 기록): 회색 뼈대 + 아래 탭(가는 탭을 켠 채). 예전엔 아래 탭이 사라졌다 다시 나와 깜빡였다.
//  · 상세 화면(종목 상세 · 기사 · 알림 · 마이 · 모델 기록 · 미국 · 야간선물 · 설정 등): 그 화면 모양 뼈대가 누르는 즉시 제자리에서 서서히 뜨고, 진짜 화면도 그 자리에서 서서히
//    (2026-11-26 사용자 결정: 뼈대가 옆에서 밀려 들어오는 모양이 별로). 아래 탭은 그 화면에 원래 있을 때만. 예전엔 공통 뼈대가 나왔다가 진짜 화면이 늦게 밀려 들어왔다.
//  · 종목 추가 · 수량 수정: 같은 방식, 아래 탭 없음.
//  · 그 밖(로그인 · 시작 등): 예전 공통 뼈대.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BottomNav, type TabKey } from "@/components/navbar";

type Kind =
  | { k: "tab"; nav: TabKey }
  | { k: "sheet"; nav: TabKey | null | false; back: string; cls: string }   // nav: null = 아래 탭은 있고 켜진 탭 없음(마이), false = 아래 탭 없음
  | { k: "add"; back: string }
  | { k: "plain" };

function kindOf(p: string): Kind {
  const tabs: Record<string, TabKey> = { "/": "home", "/news": "news", "/night": "night", "/night/record": "night", "/mine": "mine", "/saved": "saved" };
  if (tabs[p]) return { k: "tab", nav: tabs[p] };
  let m: RegExpMatchArray | null;
  if (p === "/mine/add") return { k: "add", back: "/mine" };
  if (p === "/onboard/stocks") return { k: "add", back: "/start" };
  if ((m = p.match(/^\/mine\/([^/]+)\/edit$/))) return { k: "add", back: `/mine/${m[1]}` };
  if (/^\/mine\/[^/]+$/.test(p)) return { k: "sheet", nav: "mine", back: "/mine", cls: "sheet d4" };
  if (p.startsWith("/news/a/")) return { k: "sheet", nav: "news", back: "/news", cls: "sheet" };
  if (p === "/record") return { k: "sheet", nav: "night", back: "/night", cls: "sheet mrec" };
  if (p === "/my") return { k: "sheet", nav: null, back: "/", cls: "sheet" };
  if (/^\/(alerts|settings|docs|my\/withdraw)(\/|$)/.test(p)) return { k: "sheet", nav: false, back: "/", cls: "sheet" };
  return { k: "plain" };
}

const Sk = ({ h, w, r, mt }: { h: number; w?: number; r?: number; mt?: number }) => <div className="skel" style={{ height: h, width: w, borderRadius: r, marginTop: mt }} />;
const Blocks = () => <><Sk h={14} w={140} r={7} /><Sk h={36} w={200} r={10} mt={14} /><Sk h={52} mt={12} /><Sk h={150} r={18} mt={20} /><Sk h={96} mt={16} /><Sk h={96} mt={12} /></>;

export function RouteLoading() {
  const kind = kindOf(usePathname() ?? "/");
  if (kind.k === "tab" || kind.k === "plain") {
    return (
      <>
        <main className="scroll" aria-busy="true" aria-label="불러오는 중">
          <Sk h={44} mt={120} /><Sk h={150} r={18} /><Sk h={110} /><Sk h={110} />
        </main>
        {kind.k === "tab" ? <BottomNav active={kind.nav} /> : null}
      </>
    );
  }
  if (kind.k === "add") {
    return (
      <main className="addpage" aria-busy="true" aria-label="불러오는 중">
        <div className="addtop"><Link href={kind.back} aria-label="뒤로">‹</Link><b><i className="skel" style={{ display: "inline-block", width: 90, height: 18, verticalAlign: "middle" }} /></b></div>
        <Sk h={30} w={240} r={10} mt={12} /><Sk h={14} w={280} r={7} /><Sk h={52} mt={10} /><Sk h={52} />
      </main>
    );
  }
  return (
    <>
      <main className={kind.cls} aria-busy="true" aria-label="불러오는 중">
        <div className="shead"><Link href={kind.back} aria-label="뒤로">‹</Link><span className="ttl"><i className="skel" style={{ display: "inline-block", width: 110, height: 20, verticalAlign: "middle" }} /></span></div>
        <Blocks />
      </main>
      {kind.nav !== false ? <BottomNav active={kind.nav} /> : null}
    </>
  );
}
