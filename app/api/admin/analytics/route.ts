import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import {
  verifyAdminSessionToken,
} from "@/lib/admin-session";

import {
  answersMatch,
} from "@/lib/ai/answer-normalization";


type AnalyticsRange =
  | "today"
  | "7d"
  | "30d"
  | "month";


type UsageRow = {
  usage_day: string;
  provider: string | null;
  model: string | null;
  role: string | null;
  calls: number | string | null;
  estimated_cost_usd:
    number | string | null;
};


type HistoryRow = {
  id: string;
  reference_answer: string | null;
  primary_provider: string | null;
  primary_model: string | null;
  primary_answer: string | null;
  verifier_provider: string | null;
  verifier_model: string | null;
  verifier_result: any;
  arbiter_provider: string | null;
  arbiter_model: string | null;
  arbiter_answer: string | null;
  arbitration_trigger: string | null;
  dispute_status: string | null;
  created_at: string;
};


async function requireAdmin(
  request:
    NextRequest,
) {
  const token =
    request.cookies.get(
      "hh_science_admin_session",
    )?.value;

  if (!token) {
    return null;
  }

  return verifyAdminSessionToken(
    token,
  );
}


function getTaiwanParts(
  date:
    Date,
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Taipei",
        year:
          "numeric",
        month:
          "2-digit",
        day:
          "2-digit",
      },
    ).formatToParts(
      date,
    );

  return {
    year:
      Number(
        parts.find(
          (part) =>
            part.type ===
            "year",
        )?.value ||
        0,
      ),

    month:
      Number(
        parts.find(
          (part) =>
            part.type ===
            "month",
        )?.value ||
        0,
      ),

    day:
      Number(
        parts.find(
          (part) =>
            part.type ===
            "day",
        )?.value ||
        0,
      ),
  };
}


function taiwanDateString(
  year:
    number,
  month:
    number,
  day:
    number,
) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}


function addCalendarDays(
  year:
    number,
  month:
    number,
  day:
    number,
  amount:
    number,
) {
  const shifted =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day + amount,
      ),
    );

  return {
    year:
      shifted.getUTCFullYear(),

    month:
      shifted.getUTCMonth() +
      1,

    day:
      shifted.getUTCDate(),
  };
}


function resolveRange(
  value:
    string | null,
) {
  const range:
    AnalyticsRange =
    value === "today" ||
    value === "30d" ||
    value === "month"
      ? value
      : "7d";

  const today =
    getTaiwanParts(
      new Date(),
    );

  let start =
    today;

  let label =
    "";

  if (
    range ===
    "today"
  ) {
    label =
      `${taiwanDateString(today.year, today.month, today.day)}（台灣時間）`;
  }

  if (
    range ===
    "7d"
  ) {
    start =
      addCalendarDays(
        today.year,
        today.month,
        today.day,
        -6,
      );

    label =
      `最近 7 天（含今天）`;
  }

  if (
    range ===
    "30d"
  ) {
    start =
      addCalendarDays(
        today.year,
        today.month,
        today.day,
        -29,
      );

    label =
      `最近 30 天（含今天）`;
  }

  if (
    range ===
    "month"
  ) {
    start = {
      year:
        today.year,
      month:
        today.month,
      day:
        1,
    };

    label =
      `${today.year} 年 ${today.month} 月`;
  }

  const tomorrow =
    addCalendarDays(
      today.year,
      today.month,
      today.day,
      1,
    );

  const startDate =
    taiwanDateString(
      start.year,
      start.month,
      start.day,
    );

  const endDateExclusive =
    taiwanDateString(
      tomorrow.year,
      tomorrow.month,
      tomorrow.day,
    );

  return {
    range,
    label,

    startAt:
      `${startDate}T00:00:00+08:00`,

    endAt:
      `${endDateExclusive}T00:00:00+08:00`,

    startDay:
      startDate,

    endDayExclusive:
      endDateExclusive,
  };
}


async function fetchHistoryRows(
  startAt:
    string,
  endAt:
    string,
) {
  const rows:
    HistoryRow[] =
    [];

  const pageSize =
    1000;

  for (
    let offset = 0;
    ;
    offset +=
      pageSize
  ) {
    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from(
          "solve_history",
        )
        .select(
          `
          id,
          reference_answer,
          primary_provider,
          primary_model,
          primary_answer,
          verifier_provider,
          verifier_model,
          verifier_result,
          arbiter_provider,
          arbiter_model,
          arbiter_answer,
          arbitration_trigger,
          dispute_status,
          created_at
          `,
        )
        .gte(
          "created_at",
          startAt,
        )
        .lt(
          "created_at",
          endAt,
        )
        .order(
          "created_at",
          {
            ascending:
              true,
          },
        )
        .range(
          offset,
          offset +
            pageSize -
            1,
        );

    if (error) {
      throw new Error(
        `讀取 AI 品質資料失敗：${error.message}`,
      );
    }

    const batch =
      (data ||
        []) as HistoryRow[];

    rows.push(
      ...batch,
    );

    if (
      batch.length <
      pageSize
    ) {
      break;
    }
  }

  return rows;
}


async function fetchUsageRows(
  startDay:
    string,
  endDayExclusive:
    string,
) {
  const rows:
    UsageRow[] =
    [];

  const pageSize =
    1000;

  for (
    let offset = 0;
    ;
    offset +=
      pageSize
  ) {
    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from(
          "ai_usage_by_role",
        )
        .select(
          `
          usage_day,
          provider,
          model,
          role,
          calls,
          estimated_cost_usd
          `,
        )
        .gte(
          "usage_day",
          `${startDay}T00:00:00+08:00`,
        )
        .lt(
          "usage_day",
          `${endDayExclusive}T00:00:00+08:00`,
        )
        .order(
          "usage_day",
          {
            ascending:
              true,
          },
        )
        .range(
          offset,
          offset +
            pageSize -
            1,
        );

    if (error) {
      throw new Error(
        `讀取 AI 使用量失敗：${error.message}`,
      );
    }

    const batch =
      (data ||
        []) as UsageRow[];

    rows.push(
      ...batch,
    );

    if (
      batch.length <
      pageSize
    ) {
      break;
    }
  }

  return rows;
}


function percent(
  numerator:
    number,
  denominator:
    number,
) {
  if (
    denominator <=
    0
  ) {
    return null;
  }

  return (
    numerator /
    denominator
  ) *
    100;
}


function normalizeVerifierVerdict(
  value:
    any,
) {
  if (
    value &&
    typeof value ===
      "object" &&
    value.verdict ===
      "major_error"
  ) {
    return "major_error";
  }

  return "approve";
}


export async function GET(
  request:
    NextRequest,
) {
  const admin =
    await requireAdmin(
      request,
    );

  if (!admin) {
    return NextResponse.json(
      {
        error:
          "未登入管理員。",
      },
      {
        status:
          401,
      },
    );
  }

  try {
    const period =
      resolveRange(
        request.nextUrl
          .searchParams
          .get(
            "range",
          ),
      );

    const [
      historyRows,
      usageRows,
    ] =
      await Promise.all([
        fetchHistoryRows(
          period.startAt,
          period.endAt,
        ),

        fetchUsageRows(
          period.startDay,
          period.endDayExclusive,
        ),
      ]);


    const roleMap =
      new Map<
        string,
        {
          role:
            string;
          calls:
            number;
          costUsd:
            number;
        }
      >();


    const modelUsageMap =
      new Map<
        string,
        {
          model:
            string;
          provider:
            string;
          calls:
            number;
          costUsd:
            number;
        }
      >();


    let totalCalls =
      0;

    let totalCostUsd =
      0;


    for (
      const row of
      usageRows
    ) {
      const role =
        String(
          row.role ||
          "unknown",
        );

      const provider =
        String(
          row.provider ||
          "unknown",
        );

      const model =
        String(
          row.model ||
          "unknown",
        );

      const calls =
        Number(
          row.calls ||
          0,
        );

      const cost =
        Number(
          row.estimated_cost_usd ||
          0,
        );


      totalCalls +=
        calls;

      totalCostUsd +=
        cost;


      const roleEntry =
        roleMap.get(
          role,
        ) || {
          role,
          calls:
            0,
          costUsd:
            0,
        };

      roleEntry.calls +=
        calls;

      roleEntry.costUsd +=
        cost;

      roleMap.set(
        role,
        roleEntry,
      );


      const key =
        `${provider}::${model}`;

      const modelEntry =
        modelUsageMap.get(
          key,
        ) || {
          model,
          provider,
          calls:
            0,
          costUsd:
            0,
        };

      modelEntry.calls +=
        calls;

      modelEntry.costUsd +=
        cost;

      modelUsageMap.set(
        key,
        modelEntry,
      );
    }


    let referenceCases =
      0;

    let primaryReferenceMatches =
      0;

    let noReferenceCases =
      0;

    let verifierQuestions =
      0;

    let verifierMajorErrors =
      0;

    let arbiterQuestions =
      0;

    let referenceMismatchArbitrations =
      0;

    let referenceArbiterSupportsReference =
      0;

    let referenceArbiterSupportsPrimary =
      0;

    let referenceArbiterStillInconsistent =
      0;

    let verifierTriggeredArbitrations =
      0;

    let disputedQuestions =
      0;


    const primaryQuality =
      new Map<
        string,
        {
          cases:
            number;
          matches:
            number;
        }
      >();


    const verifierQuality =
      new Map<
        string,
        {
          cases:
            number;
          majorErrors:
            number;
        }
      >();


    for (
      const row of
      historyRows
    ) {
      const reference =
        String(
          row.reference_answer ||
          "",
        ).trim();

      const primaryAnswer =
        String(
          row.primary_answer ||
          "",
        ).trim();

      const hasReference =
        Boolean(
          reference,
        );


      if (
        hasReference
      ) {
        referenceCases +=
          1;

        const matched =
          answersMatch(
            primaryAnswer,
            reference,
          );

        if (
          matched
        ) {
          primaryReferenceMatches +=
            1;
        }


        if (
          row.primary_model
        ) {
          const key =
            `${row.primary_provider || "unknown"}::${row.primary_model}`;

          const entry =
            primaryQuality.get(
              key,
            ) || {
              cases:
                0,
              matches:
                0,
            };

          entry.cases +=
            1;

          if (
            matched
          ) {
            entry.matches +=
              1;
          }

          primaryQuality.set(
            key,
            entry,
          );
        }

      } else {
        noReferenceCases +=
          1;
      }


      if (
        row.verifier_model
      ) {
        verifierQuestions +=
          1;

        const verdict =
          normalizeVerifierVerdict(
            row.verifier_result,
          );

        if (
          verdict ===
          "major_error"
        ) {
          verifierMajorErrors +=
            1;
        }


        const key =
          `${row.verifier_provider || "unknown"}::${row.verifier_model}`;

        const entry =
          verifierQuality.get(
            key,
          ) || {
            cases:
              0,
            majorErrors:
              0,
          };

        entry.cases +=
          1;

        if (
          verdict ===
          "major_error"
        ) {
          entry.majorErrors +=
            1;
        }

        verifierQuality.set(
          key,
          entry,
        );
      }


      if (
        row.arbiter_model
      ) {
        arbiterQuestions +=
          1;
      }


      if (
        row.arbitration_trigger ===
        "reference_mismatch"
      ) {
        referenceMismatchArbitrations +=
          1;

        const arbiterAnswer =
          String(
            row.arbiter_answer ||
            "",
          ).trim();

        if (
          reference &&
          answersMatch(
            arbiterAnswer,
            reference,
          )
        ) {
          referenceArbiterSupportsReference +=
            1;

        } else if (
          primaryAnswer &&
          answersMatch(
            arbiterAnswer,
            primaryAnswer,
          )
        ) {
          referenceArbiterSupportsPrimary +=
            1;

        } else {
          referenceArbiterStillInconsistent +=
            1;
        }
      }


      if (
        row.arbitration_trigger ===
        "verifier_major_error"
      ) {
        verifierTriggeredArbitrations +=
          1;
      }


      if (
        row.dispute_status ===
        "disputed"
      ) {
        disputedQuestions +=
          1;
      }
    }


    const allModelKeys =
      new Set<string>([
        ...modelUsageMap.keys(),
        ...primaryQuality.keys(),
        ...verifierQuality.keys(),
      ]);


    const models =
      Array.from(
        allModelKeys,
      )
        .map(
          (
            key,
          ) => {
            const [
              provider,
              model,
            ] =
              key.split(
                "::",
              );

            const usage =
              modelUsageMap.get(
                key,
              ) || {
                model,
                provider,
                calls:
                  0,
                costUsd:
                  0,
              };

            const primary =
              primaryQuality.get(
                key,
              ) || {
                cases:
                  0,
                matches:
                  0,
              };

            const verifier =
              verifierQuality.get(
                key,
              ) || {
                cases:
                  0,
                majorErrors:
                  0,
              };

            return {
              model:
                usage.model,

              provider:
                usage.provider,

              calls:
                usage.calls,

              costUsd:
                Number(
                  usage.costUsd.toFixed(
                    8,
                  ),
                ),

              averageCostUsd:
                usage.calls >
                0
                  ? Number(
                      (
                        usage.costUsd /
                        usage.calls
                      ).toFixed(
                        8,
                      ),
                    )
                  : 0,

              primaryReferenceCases:
                primary.cases,

              primaryMatches:
                primary.matches,

              primaryConsistencyRate:
                percent(
                  primary.matches,
                  primary.cases,
                ),

              verifierCases:
                verifier.cases,

              verifierMajorErrors:
                verifier.majorErrors,

              verifierDisagreementRate:
                percent(
                  verifier.majorErrors,
                  verifier.cases,
                ),
            };
          },
        )
        .sort(
          (
            a,
            b,
          ) =>
            b.calls -
            a.calls ||
            b.costUsd -
            a.costUsd,
        );


    const roles =
      Array.from(
        roleMap.values(),
      )
        .map(
          (
            item,
          ) => ({
            ...item,
            costUsd:
              Number(
                item.costUsd.toFixed(
                  8,
                ),
              ),
          }),
        )
        .sort(
          (
            a,
            b,
          ) =>
            b.calls -
            a.calls,
        );


    const solvedQuestions =
      historyRows.length;


    return NextResponse.json({
      range:
        period.range,

      label:
        period.label,

      startAt:
        period.startAt,

      endAt:
        period.endAt,

      generatedAt:
        new Date().toISOString(),

      totals: {
        solvedQuestions,

        apiCalls:
          totalCalls,

        totalCostUsd:
          Number(
            totalCostUsd.toFixed(
              8,
            ),
          ),

        averageCostPerSolveUsd:
          solvedQuestions >
          0
            ? Number(
                (
                  totalCostUsd /
                  solvedQuestions
                ).toFixed(
                  8,
                ),
              )
            : 0,
      },

      roles,

      quality: {
        referenceCases,

        primaryReferenceMatches,

        primaryReferenceConsistencyRate:
          percent(
            primaryReferenceMatches,
            referenceCases,
          ),

        noReferenceCases,

        verifierQuestions,

        verifierActivationRate:
          percent(
            verifierQuestions,
            noReferenceCases,
          ),

        verifierMajorErrors,

        verifierDisagreementRate:
          percent(
            verifierMajorErrors,
            verifierQuestions,
          ),

        arbiterQuestions,

        arbiterActivationRate:
          percent(
            arbiterQuestions,
            solvedQuestions,
          ),

        referenceMismatchArbitrations,

        referenceArbiterSupportsReference,

        referenceArbiterSupportsPrimary,

        referenceArbiterStillInconsistent,

        verifierTriggeredArbitrations,

        disputedQuestions,
      },

      models,
    });

  } catch (
    error
  ) {
    return NextResponse.json(
      {
        error:
          error instanceof
          Error
            ? error.message
            : "讀取 AI 數據分析失敗。",
      },
      {
        status:
          500,
      },
    );
  }
}
