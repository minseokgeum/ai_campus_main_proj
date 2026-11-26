// 서비스 DB 연결(로그인·세션·보유 종목·관심 종목·보유 구성 기록이 있는 app 스키마). 서버에서만 쓰고 브라우저로 가지 않는다.
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
