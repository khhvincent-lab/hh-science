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
