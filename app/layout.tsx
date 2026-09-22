import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./v2.css";
import PwaRegister from "@/components/pwa-register";

export const metadata: Metadata = {
  title: {
    default: "解題實驗室",
    template: "%s | 解題實驗室",
  },
  description: "解題實驗室 2.0 · 自然科 AI 解題學習平台",
  icons: { icon: "/icon.png?v=200", apple: "/apple-icon.png?v=200", shortcut: "/favicon.ico?v=200" },
  applicationName: "解題實驗室",
  appleWebApp: {
    capable: true,
    title: "解題實驗室",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { color: "#101B2B" },
  ],
};

const themeScript = `
  (() => {
    try {
      const saved = localStorage.getItem("hh-science-theme");
      const legacy = { white:"nordic", oatmeal:"nordic", sage:"midnight", ocean:"midnight", graphite:"obsidian", burgundy:"gold", light:"nordic", dark:"midnight" };
      const valid = ["midnight", "nordic", "aurora", "gold", "obsidian"];
      const migrated = legacy[saved] || saved;
      const theme = valid.includes(migrated) ? migrated : "midnight";
      document.documentElement.dataset.theme = theme;
      const colors = { midnight: "#0e1726", nordic: "#e9eee7", aurora: "#dcecff", gold: "#17181b", obsidian: "#15181c" };
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", colors[theme]);
      document.documentElement.style.colorScheme = ["midnight", "gold", "obsidian"].includes(theme) ? "dark" : "light";
      if (saved !== theme) localStorage.setItem("hh-science-theme", theme);
    } catch {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant-TW" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
