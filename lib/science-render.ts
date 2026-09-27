import katex from "katex";
import { stripAnnotationCommands } from "./science-markup";

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

/** Only discard closing groups that have no opening group; never invent operands. */
function removeSurplusClosingGroups(text: string) {
  let depth = 0, output = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "\\") { output += char + (text[++i] || ""); continue; }
    if (char === "{") depth++;
    if (char === "}") { if (!depth) continue; depth--; }
    output += char;
  }
  return output;
}

/** Shared by live answers, history, admin, exports and model comparison. */
export function renderScienceFormula(formula: string, displayMode: boolean) {
  const unwrapped = stripAnnotationCommands(formula)
    // A malformed annotation is presentation metadata, not mathematical content.
    .replace(/\\htmlData\s*\{annotation=[^{}]*\}\s*\{/g, "");
  const candidates = [formula, removeSurplusClosingGroups(unwrapped)];
  // Only retry clearly double-escaped commands. Preserve valid array row breaks.
  if (/^\s*\\\\(?:begin|frac|sqrt|mathrm)\b/.test(formula)) {
    candidates.push(removeSurplusClosingGroups(unwrapped.replace(/\\\\/g, "\\")));
  }
  for (const candidate of candidates) {
    try {
      return katex.renderToString(candidate, {
        displayMode, throwOnError: true, strict: false, maxExpand: 500,
        trust: context => context.command === "\\htmlData",
      });
    } catch { /* Try the limited, non-semantic format repairs above. */ }
  }
  // Keep the original inspectable, escaped and wrappable instead of injecting raw HTML.
  return `<span class="science-formula-fallback" style="white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit">公式格式待確認：${escapeHtml(unwrapped)}</span>`;
}
