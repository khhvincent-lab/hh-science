export function parseAIJson<T = any>(
  raw:
    string
): T {

  const text =
    raw.trim();

  try {
    return JSON.parse(
      text
    ) as T;
  } catch {
    const firstBrace =
      text.indexOf(
        "{"
      );

    const lastBrace =
      text.lastIndexOf(
        "}"
      );

    if (
      firstBrace === -1 ||
      lastBrace === -1 ||
      lastBrace <= firstBrace
    ) {
      throw new Error(
        "AI 回覆格式不正確，請重新嘗試。"
      );
    }

    return JSON.parse(
      text.slice(
        firstBrace,
        lastBrace + 1
      )
    ) as T;
  }
}
