import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "H.H. Science Lab 解題實驗室",
    short_name: "H.H. Science Lab",
    description: "自然科解題實驗室 v1",
    start_url: "/",
    display: "standalone",
    background_color: "#F5F4EF",
    theme_color: "#14335A",
    orientation: "portrait-primary",
    lang: "zh-TW",
    categories: ["education"],
    icons: [
      {
        src: "/icon-192.png?v=150",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png?v=150",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512-maskable.png?v=150",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
