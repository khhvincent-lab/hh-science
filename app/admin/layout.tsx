import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "教師管理中心",
  description: "H.H. Science Lab 教師與管理員後台",
  applicationName: "Science Admin",
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Science Admin", statusBarStyle: "black-translucent" },
  icons: { apple: "/admin-icon-192.png" },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
