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
  getAISolverSettings,
} from "@/lib/ai-settings";

import {
  getStudentAuthSettings,
  hashStudentPin,
  resetStudentToInitialPin,
} from "@/lib/student-auth";


const CAMPUSES = [
  "高雄班",
  "嘉義班",
  "員林班",
] as const;


function getTaiwanDateString() {

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
      }
    ).formatToParts(
      new Date()
    );

  const map =
    Object.fromEntries(
      parts.map(
        (part) => [
          part.type,
          part.value,
        ]
      )
    );

  return `${map.year}-${map.month}-${map.day}`;
}


async function requireAdmin(
  request:
    NextRequest
) {

  const token =
    request.cookies.get(
      "hh_science_admin_session"
    )?.value;

  if (
    !token
  ) {
    return null;
  }

  return verifyAdminSessionToken(
    token
  );
}


export async function GET(
  request:
    NextRequest
) {

  const admin =
    await requireAdmin(
      request
    );

  if (
    !admin
  ) {
    return NextResponse.json(
      {
        error:
          "未登入管理員。",
      },
      {
        status:
          401,
      }
    );
  }


  const {
    data:
      students,
    error:
      studentError,
  } =
    await supabaseAdmin
      .from(
        "students"
      )
      .select(
        "id,campus,name,active,must_change_pin,pin_changed_at,last_login_at,created_at,updated_at,region_id,institution_id,class_id,regions(name),institutions(name),classes(name)"
      )
      .order(
        "campus",
        {
          ascending:
            true,
        }
      )
      .order(
        "name",
        {
          ascending:
            true,
        }
      );


  if (
    studentError
  ) {
    return NextResponse.json(
      {
        error:
          `讀取學生資料失敗：${studentError.message}`,
      },
      {
        status:
          500,
      }
    );
  }


  const today =
    getTaiwanDateString();


  const {
    data:
      usages,
    error:
      usageError,
  } =
    await supabaseAdmin
      .from(
        "daily_usage"
      )
      .select(
        "student_id,count"
      )
      .eq(
        "usage_date",
        today
      );


  if (
    usageError
  ) {
    return NextResponse.json(
      {
        error:
          `讀取今日額度失敗：${usageError.message}`,
      },
      {
        status:
          500,
      }
    );
  }


  const usageMap =
    new Map(
      (
        usages ??
        []
      ).map(
        (row) => [
          row.student_id as
            string,

          Number(
            row.count ??
            0
          ),
        ]
      )
    );


  const rows =
    (
      students ??
      []
    ).map(
      (student) => ({
        ...student,

        todayCount:
          usageMap.get(
            student.id
          ) ??
          0,

        passwordStatus:
          student
            .must_change_pin
            ? "initial"
            : "personal",
      })
    );


  const aiSettings =
    await getAISolverSettings();


  return NextResponse.json({
    students:
      rows,

    today,

    dailyLimit:
      aiSettings.dailyLimit,

    summary: {
      total:
        rows.length,

      active:
        rows.filter(
          (row) =>
            row.active
        ).length,

      inactive:
        rows.filter(
          (row) =>
            !row.active
        ).length,

      campuses:
        CAMPUSES.map(
          (campus) => ({
            campus,

            count:
              rows.filter(
                (row) =>
                  row.campus ===
                  campus
              ).length,
          })
        ),
    },
  });
}


export async function POST(
  request:
    NextRequest
) {

  const admin =
    await requireAdmin(
      request
    );

  if (
    !admin
  ) {
    return NextResponse.json(
      {
        error:
          "未登入管理員。",
      },
      {
        status:
          401,
      }
    );
  }


  let body: {
    campus?: string;
    name?: string;
    regionId?: string;
    institutionId?: string;
    classId?: string;
  };


  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "資料格式錯誤。",
      },
      {
        status:
          400,
      }
    );
  }


  let campus = body.campus?.trim() ?? "";
  const name = body.name?.trim() ?? "";
  const regionId = body.regionId?.trim() ?? "";
  const institutionId = body.institutionId?.trim() ?? "";
  const classId = body.classId?.trim() ?? "";

  let organizationUpdates: Record<string, string> = {};

  if (regionId || institutionId || classId) {
    if (!regionId || !institutionId || !classId) {
      return NextResponse.json({ error: "請完整選擇地區、合作單位與班級。" }, { status: 400 });
    }

    const { data: classRow, error: classError } = await supabaseAdmin
      .from("classes")
      .select("id,institution_id")
      .eq("id", classId)
      .maybeSingle();

    if (classError || !classRow || classRow.institution_id !== institutionId) {
      return NextResponse.json({ error: "班級與合作單位不一致，請重新選擇。" }, { status: 400 });
    }

    const { data: institutionRow, error: institutionError } = await supabaseAdmin
      .from("institutions")
      .select("id,region_id")
      .eq("id", institutionId)
      .maybeSingle();

    if (institutionError || !institutionRow || institutionRow.region_id !== regionId) {
      return NextResponse.json({ error: "合作單位與地區不一致，請重新選擇。" }, { status: 400 });
    }

    const { data: regionRow, error: regionError } = await supabaseAdmin
      .from("regions")
      .select("id,name")
      .eq("id", regionId)
      .maybeSingle();

    if (regionError || !regionRow) {
      return NextResponse.json({ error: "找不到選擇的地區。" }, { status: 400 });
    }

    campus = `${regionRow.name}班`;
    organizationUpdates = {
      region_id: regionId,
      institution_id: institutionId,
      class_id: classId,
    };
  } else if (!campus) {
    return NextResponse.json({ error: "請選擇正確班級。" }, { status: 400 });
  }

  if (
    !name
  ) {
    return NextResponse.json(
      {
        error:
          "請輸入學生姓名。",
      },
      {
        status:
          400,
      }
    );
  }


  if (
    name.length >
    40
  ) {
    return NextResponse.json(
      {
        error:
          "學生姓名過長。",
      },
      {
        status:
          400,
      }
    );
  }


  const existingQuery =
    supabaseAdmin
      .from(
        "students"
      )
      .select(
        "id"
      )
      .eq(
        "name",
        name
      );

  const {
    data:
      existing,
    error:
      existingError,
  } = classId
    ? await existingQuery.eq("class_id", classId).maybeSingle()
    : await existingQuery.eq("campus", campus).is("class_id", null).maybeSingle();


  if (
    existingError
  ) {
    return NextResponse.json(
      {
        error:
          `檢查學生資料失敗：${existingError.message}`,
      },
      {
        status:
          500,
      }
    );
  }


  if (
    existing
  ) {
    return NextResponse.json(
      {
        error:
          classId
            ? `這個班級已經有一位「${name}」。`
            : `${campus} 的未分班名單已經有一位「${name}」。`,
      },
      {
        status:
          409,
      }
    );
  }


  const authSettings =
    await getStudentAuthSettings();

  const pinHash =
    await hashStudentPin(
      authSettings.initialPin
    );


  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(
        "students"
      )
      .insert({
        campus,

        name,

        active:
          true,

        pin_hash:
          pinHash,

        must_change_pin:
          true,

        ...organizationUpdates,
      })
      .select(
        "id,campus,name,active,must_change_pin,created_at,updated_at,region_id,institution_id,class_id,regions(name),institutions(name),classes(name)"
      )
      .single();


  if (
    error
  ) {
    return NextResponse.json(
      {
        error:
          `新增學生失敗：${error.message}`,
      },
      {
        status:
          500,
      }
    );
  }


  return NextResponse.json({
    student: {
      ...data,

      todayCount:
        0,

      passwordStatus:
        "initial",
    },
  });
}


export async function PATCH(
  request:
    NextRequest
) {

  const admin =
    await requireAdmin(
      request
    );

  if (
    !admin
  ) {
    return NextResponse.json(
      {
        error:
          "未登入管理員。",
      },
      {
        status:
          401,
      }
    );
  }


  let body: {
    id?:
      string;

    active?:
      boolean;

    campus?:
      string;

    name?:
      string;

    action?:
      string;

    regionId?: string;
    institutionId?: string;
    classId?: string;
  };


  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "資料格式錯誤。",
      },
      {
        status:
          400,
      }
    );
  }


  const id =
    body.id
      ?.trim();

  if (
    !id
  ) {
    return NextResponse.json(
      {
        error:
          "缺少學生 ID。",
      },
      {
        status:
          400,
      }
    );
  }


  /* -----------------------------------------------------
     Reset daily usage
  ----------------------------------------------------- */

  if (
    body.action ===
    "reset_usage"
  ) {

    const today =
      getTaiwanDateString();

    const {
      error:
        resetError,
    } =
      await supabaseAdmin
        .from(
          "daily_usage"
        )
        .delete()
        .eq(
          "student_id",
          id
        )
        .eq(
          "usage_date",
          today
        );


    if (
      resetError
    ) {
      return NextResponse.json(
        {
          error:
            `重置學生額度失敗：${resetError.message}`,
        },
        {
          status:
            500,
        }
      );
    }


    const aiSettings =
      await getAISolverSettings();


    return NextResponse.json({
      success:
        true,

      studentId:
        id,

      usage: {
        count:
          0,

        limit:
          aiSettings.dailyLimit,

        remaining:
          aiSettings.dailyLimit,
      },
    });
  }


  /* -----------------------------------------------------
     Reset student password to shared initial PIN
  ----------------------------------------------------- */

  if (
    body.action ===
    "reset_pin"
  ) {

    try {
      const result =
        await resetStudentToInitialPin(
          id
        );

      return NextResponse.json({
        success:
          true,

        studentId:
          id,

        mustChangePin:
          true,

        // 這是「共用初始密碼」，不是學生個人明碼。
        // 後台按重設時可顯示給老師確認。
        initialPin:
          result.initialPin,
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
              : "重設學生密碼失敗。",
        },
        {
          status:
            500,
        }
      );
    }
  }


  const updates:
    Record<string, any> = {};


  const hasOrganizationChange =
    typeof body.regionId === "string" ||
    typeof body.institutionId === "string" ||
    typeof body.classId === "string";

  if (hasOrganizationChange) {
    const regionId = body.regionId?.trim() ?? "";
    const institutionId = body.institutionId?.trim() ?? "";
    const classId = body.classId?.trim() ?? "";

    if (!regionId || !institutionId || !classId) {
      return NextResponse.json(
        { error: "請完整選擇地區、合作單位與班級。" },
        { status: 400 },
      );
    }

    const { data: classRow, error: classError } = await supabaseAdmin
      .from("classes")
      .select("id,institution_id")
      .eq("id", classId)
      .maybeSingle();

    if (classError || !classRow || classRow.institution_id !== institutionId) {
      return NextResponse.json(
        { error: "班級與合作單位不一致，請重新選擇。" },
        { status: 400 },
      );
    }

    const { data: institutionRow, error: institutionError } = await supabaseAdmin
      .from("institutions")
      .select("id,region_id")
      .eq("id", institutionId)
      .maybeSingle();

    if (institutionError || !institutionRow || institutionRow.region_id !== regionId) {
      return NextResponse.json(
        { error: "合作單位與地區不一致，請重新選擇。" },
        { status: 400 },
      );
    }

    const { data: regionRow, error: regionError } = await supabaseAdmin
      .from("regions")
      .select("id,name")
      .eq("id", regionId)
      .maybeSingle();

    if (regionError || !regionRow) {
      return NextResponse.json(
        { error: "找不到選擇的地區。" },
        { status: 400 },
      );
    }

    updates.region_id = regionId;
    updates.institution_id = institutionId;
    updates.class_id = classId;
    // 保持舊版學生端仍使用 campus 時可以正常運作。
    updates.campus = `${regionRow.name}班`;
  }


  if (
    typeof body.active ===
    "boolean"
  ) {
    updates.active =
      body.active;
  }


  if (
    typeof body.campus ===
    "string"
  ) {

    const campus =
      body.campus.trim();

    if (
      !CAMPUSES.includes(
        campus as
          (typeof CAMPUSES)[number]
      )
    ) {
      return NextResponse.json(
        {
          error:
            "班級格式錯誤。",
        },
        {
          status:
            400,
        }
      );
    }

    updates.campus =
      campus;
  }


  if (
    typeof body.name ===
    "string"
  ) {

    const name =
      body.name.trim();

    if (
      !name
    ) {
      return NextResponse.json(
        {
          error:
            "學生姓名不可空白。",
        },
        {
          status:
            400,
        }
      );
    }


    if (
      name.length >
      40
    ) {
      return NextResponse.json(
        {
          error:
            "學生姓名過長。",
        },
        {
          status:
            400,
        }
      );
    }

    updates.name =
      name;
  }


  if (
    Object.keys(
      updates
    ).length ===
    0
  ) {
    return NextResponse.json(
      {
        error:
          "沒有需要更新的內容。",
      },
      {
        status:
          400,
      }
    );
  }


  updates.updated_at =
    new Date()
      .toISOString();


  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(
        "students"
      )
      .update(
        updates
      )
      .eq(
        "id",
        id
      )
      .select(
        "id,campus,name,active,must_change_pin,pin_changed_at,last_login_at,created_at,updated_at,region_id,institution_id,class_id,regions(name),institutions(name),classes(name)"
      )
      .single();


  if (
    error
  ) {

    const duplicate =
      error.code ===
        "23505" ||
      error.message
        .toLowerCase()
        .includes(
          "duplicate"
        ) ||
      error.message
        .toLowerCase()
        .includes(
          "unique"
        );


    return NextResponse.json(
      {
        error:
          duplicate
            ? "同一班級已經有同名學生；不同班級可以使用相同姓名。"
            : `更新學生失敗：${error.message}`,
      },
      {
        status:
          duplicate
            ? 409
            : 500,
      }
    );
  }


  return NextResponse.json({
    student:
      data,
  });
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  }

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "資料格式錯誤。" }, { status: 400 });
  }

  const id = body.id?.trim() || "";
  if (!id) return NextResponse.json({ error: "缺少學生 ID。" }, { status: 400 });

  const { data: student, error: studentReadError } = await supabaseAdmin
    .from("students")
    .select("id,name")
    .eq("id", id)
    .maybeSingle();

  if (studentReadError || !student) {
    return NextResponse.json({ error: "找不到學生資料。" }, { status: 404 });
  }

  const { data: histories } = await supabaseAdmin
    .from("solve_history")
    .select("id,image_paths")
    .eq("student_id", id);

  const historyIds = (histories ?? []).map((row) => row.id as string);
  const imagePaths = (histories ?? [])
    .flatMap((row) => Array.isArray(row.image_paths) ? row.image_paths : [])
    .map((item: any) => typeof item === "string" ? item : item?.path)
    .filter((value): value is string => Boolean(value));

  if (historyIds.length) {
    await supabaseAdmin.from("teacher_correction_queue").delete().in("solve_history_id", historyIds);
    await supabaseAdmin.from("solve_followups").delete().in("solve_history_id", historyIds);
  }
  await supabaseAdmin.from("api_usage").delete().eq("student_id", id);
  await supabaseAdmin.from("daily_usage").delete().eq("student_id", id);
  await supabaseAdmin.from("solve_history").delete().eq("student_id", id);

  const { error } = await supabaseAdmin.from("students").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: `刪除學生失敗：${error.message}` }, { status: 500 });
  }

  if (imagePaths.length) {
    await supabaseAdmin.storage.from("solve-images").remove(imagePaths);
  }

  return NextResponse.json({ ok: true, deletedId: id, name: student.name });
}
