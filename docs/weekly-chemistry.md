# 每週化學專欄維護

入口 `/chemistry`；學生漢堡選單「專欄｜每週化學」。

內容源為 `content/chemistry-articles.json`。2026-09-26 初次上架1–9月九篇精選，非全年每週補刊。本週首篇為2026-09-23教室空氣研究。週更由使用者授權的 ChatGPT 排程執行，首個後續時段2026-10-03 Asia/Taipei週六上午。這不是Vercel cron；若排程失敗需要明確通知，不得假稱更新。

每次只新增一篇，先讀main最新內容，以來源URL和主題去重。核對來源發表日期，優先七日內期刊、學會或研究機構官方來源；無合適內容可放寬近30日並保留真實日期。不要硬湊新闻，不用未查證研究。科學摘要精簡原創，教學解釋與題目自行編寫，避免長篇翻譯與複製來源圖片。

結構：slug（唯一英文短名）、sourceDate（來源YYYY-MM-DD）、publishedAt（上架台灣日期）、title、category、intro、paragraphs（段落陣列）、concepts（關鍵觀念陣列）、table（headers, rows, note）、questions（三題，每題prompt/options/answer零起算索引/explanation）、sourceName、sourceUrl、minutes。

標示原研究、推算與教學示意數據。區分研究結論與推測、課內概念與延伸機制。不可將濃度變化誤當回收率、把粒子移除當氣體移除、或把特定實驗成果推廣到所有環境。答案要唯一、計算複核、選項不含歧義。所有來源需可點擊。

新文章自動依sourceDate由新到舊排列並產生獨立URL。更新JSON後需要部署。使用分支與PR，執行JSON格式檢查、TypeScript/build；合併main觸發既有Vercel部署，檢查commit狀態與正式URL。不要更動其他功能或學生資料。

本版為公開閱讀區，作答當次即時計分且不扣AI額度；尚無跨裝置閱讀/作答紀錄、收藏或後台文章編輯器。後續需要這些能力再整合既有學生授權與資料庫，不可把瀏覽器共享儲存冒充學生個人紀錄。
