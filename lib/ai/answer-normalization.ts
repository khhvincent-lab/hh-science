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

// Numbered subquestions are ordered; a single multiple-choice answer remains a set.
function orderedChoices(text: string) {
  const source = toHalfWidth(text).trim();
  const pattern = /(?:\((\d+)\)|(\d+)\.|第\s*([一二三四五六七八九十\d]+)\s*題|例題\s*([一二三四五六七八九十\d]+))\s*(?:是|為|:)?\s*\(?([A-H])\)?/g;
  const matches = [...source.matchAll(pattern)];
  if (matches.length < 2) return null;
  if (source.replace(pattern, "").replace(/[\s,;、；，。]/g, "")) return null;
  const ordinal = (value: string) => /^\d+$/.test(value) ? Number(value) : "一二三四五六七八九十".indexOf(value) + 1;
  const labels = matches.map(match => ordinal(match[1] || match[2] || match[3] || match[4]));
  if (labels.some((value, index) => value <= 0 || (index > 0 && value !== labels[index - 1] + 1))) return null;
  return { values: matches.map(match => match[5]), labels, examples: Boolean(matches[0][4]) };
}

function plainChoiceSequence(text: string) {
  if (!/^\s*\(?[A-H]\)?(?:\s*(?:[,、;；和及與]|\s)\s*\(?[A-H]\)?)+\s*$/.test(text)) return null;
  return text.match(/[A-H]/g);
}

/** Resolve only one selected option, never numbers from unrelated options or conditions. */
function selectedOptionValue(answer: string, options: string) {
  const choice = answer.match(/^\(?([A-H])\)?$/)?.[1];
  if (!choice || !options) return null;
  const text = cleanReferenceFormat(options);
  const blocks = [...text.matchAll(/\(([A-H])\)\s*([\s\S]*?)(?=\([A-H]\)|$)/g)];
  if (new Set(blocks.map(block => block[1])).size !== blocks.length) return null;
  const selected = blocks.filter(block => block[1] === choice);
  if (selected.length !== 1) return null;
  const body = selected[0][2].trim();
  const numeric = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?";
  const unit = "(?:m/s|mL|mol|mmol|kg|mg|g|cm|mm|m|s|L|mmHg|kPa|Pa|atm|kJ|J|%)";
  const direct = body.match(new RegExp(`^(${numeric}\\s*(?:${unit})?)\\s*[。.]?$`));
  if (direct) return direct[1];
  if (!/^對[:：]/.test(body) || /並非|不是|不等於|錯誤|或/.test(body)) return null;
  const conclusions = [...body.matchAll(new RegExp(`(?:波速|速度|質量|體積|壓力|溫度|週期|頻率|物質的量|莫耳數|濃度)為\\s*(${numeric}\\s*${unit})(?=[\\s,，。；;]|$)`, "g"))];
  return conclusions.length === 1 ? conclusions[0][1] : null;
}

export function referenceAnswersMatch(answer: string, reference: string, options = "") {
  const orderedAnswer = orderedChoices(answer), orderedReference = orderedChoices(reference);
  if (orderedAnswer || orderedReference) {
    const actual = orderedAnswer?.values || plainChoiceSequence(toHalfWidth(answer));
    const expected = orderedReference?.values || plainChoiceSequence(toHalfWidth(reference));
    if (orderedAnswer && orderedReference && orderedAnswer.examples === orderedReference.examples
      && orderedAnswer.labels.join() !== orderedReference.labels.join()) return false;
    return Boolean(actual && expected && actual.length === expected.length && actual.every((value, index) => value === expected[index]));
  }
  answer = cleanReferenceFormat(answer);
  reference = cleanReferenceFormat(reference);
  const selectedValue = selectedOptionValue(answer, options);
  if (selectedValue && referenceAnswersMatch(selectedValue, reference)) return true;
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
      const match = cleaned.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(m\/s|kJ\/mol|J\/mol|mol|mmol|g|kg|mg|L|mL|m|cm|mm|s|min|h|K|°C|℃|Pa|kPa|MPa|atm|mmHg|J|kJ|cal|kcal|N|V|A|W|Hz|%|公克|克|公斤|莫耳|毫升|公升)?$/);
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
