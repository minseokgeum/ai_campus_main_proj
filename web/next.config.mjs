/** @type {import('next').NextConfig} */
const nextConfig = {
  // pg는 서버에서만 쓰고 번들에 넣지 않는다
  serverExternalPackages: ["pg"],
  // 특별한 날 달력(lib/marketdays.ts가 파일로 읽음)을 배포 묶음에 넣는다
  outputFileTracingIncludes: { "/**": ["./data/special_days.csv"] },
};

export default nextConfig;
