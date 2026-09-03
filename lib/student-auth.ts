import bcrypt from "bcryptjs";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";


export const DEFAULT_INITIAL_STUDENT_PIN =
  "258258";


export type StudentAuthSettings = {
  initialPin:
    string;
};


export function isValidStudentPin(
  value:
    string
) {
  return /^\d{4,6}$/.test(
    value
  );
}


export async function getStudentAuthSettings():
  Promise<StudentAuthSettings> {

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(
        "app_settings"
      )
      .select(
        "value"
      )
      .eq(
        "id",
        "student_auth"
      )
      .maybeSingle();

  if (
    error
  ) {
    console.error(
      "Student auth settings read error:",
      error
    );
  }

  const raw =
    String(
      data
        ?.value
        ?.initial_pin ||
      ""
    ).trim();

  return {
    initialPin:
      isValidStudentPin(
        raw
      )
        ? raw
        : DEFAULT_INITIAL_STUDENT_PIN,
  };
}


export async function hashStudentPin(
  pin:
    string
) {
  if (
    !isValidStudentPin(
      pin
    )
  ) {
    throw new Error(
      "登入密碼必須為 4～6 位數字。"
    );
  }

  return bcrypt.hash(
    pin,
    12
  );
}


export async function verifyStudentPin(
  pin:
    string,
  hash:
    string
) {
  if (
    !pin ||
    !hash
  ) {
    return false;
  }

  return bcrypt.compare(
    pin,
    hash
  );
}


export async function resetStudentToInitialPin(
  studentId:
    string
) {

  const settings =
    await getStudentAuthSettings();

  const pinHash =
    await hashStudentPin(
      settings.initialPin
    );

  const {
    error,
  } =
    await supabaseAdmin
      .from(
        "students"
      )
      .update({
        pin_hash:
          pinHash,

        must_change_pin:
          true,

        pin_changed_at:
          null,

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        studentId
      );

  if (
    error
  ) {
    throw new Error(
      `重設學生密碼失敗：${error.message}`
    );
  }

  return {
    initialPin:
      settings.initialPin,
  };
}
