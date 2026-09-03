"use client";

import { useState } from "react";

export default function MobileReactTest() {
  const [name, setName] = useState("");
  const [count, setCount] = useState(0);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "24px",
        background: "#f3f0ea",
        color: "#111111",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "520px",
          margin: "0 auto",
          background: "#ffffff",
          border: "2px solid #333333",
          borderRadius: "16px",
          padding: "20px",
        }}
      >
        <h1
          style={{
            margin: "0 0 16px",
            color: "#111111",
            fontSize: "26px",
          }}
        >
          Next.js React 手機測試
        </h1>

        <p
          style={{
            color: "#111111",
            fontSize: "16px",
          }}
        >
          React 狀態：
          <strong>
            {name ? " ✅ 已啟動" : "等待輸入"}
          </strong>
        </p>

        <label
          htmlFor="name-test"
          style={{
            display: "block",
            marginBottom: "8px",
            color: "#111111",
            fontWeight: "700",
          }}
        >
          請輸入文字
        </label>

        <input
          id="name-test"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：王"
          style={{
            display: "block",
            width: "100%",
            height: "52px",
            padding: "0 12px",
            boxSizing: "border-box",
            border: "2px solid #333333",
            borderRadius: "10px",
            background: "#ffffff",
            color: "#111111",
            fontSize: "18px",
            WebkitTextFillColor: "#111111",
          }}
        />

        <div
          style={{
            marginTop: "16px",
            padding: "12px",
            background: "#eeeeee",
            borderRadius: "10px",
            color: "#111111",
          }}
        >
          目前輸入：
          <strong>{name || "空白"}</strong>
        </div>

        <button
          type="button"
          onClick={() => setCount((c) => c + 1)}
          style={{
            display: "block",
            width: "100%",
            height: "54px",
            marginTop: "18px",
            border: "2px solid #111111",
            borderRadius: "10px",
            background: "#34493c",
            color: "#ffffff",
            fontSize: "18px",
            fontWeight: "700",
            cursor: "pointer",
          }}
        >
          點擊測試：{count}
        </button>

        <div
          style={{
            marginTop: "18px",
            fontSize: "14px",
            color: "#333333",
            lineHeight: 1.6,
          }}
        >
          測試方式：
          <br />
          1. 輸入「王」
          <br />
          2. 看「目前輸入」是否立即變成王
          <br />
          3. 按按鈕，看 0 是否變成 1
        </div>
      </div>
    </main>
  );
}