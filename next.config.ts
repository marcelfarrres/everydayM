import type { NextConfig } from "next";

/**
 * EverydayM Studio LAN mode: allow phones on the home WiFi (private IPv4
 * ranges) to load dev-only assets when the Studio runs on this PC.
 * Only affects `next dev`; never applies on Vercel (STUDIO_ENABLED is unset there).
 */
const studioLanOrigins =
  process.env.STUDIO_ENABLED === "true"
    ? [
        "192.168.*.*",
        "10.*.*.*",
        ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
      ]
    : [];

const nextConfig: NextConfig = {
  allowedDevOrigins: studioLanOrigins,
};

export default nextConfig;
