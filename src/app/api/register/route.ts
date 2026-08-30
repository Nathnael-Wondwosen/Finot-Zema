import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

// Try to import DB safely (Prisma Next client)
let db: any = null;
try {
  const dbModule = require("@/prisma/db");
  db = dbModule.db;
} catch (e) {
  console.warn("Prisma Next Client database import failed. Using JSON fallback.");
}

// Resilient file storage path (supports local development and Vercel serverless)
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

// Helper to read submissions from JSON fallback
const readLocalSubmissions = (): any[] => {
  const jsonFilePath = getStoragePath();
  if (!fs.existsSync(jsonFilePath)) return [];
  try {
    const data = fs.readFileSync(jsonFilePath, "utf8");
    return JSON.parse(data);
  } catch (e) {
    console.error("Failed to read local submissions.json", e);
    return [];
  }
};

// Helper to write to JSON fallback
const saveToLocalJson = (payload: any) => {
  const jsonFilePath = getStoragePath();
  const dir = path.dirname(jsonFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const submissions = readLocalSubmissions();
  const nextId = submissions.length > 0 ? Math.max(...submissions.map((s: any) => s.id)) + 1 : 1;
  const newSubmission = {
    id: nextId,
    createdAt: new Date().toISOString(),
    ...payload,
  };

  submissions.push(newSubmission);
  fs.writeFileSync(jsonFilePath, JSON.stringify(submissions, null, 2), "utf8");
  return newSubmission;
};

// Helper to check if duplicate registration in the same year exists
const isDuplicateRegistration = (
  existingList: any[],
  phone: string,
  instrument: string
) => {
  const currentYear = new Date().getFullYear();
  const normalizedPhone = (phone || "").replace(/[\s\-]/g, "");

  return existingList.some((record: any) => {
    const recordPhone = (record.phoneNumber || record.phone || "").replace(/[\s\-]/g, "");
    const recordYear = record.createdAt ? new Date(record.createdAt).getFullYear() : currentYear;

    return (
      recordPhone === normalizedPhone &&
      record.instrument === instrument &&
      recordYear === currentYear
    );
  });
};

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Basic validation check
    const birthYear = parseInt(body.birthYear);
    const currentEthYear = 2017;
    const calculatedAge = currentEthYear - (birthYear || currentEthYear);

    if (!birthYear || calculatedAge < 15) {
      return NextResponse.json(
        { error: `የተማሪው ዕድሜ ከ15 ዓመት በላይ መሆን አለበት! (የአሁኑ ዕድሜ፡ ${calculatedAge || 0} ዓመት)` },
        { status: 400 }
      );
    }

    if (!body.photo || !body.photo.trim()) {
      return NextResponse.json(
        { error: "የተማሪ ፎቶ ማስገባት ግዴታ ነው!" },
        { status: 400 }
      );
    }

    if (!body.fullName || !body.fullName.trim()) {
      return NextResponse.json(
        { error: "ሙሉ ስም እስከ አያት ማስገባት ግዴታ ነው!" },
        { status: 400 }
      );
    }

    if (!body.phoneNumber || !body.phoneNumber.trim()) {
      return NextResponse.json(
        { error: "የስልክ ቁጥር ማስገባት ግዴታ ነው!" },
        { status: 400 }
      );
    }

    // 2. Check for Duplicate Registration (Same student + Same instrument + Same year)
    const isDbConfigured = process.env.DATABASE_URL && process.env.DATABASE_URL.length > 0;

    if (db && isDbConfigured) {
      try {
        const existingStudents = await db.orm.public.Student
          .where((s: any) => s.phoneNumber.eq(body.phoneNumber))
          .where((s: any) => s.instrument.eq(body.instrument))
          .all();

        const currentYear = new Date().getFullYear();
        const hasDuplicateInDb = existingStudents.some((s: any) => {
          const regYear = s.createdAt ? new Date(s.createdAt).getFullYear() : currentYear;
          return regYear === currentYear;
        });

        if (hasDuplicateInDb) {
          return NextResponse.json(
            {
              error: `ይህ ተማሪ (${body.phoneNumber}) በዚህ ዓመት ለ"${body.instrument}" አስቀድሞ ተመዝግቧል። በአንድ ዓመት ውስጥ ለተመሳሳይ የዜማ መሣሪያ ከአንድ ጊዜ በላይ መመዝገብ አይቻልም።`,
              duplicate: true,
            },
            { status: 400 }
          );
        }

        // Run database transaction to insert student, address, and emergency contact
        const result = await db.transaction(async (tx: any) => {
          const student = await tx.orm.public.Student.create({
            fullName: body.fullName || "",
            christianName: body.christianName || "",
            gender: body.gender || "",
            birthYear: birthYear,
            birthMonth: body.birthMonth || "ጥር",
            birthDay: parseInt(body.birthDay) || 1,
            phoneNumber: body.phoneNumber || "",
            photoUrl: body.photo || "",
            instrument: body.instrument || "",
            sundaySchool: body.sundaySchool || "",
            parishChurch: body.parishChurch || "",
            serviceLevel: body.serviceLevel || "ጀማሪ",
          });

          await tx.orm.public.Address.create({
            studentId: student.id,
            subcity: body.subcity || "",
            woreda: body.woreda || "",
            neighborhood: body.neighborhood || "",
            houseNumber: body.houseNumber || "",
          });

          await tx.orm.public.EmergencyContact.create({
            studentId: student.id,
            fullName: body.emergencyFullName || "",
            primaryPhone: body.emergencyPhone || "",
            secondaryPhone: body.emergencyAltPhone || "",
            address: body.emergencyAddress || "",
          });

          return student;
        });

        return NextResponse.json({ success: true, db: true, id: result.id });
      } catch (dbErr: any) {
        console.error("Database save failed. Falling back to JSON storage:", dbErr.message);
        
        const localList = readLocalSubmissions();
        if (isDuplicateRegistration(localList, body.phoneNumber, body.instrument)) {
          return NextResponse.json(
            {
              error: `ይህ ተማሪ (${body.phoneNumber}) በዚህ ዓመት ለ"${body.instrument}" አስቀድሞ ተመዝግቧል። በአንድ ዓመት ውስጥ ለተመሳሳይ የዜማ መሣሪያ ከአንድ ጊዜ በላይ መመዝገብ አይቻልም።`,
              duplicate: true,
            },
            { status: 400 }
          );
        }

        const saved = saveToLocalJson(body);
        return NextResponse.json({ success: true, db: false, fallback: true, id: saved.id });
      }
    } else {
      const localList = readLocalSubmissions();
      if (isDuplicateRegistration(localList, body.phoneNumber, body.instrument)) {
        return NextResponse.json(
          {
            error: `ይህ ተማሪ (${body.phoneNumber}) በዚህ ዓመት ለ"${body.instrument}" አስቀድሞ ተመዝግቧል። በአንድ ዓመት ውስጥ ለተመሳሳይ የዜማ መሣሪያ ከአንድ ጊዜ በላይ መመዝገብ አይቻልም።`,
            duplicate: true,
          },
          { status: 400 }
        );
      }

      const saved = saveToLocalJson(body);
      return NextResponse.json({ success: true, db: false, fallback: true, id: saved.id });
    }
  } catch (err: any) {
    console.error("Registration endpoint error:", err);
    return NextResponse.json(
      { error: "ማስገቢያው በትክክል አልተሰራም። እባክዎ እንደገና ይሞክሩ።" },
      { status: 500 }
    );
  }
}

// Support fetching data (used by admin panel)
export async function GET() {
  try {
    const isDbConfigured = process.env.DATABASE_URL && process.env.DATABASE_URL.length > 0;
    
    if (db && isDbConfigured) {
      try {
        const students = await db.orm.public.Student
          .include('address')
          .include('emergencyContact')
          .all();
          
        return NextResponse.json(students);
      } catch (dbErr) {
        console.error("Database fetch failed. Loading local JSON fallback:", dbErr);
      }
    }

    const submissions = readLocalSubmissions();
    return NextResponse.json(submissions);
  } catch (err) {
    return NextResponse.json({ error: "መረጃዎችን መጫን አልተቻለም።" }, { status: 500 });
  }
}
