import { Pool } from "pg";

// 오라클 서버 수집 DB(PostgreSQL)를 읽기 전용 계정으로 읽는다. 주소는 환경 변수 GNEWS_DB_READ_URL(브라우저로 가지 않음).
// 서버는 SSL만 받는다. 인증서가 공인 인증서가 아니라서 암호화만 하고 서버 확인은 하지 않는다(rejectUnauthorized: false).

let pool: Pool | null = null;

function connectionString(): string {
  const raw = process.env.GNEWS_DB_READ_URL;
  if (!raw) throw new Error("GNEWS_DB_READ_URL이 없다");
  const u = new URL(raw.replace(/^postgresql\+\w+:\/\//, "postgresql://")); // SQLAlchemy 형식(postgresql+psycopg)도 받는다
  u.search = ""; // sslmode 등은 아래 ssl 설정으로
  return u.toString();
}

export function db(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: connectionString(), ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
  }
  return pool;
}
