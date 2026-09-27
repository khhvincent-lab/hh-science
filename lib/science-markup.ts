/** Normalize stored AI text without interpreting LaTeX commands as JSON escapes. */
export function normalizeScienceMarkup(text: string) {
  return String(text || "")
    // A literal newline escape must not consume \\nu, \\neq, \\nabla, etc.
    .replace(/\\n(?![A-Za-z])/g, "\n")
    .replace(/\\\[/g, () => "$$")
    .replace(/\\\]/g, () => "$$")
    .replace(/\\\(/g, () => "$")
    .replace(/\\\)/g, () => "$")
    // Existing paragraph renderers split at newlines. Keep inline math intact.
    .replace(/\$\$[\s\S]*?\$\$|\$[^$]+\$/g, (math) =>
      math.startsWith("$$") ? math : math.replace(/\r?\n/g, " "))
    .replace(/\*\*/g, "")
    .replace(/^---+$/gm, "")
    .trim();
}

/** Remove annotation wrappers from prose, preserving nested formula content. */
export function stripAnnotationCommands(text: string): string {
  const marker = /\\htmlData\s*\{annotation=[^{}]*\}\s*\{/g;
  let result = "", end = 0;
  for (let match; (match = marker.exec(text));) {
    let depth = 1, cursor = marker.lastIndex;
    const start = cursor;
    for (; cursor < text.length && depth; cursor++) {
      if (text[cursor] === "\\") { cursor++; continue; }
      if (text[cursor] === "{") depth++;
      else if (text[cursor] === "}") depth--;
    }
    if (depth) continue;
    result += text.slice(end, match.index) + stripAnnotationCommands(text.slice(start, cursor - 1));
    end = cursor;
    marker.lastIndex = cursor;
  }
  return result + text.slice(end);
}

export function stripBareAnnotationCommands(text: string) {
  // Protect complete formulas while unwrapping prose across math boundaries.
  // Splitting first breaks wrappers such as \\htmlData{annotation=a7}{$[H^+]$仍下降}.
  const formulas: string[] = [];
  let prefix = "\u0000science-math:";
  while (text.includes(prefix)) prefix += ":";
  const masked = text.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, math => {
    formulas.push(math);
    return `${prefix}${formulas.length - 1}\u0000`;
  });
  let result = stripAnnotationCommands(masked);
  formulas.forEach((math, index) => {
    result = result.replace(`${prefix}${index}\u0000`, () => math);
  });
  return result;
}
