// 야간선물 창 보도량 막대를 눌렀을 때 그 15분에 나온 미국 기사 목록(2026-11-26 사용자 요청, components/scrub.tsx가 부른다).
// s = 야간선물 시작 시각(ISO, 18:00 KST), k = 15분 칸 번호(0~47). 내 종목(보유·관심) 이름을 붙이려고 로그인한 사람만.
import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { portfolio, uStock } from "@/lib/portfolio";
import { newsAt } from "@/lib/news";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ list: [] }, { status: 401 });
  const s = new Date(req.nextUrl.searchParams.get("s") ?? "");
  const k = Number(req.nextUrl.searchParams.get("k"));
  if (Number.isNaN(s.getTime()) || !Number.isInteger(k) || k < 0 || k > 47) return NextResponse.json({ list: [] }, { status: 400 });
  const pf = await portfolio(user.id);
  const codes = [...pf.holdings.map((h) => h.code), ...pf.watch];
  const list = (await newsAt(s, k, codes)).map((a) => ({ ...a, mine: a.mine.map((c) => uStock(c)?.name ?? c) }));
  return NextResponse.json({ list });
}
