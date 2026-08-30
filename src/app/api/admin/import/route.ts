import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import fs from "fs";
import path from "path";
import os from "os";

const AUTH_COOKIE = "finot_admin_session";
const SESSION_TOKEN = process.env.ADMIN_SECRET_KEY || "finot_secret_session_token_key_2017";

let db: any = null;
try {
  const dbModule = require("@/prisma/db");
  db = dbModule.db;
} catch (e) {
  console.warn("Prisma Next Client database import failed. Using JSON fallback.");
}

function getStoragePath(): string {
  const localDir = path.join(process.cwd(), "src", "app", "data");
  try {
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    const testFile = path.join(localDir, ".writable_check");
    fs.writeFileSync(testFile, "ok");
    fs.unlinkSync(testFile);
    return path.join(localDir, "submissions.json");
  } catch {
    return path.join(os.tmpdir(), "finot_submissions.json");
  }
}

const readLocalSubmissions = (): any[] => {
  const jsonFilePath = getStoragePath();
  if (!fs.existsSync(jsonFilePath)) return [];
  try {
    const data = fs.readFileSync(jsonFilePath, "utf8");
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
};

export async function POST(request: Request) {
  try {
    // 1. Verify Admin Session
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE)?.value;
    if (token !== SESSION_TOKEN) {
      return NextResponse.json({ error: "ያልተፈቀደ መዳረሻ (Unauthorized)" }, { status: 401 });
    }

    const body = await request.json();
    const { students } = body;

    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json({ error: "የሚገቡ የተማሪዎች መረጃ አልተገኘም (No data provided)" }, { status: 400 });
    }

    const isDbConfigured = process.env.DATABASE_URL && process.env.DATABASE_URL.length > 0;
    let importedCount = 0;
    let skippedCount = 0;

    if (db && isDbConfigured) {
      try {
        for (const item of students) {
          if (!item.fullName || !item.phoneNumber) {
            skippedCount++;
            continue;
          }

          // Insert Student + Relations
          await db.transaction(async (tx: any) => {
            const student = await tx.orm.public.Student.create({
              fullName: item.fullName || "",
              christianName: item.christianName || "",
              gender: item.gender || "ወንድ",
              birthYear: parseInt(item.birthYear) || 2002,
              birthMonth: item.birthMonth || "ጥር",
              birthDay: parseInt(item.birthDay) || 1,
              phoneNumber: item.phoneNumber || "",
              photoUrl: item.photo || item.photoUrl || "",
              instrument: item.instrument || "በገና",
              sundaySchool: item.sundaySchool || "",
              parishChurch: item.parishChurch || "ቦሌ ሰሚት መካነ ሰላም መድኃኔዓለም እና መጥምቀ መለኮት ቅዱስ ዮሐንስ ቤተክርስቲያን",
              serviceLevel: item.serviceLevel || "ጀማሪ",
            });

            await tx.orm.public.Address.create({
              studentId: student.id,
              subcity: item.subcity || "",
              woreda: item.woreda || "",
              neighborhood: item.neighborhood || "",
              houseNumber: item.houseNumber || "",
            });

            await tx.orm.public.EmergencyContact.create({
              studentId: student.id,
              fullName: item.emergencyFullName || "",
              primaryPhone: item.emergencyPhone || "",
              secondaryPhone: item.emergencyAltPhone || "",
              address: item.emergencyAddress || "",
            });
          });

          importedCount++;
        }

        return NextResponse.json({
          success: true,
          imported: importedCount,
          skipped: skippedCount,
          total: students.length,
          db: true,
        });
      } catch (dbErr: any) {
        console.error("DB import error, saving to JSON fallback:", dbErr.message);
      }
    }

    // JSON Fallback Import
    const jsonFilePath = getStoragePath();
    const dir = path.dirname(jsonFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const currentList = readLocalSubmissions();
    let nextId = currentList.length > 0 ? Math.max(...currentList.map((s: any) => s.id)) + 1 : 1;

    for (const item of students) {
      if (!item.fullName || !item.phoneNumber) {
        skippedCount++;
        continue;
      }

      currentList.push({
        id: nextId++,
        createdAt: item.createdAt || new Date().toISOString(),
        fullName: item.fullName,
        christianName: item.christianName || "",
        gender: item.gender || "ወንድ",
        birthYear: parseInt(item.birthYear) || 2002,
        birthMonth: item.birthMonth || "ጥር",
        birthDay: parseInt(item.birthDay) || 1,
        phoneNumber: item.phoneNumber,
        photoUrl: item.photo || item.photoUrl || "",
        instrument: item.instrument || "በገና",
        sundaySchool: item.sundaySchool || "",
        parishChurch: item.parishChurch || "ቦሌ ሰሚት መካነ ሰላም መድኃኔዓለም እና መጥምቀ መለኮት ቅዱስ ዮሐንስ ቤተክርስቲያን",
        serviceLevel: item.serviceLevel || "ጀማሪ",
        subcity: item.subcity || "",
        woreda: item.woreda || "",
        neighborhood: item.neighborhood || "",
        houseNumber: item.houseNumber || "",
        emergencyFullName: item.emergencyFullName || "",
        emergencyPhone: item.emergencyPhone || "",
        emergencyAltPhone: item.emergencyAltPhone || "",
        emergencyAddress: item.emergencyAddress || "",
      });

      importedCount++;
    }

    fs.writeFileSync(jsonFilePath, JSON.stringify(currentList, null, 2), "utf8");

    return NextResponse.json({
      success: true,
      imported: importedCount,
      skipped: skippedCount,
      total: students.length,
      fallback: true,
    });
  } catch (err: any) {
    console.error("Import error:", err);
    return NextResponse.json({ error: "መረጃዎችን ማስገባት አልተቻለም።" }, { status: 500 });
  }
}
