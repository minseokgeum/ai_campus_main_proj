/** @type {import('next').NextConfig} */
const nextConfig = {
  // pg는 서버에서만 쓰고 번들에 넣지 않는다
  serverExternalPackages: ["pg"],
};

export default nextConfig;
