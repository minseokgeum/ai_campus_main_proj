// 로그인(시연용): 미리 만든 계정 10개(user1~user10, 비밀번호 1111). 비밀번호는 scrypt 해시로만 저장.
// 로그인하면 무작위 세션 번호를 app.sessions에 넣고 쿠키(sid, httpOnly)로 준다. 로그아웃하면 세션 줄을 지운다.
import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { appdb } from "@/lib/appdb";

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

/** 둘러보기: 공용 체험 계정(guest)으로 들어간다. 처음이면 시험 종목을 넣어 만든다 */
export async function guestLogin(sample: string[]): Promise<void> {
  const db = appdb();
  let r = await db.query("select id from app.users where username = 'guest'");
  if (!r.rows[0]) {
    r = await db.query("insert into app.users (username, password_hash) values ('guest', $1) on conflict (username) do update set username = excluded.username returning id",
      [hash(randomBytes(12).toString("hex"))]);
    for (const [i, code] of sample.entries())
      await db.query("insert into app.holdings (user_id, code, qty) values ($1, $2, $3) on conflict do nothing", [r.rows[0].id, code, 10 + ((i * 37) % 90)]);
  }
  await startSession(r.rows[0].id);
}

/** 회원 탈퇴: 보유·관심·세션·계정을 지운다(되돌릴 수 없음). 체험 계정(guest)은 계정만 남긴다 */
export async function deleteAccount(userId: number): Promise<void> {
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
