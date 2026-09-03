import type {
  Metadata,
} from "next";

import {
  Inter,
  Noto_Sans_TC,
  Noto_Serif_TC,
} from "next/font/google";

import "./globals.css";

import "katex/dist/katex.min.css";


const inter =
  Inter({
    subsets: [
      "latin",
    ],

    variable:
      "--font-inter",

    display:
      "swap",
  });


const notoSans =
  Noto_Sans_TC({
    subsets: [
      "latin",
    ],

    variable:
      "--font-sans",

    display:
      "swap",

    weight: [
      "400",
      "500",
      "600",
      "700",
    ],
  });


const notoSerif =
  Noto_Serif_TC({
    subsets: [
      "latin",
    ],

    variable:
      "--font-serif",

    display:
      "swap",

    weight: [
      "500",
      "600",
      "700",
    ],
  });


export const metadata:
  Metadata = {

  title:
    "H.H. Science Lab 解題實驗室",

  description:
    "拆解步驟，清晰脈絡，訂正錯誤，梳理思路",
};


export default function RootLayout({
  children,
}: Readonly<{
  children:
    React.ReactNode;
}>) {

  return (
    <html
      lang="zh-Hant"

      suppressHydrationWarning
    >

      <body
        className={`
          ${inter.variable}
          ${notoSans.variable}
          ${notoSerif.variable}
        `}
      >
        {children}
      </body>

    </html>
  );
}