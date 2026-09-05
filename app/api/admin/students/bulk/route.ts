import { NextRequest, NextResponse } from "next/server";
import { inflateRawSync } from "node:zlib";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminSessionToken } from "@/lib/admin-session";
import { getStudentAuthSettings, hashStudentPin } from "@/lib/student-auth";

export const runtime = "nodejs";

type InvalidRow = { value: string; reason: string };

type ParsedNames = {
  totalRows: number;
  names: string[];
  duplicateInFile: string[];
  invalid: InvalidRow[];
};

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("hh_science_admin_session")?.value;
  if (!token) return null;
  return verifyAdminSessionToken(token);
}

function normalizeName(value: string) {
  return value.replace(/^\uFEFF/, "").replace(/\s+/g, " ").trim();
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function collectNames(values: string[]): ParsedNames {
  const cleaned = values.map(normalizeName);
  const first = cleaned[0]?.toLowerCase();
  const rows = first === "name" || first === "姓名" || first === "學生姓名" ? cleaned.slice(1) : cleaned;

  const seen = new Set<string>();
  const duplicateInFile: string[] = [];
  const invalid: InvalidRow[] = [];
  const names: string[] = [];

  for (const raw of rows) {
    const name = normalizeName(raw);
    if (!name) {
      invalid.push({ value: "", reason: "空白姓名" });
      continue;
    }
    if (name.length > 40) {
      invalid.push({ value: name, reason: "姓名超過 40 字" });
      continue;
    }
    if (seen.has(name)) {
      duplicateInFile.push(name);
      continue;
    }
    seen.add(name);
    names.push(name);
  }

  return {
    totalRows: rows.length,
    names,
    duplicateInFile,
    invalid,
  };
}

function parseCsv(buffer: Buffer): ParsedNames {
  const text = buffer.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").filter((line, index, all) => line.length > 0 || index < all.length - 1);
  const firstColumn = lines.map((line) => parseCsvLine(line)[0] ?? "");
  return collectNames(firstColumn);
}

function readUInt16(buffer: Buffer, offset: number) {
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer: Buffer, offset: number) {
  return buffer.readUInt32LE(offset);
}

function unzipEntry(zip: Buffer, wantedName: string): Buffer | null {
  let eocd = -1;
  const min = Math.max(0, zip.length - 65557);
  for (let i = zip.length - 22; i >= min; i -= 1) {
    if (readUInt32(zip, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Excel 檔案格式不完整。");

  const centralOffset = readUInt32(zip, eocd + 16);
  const totalEntries = readUInt16(zip, eocd + 10);
  let offset = centralOffset;

  for (let entry = 0; entry < totalEntries; entry += 1) {
    if (readUInt32(zip, offset) !== 0x02014b50) break;

    const method = readUInt16(zip, offset + 10);
    const compressedSize = readUInt32(zip, offset + 20);
    const fileNameLength = readUInt16(zip, offset + 28);
    const extraLength = readUInt16(zip, offset + 30);
    const commentLength = readUInt16(zip, offset + 32);
    const localOffset = readUInt32(zip, offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    if (name === wantedName) {
      if (readUInt32(zip, localOffset) !== 0x04034b50) throw new Error("Excel 內容損毀。");
      const localNameLength = readUInt16(zip, localOffset + 26);
      const localExtraLength = readUInt16(zip, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = zip.subarray(dataStart, dataStart + compressedSize);

      if (method === 0) return Buffer.from(compressed);
      if (method === 8) return inflateRawSync(compressed);
      throw new Error("Excel 使用了目前不支援的壓縮格式。");
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return null;
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function parseSharedStrings(xml: string) {
  const strings: string[] = [];
  const siMatches = xml.match(/<(?:\w+:)?si(?:\s[^>]*)?>[\s\S]*?<\/(?:\w+:)?si>/g) ?? [];
  for (const si of siMatches) {
    const parts = [...si.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((match) => decodeXml(match[1] ?? ""));
    strings.push(parts.join(""));
  }
  return strings;
}

function cellColumn(cellRef: string) {
  const letters = cellRef.match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  let value = 0;
  for (const char of letters) value = value * 26 + char.charCodeAt(0) - 64;
  return value;
}

function parseXlsx(buffer: Buffer): ParsedNames {
  const sharedXml = unzipEntry(buffer, "xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];
  const sheet = unzipEntry(buffer, "xl/worksheets/sheet1.xml")?.toString("utf8");
  if (!sheet) throw new Error("Excel 找不到第一個工作表。");

  const values: string[] = [];
  const rowMatches = sheet.match(/<(?:\w+:)?row(?:\s[^>]*)?>[\s\S]*?<\/(?:\w+:)?row>/g) ?? [];

  for (const row of rowMatches) {
    let firstColumnValue = "";
    const cellMatches = row.match(/<(?:\w+:)?c(?:\s[^>]*)?>[\s\S]*?<\/(?:\w+:)?c>/g) ?? [];
    for (const cell of cellMatches) {
      const ref = cell.match(/\sr="([^"]+)"/)?.[1] ?? "A1";
      if (cellColumn(ref) !== 1) continue;

      const type = cell.match(/\st="([^"]+)"/)?.[1] ?? "";
      if (type === "inlineStr") {
        const parts = [...cell.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((match) => decodeXml(match[1] ?? ""));
        firstColumnValue = parts.join("");
      } else {
        const raw = cell.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1] ?? "";
        if (type === "s") firstColumnValue = shared[Number(raw)] ?? "";
        else firstColumnValue = decodeXml(raw);
      }
      break;
    }
    values.push(firstColumnValue);
  }

  return collectNames(values);
}

async function resolveOrganization(regionId: string, institutionId: string, classId: string) {
  if (!regionId || !institutionId || !classId) throw new Error("請完整選擇地區、合作單位與班級。");

  const { data: classRow, error: classError } = await supabaseAdmin
    .from("classes")
    .select("id,institution_id,name")
    .eq("id", classId)
    .maybeSingle();
  if (classError || !classRow || classRow.institution_id !== institutionId) throw new Error("班級與合作單位不一致，請重新選擇。");

  const { data: institutionRow, error: institutionError } = await supabaseAdmin
    .from("institutions")
    .select("id,region_id,name")
    .eq("id", institutionId)
    .maybeSingle();
  if (institutionError || !institutionRow || institutionRow.region_id !== regionId) throw new Error("合作單位與地區不一致，請重新選擇。");

  const { data: regionRow, error: regionError } = await supabaseAdmin
    .from("regions")
    .select("id,name")
    .eq("id", regionId)
    .maybeSingle();
  if (regionError || !regionRow) throw new Error("找不到選擇的地區。");

  return {
    campus: `${regionRow.name}班`,
    regionName: regionRow.name as string,
    institutionName: institutionRow.name as string,
    className: classRow.name as string,
  };
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });

  try {
    const form = await request.formData();
    const action = String(form.get("action") ?? "preview");
    const regionId = String(form.get("regionId") ?? "").trim();
    const institutionId = String(form.get("institutionId") ?? "").trim();
    const classId = String(form.get("classId") ?? "").trim();
    const file = form.get("file");

    if (!(file instanceof File)) return NextResponse.json({ error: "請選擇要匯入的 CSV 或 Excel 檔案。" }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "名單檔案請控制在 5 MB 以內。" }, { status: 400 });

    const organization = await resolveOrganization(regionId, institutionId, classId);
    const bytes = Buffer.from(await file.arrayBuffer());
    const lowerName = file.name.toLowerCase();
    const parsed = lowerName.endsWith(".xlsx") ? parseXlsx(bytes) : lowerName.endsWith(".csv") ? parseCsv(bytes) : null;
    if (!parsed) return NextResponse.json({ error: "目前只支援 .csv 與 .xlsx 名單。" }, { status: 400 });

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("students")
      .select("name")
      .eq("campus", organization.campus);
    if (existingError) throw new Error(`檢查既有學生失敗：${existingError.message}`);

    const existingSet = new Set((existingRows ?? []).map((row) => normalizeName(String(row.name ?? ""))));
    const existing = parsed.names.filter((name) => existingSet.has(name));
    const importable = parsed.names.filter((name) => !existingSet.has(name));

    const preview = {
      totalRows: parsed.totalRows,
      validCount: parsed.names.length,
      importableCount: importable.length,
      duplicateInFile: parsed.duplicateInFile,
      existing,
      invalid: parsed.invalid,
      names: importable,
      target: `${organization.regionName} · ${organization.institutionName} · ${organization.className}`,
    };

    if (action === "preview") return NextResponse.json({ preview });
    if (action !== "import") return NextResponse.json({ error: "不支援的匯入動作。" }, { status: 400 });

    if (importable.length === 0) {
      return NextResponse.json({ inserted: 0, skipped: parsed.totalRows, total: parsed.totalRows, preview });
    }

    const authSettings = await getStudentAuthSettings();
    const pinHash = await hashStudentPin(authSettings.initialPin);

    const rows = importable.map((name) => ({
      campus: organization.campus,
      name,
      active: true,
      pin_hash: pinHash,
      must_change_pin: true,
      region_id: regionId,
      institution_id: institutionId,
      class_id: classId,
    }));

    const { data: insertedRows, error: insertError } = await supabaseAdmin
      .from("students")
      .insert(rows)
      .select("id,name");

    if (insertError) throw new Error(`批次新增學生失敗：${insertError.message}`);

    const inserted = insertedRows?.length ?? 0;
    const skipped = parsed.totalRows - inserted;

    return NextResponse.json({
      inserted,
      skipped,
      total: parsed.totalRows,
      names: insertedRows?.map((row) => row.name) ?? [],
      initialPinApplied: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "批次匯入學生失敗。" },
      { status: 500 },
    );
  }
}
