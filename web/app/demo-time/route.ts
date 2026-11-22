// 시연 시각 고르기: /demo-time?at=YYYYMMDDHHmm&back=/ (at=off면 지금으로). 시연 계정이 아니거나 지금보다 뒤 시각이면 lib/clock이 무시한다.
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, fromStamp } from "@/lib/clock";

export async function GET(req: NextRequest) {
  const at = req.nextUrl.searchParams.get("at") ?? "off";
  const back = req.nextUrl.searchParams.get("back") ?? "/";
  const res = NextResponse.redirect(new URL(back.startsWith("/") && !back.startsWith("//") ? back : "/", req.url));
  if (at === "off" || !fromStamp(at)) res.cookies.delete(DEMO_COOKIE);
  else res.cookies.set(DEMO_COOKIE, at, { path: "/", maxAge: 60 * 60 * 12, httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:" });
  return res;
}
