import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/pwa-register";

export const metadata: Metadata = {
  title: {
    default: "解題實驗室",
    template: "%s | 解題實驗室",
  },
  description: "自然科解題實驗室 v1.5.0",
  icons: { icon: "/icon.png?v=150", apple: "/apple-icon.png?v=150", shortcut: "/favicon.ico?v=150" },
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
    { media: "(prefers-color-scheme: light)", color: "#F5F4EF" },
    { media: "(prefers-color-scheme: dark)", color: "#161C18" },
  ],
};

const themeScript = `
  (() => {
    try {
      const saved = localStorage.getItem("hh-science-theme");
      const legacyMap = { light: "white", dark: "sage" };
      const validThemes = ["white", "oatmeal", "sage", "ocean", "graphite", "burgundy"];
      const migrated = legacyMap[saved] || saved;
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const theme = validThemes.includes(migrated)
        ? migrated
        : systemDark
          ? "sage"
          : "white";

      document.documentElement.dataset.theme = theme;

      if (saved !== theme) {
        localStorage.setItem("hh-science-theme", theme);
      }
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
