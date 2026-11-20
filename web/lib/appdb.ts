import { Pool } from "pg";

// 서비스 계정(gnews_app): app 스키마(로그인·보유 종목)는 읽고 쓰고, 뉴스 표는 읽기만. 주소는 환경 변수 GNEWS_APP_DB_URL.
let pool: Pool | null = null;

export function appdb(): Pool {
  if (!pool) {
    const raw = process.env.GNEWS_APP_DB_URL;
    if (!raw) throw new Error("GNEWS_APP_DB_URL이 없다");
    const u = new URL(raw.replace(/^postgresql\+\w+:\/\//, "postgresql://"));
    u.search = "";
    pool = new Pool({ connectionString: u.toString(), ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
  }
  return pool;
}
