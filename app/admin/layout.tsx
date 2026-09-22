import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "教師管理中心",
  description: "解題實驗室 2.0 · 教師與管理員後台",
  applicationName: "解題實驗室",
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, title: "解題實驗室", statusBarStyle: "black-translucent" },
  icons: { icon: "/admin-icon-192.png?v=150", apple: "/admin-icon-192.png?v=150" },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
