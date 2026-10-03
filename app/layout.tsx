import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./v2.css";
import "./racing-theme.css";
import "./collections-theme.css";
import "./f1-livery.css";
import "./f1-premium.css";
import "./solution-export.css";
import PwaRegister from "@/components/pwa-register";

export const metadata: Metadata = {
  title: {
    default: "解題實驗室",
    template: "%s | 解題實驗室",
  },
  description: "解題實驗室 v2.0.5 · 自然科 AI 解題學習平台",
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
      let saved = null;
      try { saved = localStorage.getItem("hh-science-theme"); } catch {}
      const legacy = { white:"nordic", oatmeal:"nordic", sage:"midnight", ocean:"midnight", graphite:"obsidian", burgundy:"gold", light:"nordic", dark:"midnight" };
      const valid = ["midnight", "nordic", "aurora", "gold", "obsidian", "racing", "iphone-burgundy", "iphone-glacier", "iphone-silver", "iphone-black", "f1-mercedes", "f1-redbull", "f1-ferrari", "f1-mclaren"];
      const migrated = legacy[saved] || saved;
      const theme = valid.includes(migrated) ? migrated : "midnight";
      document.documentElement.dataset.theme = theme;
      const colors = { midnight: "#0e1726", nordic: "#e9eee7", aurora: "#dcecff", gold: "#17181b", obsidian: "#15181c", racing: "#101114", "iphone-burgundy": "#190f16", "iphone-glacier": "#e8f1f5", "iphone-silver": "#eceef1", "iphone-black": "#090a0c", "f1-mercedes": "#0a1113", "f1-redbull": "#0a1025", "f1-ferrari": "#0d0d10", "f1-mclaren": "#111214" };
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", colors[theme]);
      document.documentElement.style.colorScheme = ["midnight", "gold", "obsidian", "racing", "iphone-burgundy", "iphone-black", "f1-mercedes", "f1-redbull", "f1-ferrari", "f1-mclaren"].includes(theme) ? "dark" : "light";
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
