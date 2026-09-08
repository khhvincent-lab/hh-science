function stripJsonCodeFence(raw: string) {
  const text = String(raw || "").trim();
  if (!text.startsWith("```")) return text;
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * Repairs the most common AI JSON failure in science responses:
 * LaTeX commands are emitted with a single backslash inside a JSON string.
 *
 * Example invalid JSON:
 *   {"label":"\\theta","text":"\\mathrm{cm}"}
 *
 * JSON only allows these single-character escapes:
 *   \\" \\\\ \\/ \\b \\f \\n \\r \\t \\uXXXX
 *
 * A command such as \\theta begins with `\\t`, which JSON would otherwise
 * interpret as a tab. We therefore detect multi-letter backslash commands
 * while we are inside JSON strings and turn the slash into a literal slash.
 */
function repairJsonStringEscapes(raw: string) {
  let result = "";
  let inString = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];

    if (ch === '"') {
      // A quote is escaped only when preceded by an odd number of slashes.
      let slashCount = 0;
      for (let j = i - 1; j >= 0 && raw[j] === "\\"; j -= 1) slashCount += 1;
      if (slashCount % 2 === 0) inString = !inString;
      result += ch;
      continue;
    }

    if (!inString || ch !== "\\") {
      result += ch;
      continue;
    }

    const next = raw[i + 1] || "";

    // Keep normal JSON escapes intact.
    if (next === '"' || next === "\\" || next === "/") {
      result += ch;
      continue;
    }

    if (next === "u") {
      const unicode = raw.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(unicode)) {
        result += ch;
        continue;
      }
      // Invalid \\u sequence: treat the backslash literally.
      result += "\\\\";
      continue;
    }

    if (/[A-Za-z]/.test(next)) {
      let end = i + 1;
      while (end < raw.length && /[A-Za-z]/.test(raw[end])) end += 1;
      const command = raw.slice(i + 1, end);

      // Multi-letter sequences are almost always LaTeX/science commands.
      // This also prevents \\theta from silently becoming a tab + "heta".
      if (command.length > 1) {
        result += "\\\\";
        continue;
      }

      if (["b", "f", "n", "r", "t"].includes(next)) {
        result += ch;
        continue;
      }

      // Any other single alphabetic escape is invalid JSON; keep it literal.
      result += "\\\\";
      continue;
    }

    // Unknown escape such as \\_ or \\{ -> preserve the slash literally.
    result += "\\\\";
  }

  return result;
}

function extractJsonObject(text: string) {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("AI 回覆格式不正確，請重新嘗試。");
  }

  return text.slice(firstBrace, lastBrace + 1);
}

function tryParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function parseAIJson<T = any>(raw: string): T {
  const text = stripJsonCodeFence(raw);

  const direct = tryParse<T>(text);
  if (direct !== null) return direct;

  const repairedDirect = tryParse<T>(repairJsonStringEscapes(text));
  if (repairedDirect !== null) return repairedDirect;

  const extracted = extractJsonObject(text);

  const extractedParsed = tryParse<T>(extracted);
  if (extractedParsed !== null) return extractedParsed;

  const repairedExtracted = tryParse<T>(repairJsonStringEscapes(extracted));
  if (repairedExtracted !== null) return repairedExtracted;

  throw new Error("AI 回覆 JSON 格式異常，系統已嘗試自動修復但仍無法解析，請重新嘗試。");
}
