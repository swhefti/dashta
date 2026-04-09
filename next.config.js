/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workaround: Next.js only looks for app/ at root or src/app/.
  // We symlink src/app -> src/dashboard/app so our code stays organized.
};

module.exports = nextConfig;
