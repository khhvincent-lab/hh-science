function toHalfWidth(
  value:
    string
) {
  return value.replace(
    /[！-～]/g,
    (char) =>
      String.fromCharCode(
        char.charCodeAt(0) -
        0xfee0
      )
  );
}


function normalizeWhitespace(
  value:
    string
) {
  return value
    .replace(
      /\s+/g,
      ""
    )
    .trim();
}


function normalizeChoiceAnswer(
  value:
    string
) {

  const stripped =
    toHalfWidth(
      value
    )
      .toUpperCase()
      .replace(
        /答案|選項|為|是|：|:|。|\.|、|，|,/g,
        ""
      )
      .replace(
        /[\(\)\[\]\{\}<>＜＞]/g,
        ""
      )
      .replace(
        /\s+/g,
        ""
      );

  if (
    !/^[A-H]+$/.test(
      stripped
    )
  ) {
    return null;
  }

  return Array.from(
    new Set(
      stripped.split(
        ""
      )
    )
  )
    .sort()
    .join(
      ""
    );
}


function normalizeSimpleNumeric(
  value:
    string
) {

  const normalized =
    toHalfWidth(
      value
    )
      .replace(
        /，/g,
        ","
      )
      .replace(
        /×/g,
        "x"
      )
      .replace(
        /−|–|—/g,
        "-"
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim()
      .toLowerCase();

  const match =
    normalized.match(
      /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(?:\s*)(.*)$/i
    );

  if (!match) {
    return null;
  }

  const number =
    Number(
      match[1]
    );

  if (
    !Number.isFinite(
      number
    )
  ) {
    return null;
  }

  const unit =
    String(
      match[2] || ""
    )
      .replace(
        /\s+/g,
        ""
      )
      .replace(
        /\^/g,
        ""
      );

  return {
    number,
    unit,
  };
}


/**
 * 用於「有標準答案」時的快速一致性判斷。
 *
 * 目前只在高信心情境直接判相同：
 * - 單選 / 多選，例如 A、(A)、ACD、A,C,D
 * - 完全正規化後文字一致
 * - 簡單數值 + 完全相同單位
 *
 * 不做危險的單位換算，也不把 2.5 mol 與 2500 mmol
 * 自動視為相同。無法高信心判斷時回傳 false，
 * 由 Arbiter 重新解題，而不是硬判。
 */
export function answersMatch(
  primaryAnswer:
    string,
  referenceAnswer:
    string
) {

  const primary =
    String(
      primaryAnswer || ""
    );

  const reference =
    String(
      referenceAnswer || ""
    );

  if (
    !primary.trim() ||
    !reference.trim()
  ) {
    return false;
  }

  const primaryChoice =
    normalizeChoiceAnswer(
      primary
    );

  const referenceChoice =
    normalizeChoiceAnswer(
      reference
    );

  if (
    primaryChoice &&
    referenceChoice
  ) {
    return (
      primaryChoice ===
      referenceChoice
    );
  }

  const primaryText =
    normalizeWhitespace(
      toHalfWidth(
        primary
      )
        .toLowerCase()
        .replace(
          /答案|為|是|：|:/g,
          ""
        )
    );

  const referenceText =
    normalizeWhitespace(
      toHalfWidth(
        reference
      )
        .toLowerCase()
        .replace(
          /答案|為|是|：|:/g,
          ""
        )
    );

  if (
    primaryText ===
    referenceText
  ) {
    return true;
  }

  const primaryNumeric =
    normalizeSimpleNumeric(
      primary
    );

  const referenceNumeric =
    normalizeSimpleNumeric(
      reference
    );

  if (
    primaryNumeric &&
    referenceNumeric &&
    primaryNumeric.unit ===
      referenceNumeric.unit
  ) {
    const tolerance =
      Math.max(
        1e-10,
        Math.abs(
          referenceNumeric.number
        ) *
          1e-8
      );

    return (
      Math.abs(
        primaryNumeric.number -
        referenceNumeric.number
      ) <= tolerance
    );
  }

  return false;
}


/** Ordered numeric reference answers; omitted reference units inherit the question's units.
 * Only known units are accepted. Explicit unit conflicts and prose require review.
 */
function cleanReferenceFormat(text: string) {
  return toHalfWidth(text)
    .replace(/\\+/g, "\\")
    .replace(/\\(?:mathrm|text|ce)\{([^{}]*)\}/g, "$1")
    .replace(/\\[,;! ]/g, " ")
    .replace(/\\[()[\]]/g, "")
    .replace(/\$/g, "")
    .replace(/−|–/g, "-")
    .replace(/^第\s*\d+\s*題\s*[:：]?\s*/, "")
    .trim();
}

export function referenceAnswersMatch(answer: string, reference: string) {
  answer = cleanReferenceFormat(answer);
  reference = cleanReferenceFormat(reference);
  const formula = (text: string) => text.replace(/[₀-₉]/g, char => String(char.charCodeAt(0) - 0x2080)).replace(/_\{(\d+)\}/g, "$1").replace(/_(\d+)/g, "$1").replace(/\s+/g, "");
  const aFormula = formula(answer), rFormula = formula(reference);
  if (/^(?:[A-Z][a-z]?\d*)+$/.test(aFormula) && /^(?:[A-Z][a-z]?\d*)+$/.test(rFormula)) {
    if (/\d/.test(aFormula + rFormula)) return aFormula === rFormula;
  }
  const parse = (text: string) => {
    const normalized = toHalfWidth(text)
      .replace(/\\+/g, "\\")
      .replace(/\\(?:mathrm|text)\{([^{}]*)\}/g, "$1")
      .replace(/\\[,;! ]/g, " ")
      .replace(/\\[()[\]]/g, "")
      .replace(/\$/g, "")
      .replace(/−|–/g, "-").trim();
    const chunks = normalized.split(/[,，、;；\n]+/).map(part => part.trim());
    if (!chunks.length || chunks.some(part => !part)) return null;
    const values = chunks.map((part, index) => {
      const label = part.match(/^\((\d+)\)\s*/);
      if (label && Number(label[1]) !== index + 1) return null;
      const cleaned = part.replace(/^\(\d+\)\s*/, "");
      const match = cleaned.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(kJ\/mol|J\/mol|mol|mmol|g|kg|mg|L|mL|m|cm|mm|s|min|h|K|°C|℃|Pa|kPa|MPa|atm|mmHg|J|kJ|cal|kcal|N|V|A|W|Hz|%|公克|克|公斤|莫耳|毫升|公升)?$/);
      if (!match || !Number.isFinite(Number(match[1]))) return null;
      return { number: Number(match[1]), unit: match[2] || "" };
    });
    return values.every(value => value !== null) ? values : null;
  };
  const actual = parse(answer);
  const expected = parse(reference);
  if (actual && expected) {
    return actual.length === expected.length && actual.every((value, index) => {
      const target = expected[index];
      return (!target.unit || target.unit === value.unit)
        && Math.abs(value.number - target.number) <= Math.max(1e-12, Math.abs(target.number) * 1e-8);
    });
  }
  if (actual || expected) return false;
  return answersMatch(answer, reference);
}


/** A reference for only the first subquestion cannot validate the whole solution. */
export function referencePartiallyMatches(answer: string, reference: string) {
  const text = cleanReferenceFormat(answer);
  if (!/^\(1\)/.test(text) || !/\(2\)/.test(text)) return false;
  const first = text.replace(/^\(1\)\s*/, "").split(/\(2\)/)[0].split(/\(或/)[0].replace(/[;；\s]+$/, "");
  return referenceAnswersMatch(first, reference);
}
