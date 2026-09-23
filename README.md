This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## v2.0.7 學生端升級

- 學生每日剩餘題數：6 題以上綠色、2–5 題琥珀橘、1 題和 0 題紅色（0 題另顯示明日可繼續解題）。
- 科目辨識沿用解題前的 Science Gate，不新增圖片辨識呼叫：僅在已允許的自然科題目、單一科目且辨識信心 >= 85，並且選擇科目與辨識科目不同時才回傳 SUBJECT_MISMATCH。跨科、模糊和低信心分類不阻擋；誤傳未預約題數，提醒切換且保留上傳圖片。
- 盧澔化學官方 LINE：使用已確認的官方帳號 `@199dbmdh`。漢堡選單開啟官方帳號；（此為 v2.0.7 原始行為，v2.0.8 已修正：官方 LINE 按鈕改以原生分享頁附圖，由學生選擇官方帳號與送出。）可用 `NEXT_PUBLIC_OFFICIAL_LINE_ID` 覆蓋帳號 ID，或 `NEXT_PUBLIC_OFFICIAL_LINE_URL` 作為沒有 ID 時的官方主頁備用連結。
- 「儲存解析圖片」一次點擊即分享／儲存：解題完成後預先準備 PNG，支援的手機顯示系統分享選項，否則使用瀏覽器下載；實際儲存至相簿或檔案的位置由裝置分享／下載功能決定。
- 不需變更資料庫或執行 SQL。

## v2.0.8 LINE 圖片分享修正

官方 LINE 的文字深連結無法附帶網站產生的 PNG，因此「詢問真人老師｜盧澔化學」改為手機系統原生圖片分享頁：選 LINE，再選盧澔化學官方帳號 `@199dbmdh` 並由學生確認送出。一般「LINE 分享給老師」亦傳送 PNG 檔案，分享呼叫只帶 files，避免 iOS/LINE 文字與圖片混合時僅收到文字的情形。若系統不支援檔案分享，下載解析 PNG 供學生在 LINE 手動附加；前端不可強制指定原生分享頁的收件對象，也無法直接對官方 LINE 帳號自動傳送圖片。無 DB 異動。
