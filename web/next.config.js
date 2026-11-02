/** @type {import('next').NextConfig} */
module.exports = {
  // The app doesn't use next/image, so this keeps the optimizer endpoint, the
  // subject of several Next.js advisories, out of use.
  images: { unoptimized: true },
};
