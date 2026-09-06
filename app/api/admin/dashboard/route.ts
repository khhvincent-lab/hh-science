import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-session";

import {
  getAISettings,
} from "@/lib/ai-settings";

import {
  getAIModel,
} from "@/lib/ai-models";


/* =========================================================
   Admin check
========================================================= */

function isAdmin(
  request: NextRequest
) {
  const token =
    request.cookies.get(
      ADMIN_SESSION_COOKIE
    )?.value;

  if (!token) {
    return false;
  }

  return Boolean(
    verifyAdminSessionToken(
      token
    )
  );
}


/* =========================================================
   Taiwan time range
========================================================= */

function getTaiwanRanges() {
  const formatter =
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
      }
    );

  const parts =
    formatter.formatToParts(
      new Date()
    );

  const year =
    Number(
      parts.find(
        (p) =>
          p.type === "year"
      )?.value
    );

  const month =
    Number(
      parts.find(
        (p) =>
          p.type === "month"
      )?.value
    );

  const day =
    Number(
      parts.find(
        (p) =>
          p.type === "day"
      )?.value
    );

  const todayStart =
    new Date(
      `${year}-${String(
        month
      ).padStart(
        2,
        "0"
      )}-${String(
        day
      ).padStart(
        2,
        "0"
      )}T00:00:00+08:00`
    );

  const tomorrowStart =
    new Date(
      todayStart.getTime() +
        24 *
          60 *
          60 *
          1000
    );

  const monthStart =
    new Date(
      `${year}-${String(
        month
      ).padStart(
        2,
        "0"
      )}-01T00:00:00+08:00`
    );

  let nextMonthYear =
    year;

  let nextMonth =
    month + 1;

  if (nextMonth === 13) {
    nextMonth =
      1;

    nextMonthYear +=
      1;
  }

  const nextMonthStart =
    new Date(
      `${nextMonthYear}-${String(
        nextMonth
      ).padStart(
        2,
        "0"
      )}-01T00:00:00+08:00`
    );

  return {
    todayStart:
      todayStart.toISOString(),

    tomorrowStart:
      tomorrowStart.toISOString(),

    monthStart:
      monthStart.toISOString(),

    nextMonthStart:
      nextMonthStart.toISOString(),

    usageDate:
      `${year}-${String(
        month
      ).padStart(
        2,
        "0"
      )}-${String(
        day
      ).padStart(
        2,
        "0"
      )}`,
  };
}


/* =========================================================
   Fetch usage rows with pagination
========================================================= */

async function fetchUsageRows(
  start: string,
  end: string
) {
  const PAGE_SIZE =
    1000;

  let from =
    0;

  const allRows:
    any[] =
    [];

  while (true) {
    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from(
          "api_usage"
        )
        .select(
          `
          student_id,
          campus,
          model,
          input_tokens,
          cached_input_tokens,
          cache_write_tokens,
          output_tokens,
          total_tokens,
          estimated_cost_usd,
          success,
          created_at
          `
        )
        .gte(
          "created_at",
          start
        )
        .lt(
          "created_at",
          end
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          }
        )
        .range(
          from,
          from +
            PAGE_SIZE -
            1
        );

    if (error) {
      throw error;
    }

    const rows =
      data || [];

    allRows.push(
      ...rows
    );

    if (
      rows.length <
      PAGE_SIZE
    ) {
      break;
    }

    from +=
      PAGE_SIZE;
  }

  return allRows;
}


/* =========================================================
   GET dashboard
========================================================= */

export async function GET(
  request: NextRequest
) {
  try {

    if (
      !isAdmin(
        request
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Unauthorized",
        },
        {
          status:
            401,
        }
      );
    }


    const ranges =
      getTaiwanRanges();


    const [
      todayRows,
      monthRows,
      todayHistoryResult,
      monthHistoryResult,
      dailyUsageResult,
      studentsResult,
      aiSettings,
    ] =
      await Promise.all([
        fetchUsageRows(
          ranges.todayStart,
          ranges.tomorrowStart
        ),

        fetchUsageRows(
          ranges.monthStart,
          ranges.nextMonthStart
        ),

        supabaseAdmin
          .from("solve_history")
          .select("id,student_id")
          .gte("created_at", ranges.todayStart)
          .lt("created_at", ranges.tomorrowStart),

        supabaseAdmin
          .from("solve_history")
          .select("id,student_id")
          .gte("created_at", ranges.monthStart)
          .lt("created_at", ranges.nextMonthStart),

        supabaseAdmin
          .from(
            "daily_usage"
          )
          .select(
            `
            student_id,
            count,
            students (
              id,
              name,
              campus,
              active
            )
            `
          )
          .eq(
            "usage_date",
            ranges.usageDate
          )
          .order(
            "count",
            {
              ascending:
                false,
            }
          ),

        supabaseAdmin
          .from(
            "students"
          )
          .select(
            "id, name, campus, active"
          )
          .order(
            "campus"
          )
          .order(
            "name"
          ),

        getAISettings(),
      ]);


    if (todayHistoryResult.error) throw todayHistoryResult.error;
    if (monthHistoryResult.error) throw monthHistoryResult.error;

    if (
      dailyUsageResult.error
    ) {
      throw (
        dailyUsageResult.error
      );
    }


    if (
      studentsResult.error
    ) {
      throw (
        studentsResult.error
      );
    }


    const todaySuccessful =
      todayRows.filter(
        (row) =>
          row.success
      );


    const monthSuccessful =
      monthRows.filter(
        (row) =>
          row.success
      );


    const todayCost =
      todayRows.reduce(
        (
          sum,
          row
        ) =>
          sum +
          Number(
            row.estimated_cost_usd ||
              0
          ),
        0
      );


    const monthCost =
      monthRows.reduce(
        (
          sum,
          row
        ) =>
          sum +
          Number(
            row.estimated_cost_usd ||
              0
          ),
        0
      );


    const todayStudents =
      new Set(
        todaySuccessful
          .map(
            (row) =>
              row.student_id
          )
          .filter(
            Boolean
          )
      );


    const campuses = [
      "高雄班",
      "嘉義班",
      "員林班",
    ];


    const campusStats =
      campuses.map(
        (
          campus
        ) => {

          const campusToday =
            todayRows.filter(
              (row) =>
                row.campus ===
                campus
            );


          const campusMonth =
            monthRows.filter(
              (row) =>
                row.campus ===
                campus
            );


          return {
            campus,

            todayQuestions:
              campusToday.filter(
                (row) =>
                  row.success
              ).length,

            todayCost:
              campusToday.reduce(
                (
                  sum,
                  row
                ) =>
                  sum +
                  Number(
                    row.estimated_cost_usd ||
                      0
                  ),
                0
              ),

            monthQuestions:
              campusMonth.filter(
                (row) =>
                  row.success
              ).length,

            monthCost:
              campusMonth.reduce(
                (
                  sum,
                  row
                ) =>
                  sum +
                  Number(
                    row.estimated_cost_usd ||
                      0
                  ),
                0
              ),

            students:
              (
                studentsResult.data ||
                []
              ).filter(
                (student) =>
                  student.campus ===
                  campus &&
                  student.active
              ).length,
          };
        }
      );


    const studentUsage =
      (
        dailyUsageResult.data ||
        []
      ).map(
        (row: any) => {
          const student =
            Array.isArray(
              row.students
            )
              ? row.students[0]
              : row.students;

          return {
            id:
              row.student_id,

            name:
              student?.name ||
              "未知學生",

            campus:
              student?.campus ||
              "",

            count:
              Number(
                row.count ||
                  0
              ),

            active:
              student?.active ??
              true,
          };
        }
      );


    const model =
      getAIModel(
        aiSettings.model
      );


    return NextResponse.json({
      today: {
        questions:
          (todayHistoryResult.data || []).length,

        students:
          todayStudents.size,

        cost:
          Number(
            todayCost.toFixed(
              6
            )
          ),

        averageCost:
          (todayHistoryResult.data || []).length >
          0
            ? Number(
                (
                  todayCost /
                  (todayHistoryResult.data || []).length
                ).toFixed(
                  6
                )
              )
            : 0,
      },

      month: {
        questions:
          (monthHistoryResult.data || []).length,

        cost:
          Number(
            monthCost.toFixed(
              6
            )
          ),

        averageCost:
          (monthHistoryResult.data || []).length >
          0
            ? Number(
                (
                  monthCost /
                  (monthHistoryResult.data || []).length
                ).toFixed(
                  6
                )
              )
            : 0,
      },

      campuses:
        campusStats,

      studentUsage,

      ai: {
        model:
          aiSettings.model,

        modelName:
          model.name,

        description:
          model.description,

        reasoningEffort:
          aiSettings.reasoningEffort,
      },
    });

  } catch (
    error
  ) {

    console.error(
      "Admin dashboard error:",
      error
    );


    return NextResponse.json(
      {
        error:
          "讀取老師後台資料失敗",
      },
      {
        status:
          500,
      }
    );
  }
}