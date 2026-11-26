/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 讓手機用區域網路 IP 連進開發伺服器時，熱更新不被擋
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.*.*.*'],
};
export default nextConfig;
