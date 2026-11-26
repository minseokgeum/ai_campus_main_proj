// 로그인(시연용): 미리 만든 계정 10개(user1~user10, 비밀번호 1111). 비밀번호는 scrypt 해시로만 저장.
// 로그인하면 무작위 세션 번호를 app.sessions에 넣고 쿠키(sid, httpOnly)로 준다. 로그아웃하면 세션 줄을 지운다.
import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { appdb } from "@/lib/appdb";
import { logPortfolio } from "@/lib/portfolio";
import { isFixedDemo, isGuest } from "@/lib/demousers";

const COOKIE = "sid";
const DAYS = 30;

export type User = { id: number; username: string };

function verify(password: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const got = scryptSync(password, salt, 32);
  const want = Buffer.from(hash, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

function hash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`;
}

async function startSession(userId: number) {
  const sid = randomBytes(32).toString("hex");
  await appdb().query(`insert into app.sessions (id, user_id, expires_at) values ($1, $2, now() + interval '${DAYS} days')`, [sid, userId]);
  (await cookies()).set(COOKIE, sid, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: DAYS * 86400 });
}

/** 가입(인증 없음, 2026-11-20 결정): 아이디 4~20자(영문·숫자·_), 비밀번호 4자 이상. 이미 있으면 "taken" */
export async function signup(username: string, password: string): Promise<"ok" | "taken" | "bad"> {
  const u = username.trim();
  if (!/^[A-Za-z0-9_]{4,20}$/.test(u) || password.length < 4) return "bad";
  const r = await appdb().query("insert into app.users (username, password_hash) values ($1, $2) on conflict (username) do nothing returning id", [u, hash(password)]);
  if (!r.rows[0]) return "taken";
  await startSession(r.rows[0].id);
  return "ok";
}

/** 한국 날짜 6자리(YYMMDD). 체험 계정 이름에 넣어 언제 만든 계정인지 안다 */
function kstYmd6(d: Date = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${String(p.year).slice(2)}${p.month}${p.day}`;
}

/** 이틀 전(한국 날짜)까지 만든 체험 계정(guest_YYMMDD…)과 그 보유·관심·세션을 지운다. 예전 공용 계정 guest는 건드리지 않는다 */
async function cleanupGuests(): Promise<void> {
  const cut = kstYmd6(new Date(Date.now() - 86400000));
  const client = await appdb().connect();
  try {
    await client.query("begin");
    const { rows } = await client.query("select id from app.users where username ~ '^guest_[0-9]{6}' and substring(username from 7 for 6) < $1", [cut]);
    const ids = rows.map((x: { id: number }) => x.id);
    if (ids.length) {
      for (const t of ["app.holdings", "app.watch", "app.sessions"]) await client.query(`delete from ${t} where user_id = any($1)`, [ids]);
      await client.query("delete from app.users where id = any($1)", [ids]);
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

/** 둘러보기(2026-11-22 바꿈): 들어올 때마다 그 사람만의 체험 계정을 새로 만든다.
 *  2026-11-23: 시연 계좌 A·B·C(user1~3, data/demo_accounts.json) 중 고른 것의 복사본(보유·수량·평단·관심)으로 시작한다. 이름은 guest_날짜_계좌_무작위(예 guest_261124_A_1b2c3d).
 *  발표 때 QR로 여러 명이 함께 들어와도 서로 바꾼 보유·관심 종목이 섞이지 않게 한다(예전엔 공용 계정 guest 하나를 같이 썼다).
 *  이틀 지난 체험 계정은 이때 정리한다. 정리에 실패해도 들어오는 것은 막지 않는다 */
export async function guestLogin(key: string, sample: { code: string; qty: number; avg: number | null }[], watch: string[] = []): Promise<void> {
  try {
    await cleanupGuests();
  } catch (e) {
    console.error("체험 계정 정리 실패", e);
  }
  const db = appdb();
  let id: number | undefined;
  for (let i = 0; i < 3 && id === undefined; i++) {
    const name = `guest_${kstYmd6()}_${key}_${randomBytes(3).toString("hex")}`;
    const r = await db.query("insert into app.users (username, password_hash) values ($1, $2) on conflict (username) do nothing returning id",
      [name, hash(randomBytes(12).toString("hex"))]);
    id = r.rows[0]?.id;
  }
  if (id === undefined) throw new Error("체험 계정을 만들지 못했어요");
  for (const h of sample)
    await db.query("insert into app.holdings (user_id, code, qty, avg_price) values ($1, $2, $3, $4) on conflict do nothing", [id, h.code, h.qty, h.avg]);
  for (const code of watch)
    await db.query("insert into app.watch (user_id, code) values ($1, $2) on conflict do nothing", [id, code]);
  // 보유 기록: 고른 계좌 복사본을 '처음부터' 유효한 구성으로(시연 시각을 과거로 돌려도 같은 종목, 2026-11-23)
  const client = await db.connect();
  try { await logPortfolio(client, id, "-infinity"); } finally { client.release(); }
  await startSession(id);
}

/** 회원 탈퇴: 보유·관심·세션·계정을 지운다(되돌릴 수 없음). 예전 공용 체험 계정(guest)은 계정만 남기고, 사람마다 만든 체험 계정(guest_…)은 모두 지운다 */
export async function deleteAccount(userId: number): Promise<void> {
  const who = await appdb().query("select username from app.users where id = $1", [userId]);
  if (isFixedDemo(who.rows[0]?.username)) return;   // 시연 계정은 탈퇴(삭제)할 수 없다(2026-11-26)
  const client = await appdb().connect();
  try {
    await client.query("begin");
    for (const t of ["app.holdings", "app.watch", "app.sessions"]) await client.query(`delete from ${t} where user_id = $1`, [userId]);
    await client.query("delete from app.users where id = $1 and username <> 'guest'", [userId]);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
  (await cookies()).delete(COOKIE);
}

/** 맞으면 세션을 만들고 true */
export async function login(username: string, password: string): Promise<boolean> {
  const { rows } = await appdb().query("select id, password_hash from app.users where username = $1", [username.trim()]);
  if (!rows[0] || !verify(password, rows[0].password_hash)) return false;
  await startSession(rows[0].id);
  return true;
}

/** 시연 계정 바로 바꾸기(2026-11-25, 마이 화면): 지금 로그인한 계정이 시연 계정일 때만, 비밀번호 없이 user1~user3 중 하나로 세션을 바꾼다.
 *  시연 시각(demo_at 쿠키)은 그대로 둔다. 바꾸면 true */
export async function switchDemoUser(target: string): Promise<boolean> {
  const { isDemoName } = await import("@/lib/clock");
  const me = await currentUser();
  if (!me || !isDemoName(me.username) || !["user1", "user2", "user3"].includes(target) || me.username === target) return false;
  const { rows } = await appdb().query("select id from app.users where username = $1", [target]);
  if (!rows[0]) return false;
  const old = (await cookies()).get(COOKIE)?.value;
  if (old) await appdb().query("delete from app.sessions where id = $1", [old]);
  await startSession(rows[0].id);
  return true;
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (sid) await appdb().query("delete from app.sessions where id = $1", [sid]);
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const sid = (await cookies()).get(COOKIE)?.value;
  if (!sid) return null;
  const { rows } = await appdb().query(
    "select u.id, u.username from app.sessions s join app.users u on u.id = s.user_id where s.id = $1 and s.expires_at > now()", [sid]);
  return rows[0] ?? null;
}

/** 로그인하지 않았으면 시작 화면으로 */
export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/start");
  return u;
}

/** 지금 로그인한 사람이 미리 만든 시연 계정(user1~10, guest)인지 — 보기 전용(lib/demousers.ts) */
export async function demoLocked(): Promise<boolean> {
  return isFixedDemo((await currentUser())?.username);
}

/** 지금 로그인한 사람이 둘러보기 체험 계정인지 — 종목 추가 막기(lib/demousers.ts) */
export async function guestNoAdd(): Promise<boolean> {
  return isGuest((await currentUser())?.username);
}

