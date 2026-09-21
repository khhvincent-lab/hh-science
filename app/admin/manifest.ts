import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/admin",
    name: "H.H. Science Lab Admin 教師管理中心",
    short_name: "Science Admin",
    description: "教師與管理員後台",
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    background_color: "#14335A",
    theme_color: "#14335A",
    orientation: "portrait-primary",
    lang: "zh-TW",
    categories: ["education", "productivity"],
    icons: [
      { src: "/admin-icon-192.png?v=150", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/admin-icon-512.png?v=150", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/admin-icon-512-maskable.png?v=150", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
