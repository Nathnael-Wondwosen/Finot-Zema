"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  getEthiopianYear,
  formatEthiopianDateTime,
} from "@/lib/ethiopianCalendar";

interface Address {
  subcity: string;
  woreda: string;
  neighborhood?: string;
  houseNumber?: string;
}

interface EmergencyContact {
  fullName: string;
  primaryPhone: string;
  secondaryPhone?: string;
  address: string;
}

interface Student {
  id: number;
  fullName: string;
  christianName: string;
  gender: string;
  birthYear: number;
  birthMonth: string;
  birthDay: number;
  phoneNumber: string;
  photoUrl: string;
  photo?: string;
  instrument: string;
  sundaySchool?: string;
  parishChurch: string;
  serviceLevel: string;
  createdAt: string;
  address?: Address;
  emergencyContact?: EmergencyContact;
  // Fallback direct storage keys
  subcity?: string;
  woreda?: string;
  neighborhood?: string;
  houseNumber?: string;
  emergencyFullName?: string;
  emergencyPhone?: string;
  emergencyAltPhone?: string;
  emergencyAddress?: string;
}

const instruments = [
  { id: "በገና", name: "በገና", image: "/instruments/begena.jpg" },
  { id: "ማሲንቆ", name: "ማሲንቆ", image: "/instruments/masinko.jpg" },
  { id: "ከበሮ", name: "ከበሮ", image: "/instruments/kebero.jpg" },
  { id: "መለከት", name: "መለከት", image: "/instruments/meleket.jpg" },
  { id: "ነጋሪት", name: "ነጋሪት", image: "/instruments/negarit.jpg" },
];

export default function AdminDashboard() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [loginUsername, setLoginUsername] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>("");

  // Data state
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Filters state
  const [search, setSearch] = useState<string>("");
  const [instrumentFilter, setInstrumentFilter] = useState<string>("all");
  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [serviceLevelFilter, setServiceLevelFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");

  // Import Modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [importStatus, setImportStatus] = useState<string>("");
  const [parsedImportData, setParsedImportData] = useState<any[]>([]);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Helper to reliably get student photo
  const getStudentPhoto = (s: Student | null | undefined): string => {
    if (!s) return "";
    return s.photoUrl || s.photo || (s as any).image || "";
  };

  // Helper to get instrument icon image
  const getInstrumentImage = (instName: string): string => {
    const found = instruments.find((i) => i.id === instName || i.name === instName);
    return found ? found.image : "/instruments/begena.jpg";
  };

  // 1. Check Authentication Status
  const checkAuth = async () => {
    try {
      const res = await fetch("/api/admin/auth");
      if (res.ok) {
        setIsAuthenticated(true);
        fetchStudents();
      } else {
        setIsAuthenticated(false);
      }
    } catch {
      setIsAuthenticated(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });

      const data = await res.json();
      if (res.ok) {
        setIsAuthenticated(true);
        fetchStudents();
      } else {
        setLoginError(data.error || "የተሳሳተ የመግቢያ መረጃ።");
      }
    } catch {
      setLoginError("ከአገልጋዩ ጋር መገናኘት አልተቻለም።");
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      await fetch("/api/admin/auth", { method: "DELETE" });
      setIsAuthenticated(false);
      setStudents([]);
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch registered students
  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/register");
      if (res.ok) {
        const data = await res.json();
        setStudents(data);
      }
    } catch (e) {
      console.error("Failed to fetch students", e);
    } finally {
      setLoading(false);
    }
  };

  // Extract list of unique registration years in Ethiopian Calendar (ዓ.ም)
  const availableYears = Array.from(
    new Set(students.map((s) => getEthiopianYear(s.createdAt).toString()))
  ).sort((a, b) => parseInt(b) - parseInt(a));

  // Filter students based on all active filter criteria
  const filteredStudents = students.filter((s) => {
    // 1. Search Query
    const query = search.toLowerCase();
    const matchesSearch =
      !search ||
      s.fullName.toLowerCase().includes(query) ||
      s.christianName.toLowerCase().includes(query) ||
      s.phoneNumber.includes(query) ||
      s.parishChurch.toLowerCase().includes(query) ||
      (s.address?.subcity && s.address.subcity.toLowerCase().includes(query)) ||
      (s.subcity && s.subcity.toLowerCase().includes(query)) ||
      s.id.toString() === query;

    // 2. Instrument Filter
    const matchesInstrument =
      instrumentFilter === "all" || s.instrument === instrumentFilter;

    // 3. Gender Filter
    const matchesGender =
      genderFilter === "all" || s.gender === genderFilter;

    // 4. Service Level Filter
    const matchesServiceLevel =
      serviceLevelFilter === "all" || s.serviceLevel === serviceLevelFilter;

    // 5. Year Filter (in Ethiopian Calendar)
    const ethYear = getEthiopianYear(s.createdAt).toString();
    const matchesYear = yearFilter === "all" || ethYear === yearFilter;

    return (
      matchesSearch &&
      matchesInstrument &&
      matchesGender &&
      matchesServiceLevel &&
      matchesYear
    );
  });

  // Calculate statistics
  const stats = {
    total: students.length,
    begena: students.filter((s) => s.instrument === "በገና").length,
    masinko: students.filter((s) => s.instrument === "ማሲንቆ").length,
    kebero: students.filter((s) => s.instrument === "ከበሮ").length,
    meleket: students.filter((s) => s.instrument === "መለከት").length,
    negarit: students.filter((s) => s.instrument === "ነጋሪት").length,
  };

  // Helper to extract address safely
  const getAddress = (s: Student) => {
    if (s.address) {
      return `${s.address.subcity}፣ ወረዳ ${s.address.woreda}${
        s.address.neighborhood ? ` (ልዩ ስም፡ ${s.address.neighborhood})` : ""
      }${s.address.houseNumber ? `፣ የቤት ቁጥር ${s.address.houseNumber}` : ""}`;
    }
    return `${s.subcity || ""}፣ ወረዳ ${s.woreda || ""}${
      s.neighborhood ? ` (ልዩ ስም፡ ${s.neighborhood})` : ""
    }${s.houseNumber ? `፣ የቤት ቁጥር ${s.houseNumber}` : ""}`;
  };

  // Helper to extract emergency contact safely
  const getEmergencyContact = (s: Student) => {
    if (s.emergencyContact) {
      return s.emergencyContact;
    }
    return {
      fullName: s.emergencyFullName || "",
      primaryPhone: s.emergencyPhone || "",
      secondaryPhone: s.emergencyAltPhone || "",
      address: s.emergencyAddress || "",
    };
  };

  // 1. Export to Excel / CSV with UTF-8 BOM and Ethiopian Local Date & Time
  const exportToCSV = () => {
    const headers = [
      "መለያ ቁጥር",
      "ሙሉ ስም",
      "የክርስትና ስም",
      "ጾታ",
      "የትውልድ ቀን (ዓ.ም)",
      "ስልክ ቁጥር",
      "የዜማ መሣሪያ",
      "ደብር / ቤተክርስቲያን",
      "ሰንበት ት/ቤት",
      "የአገልግሎት ደረጃ",
      "ክፍለ ከተማ",
      "ወረዳ",
      "የሰፈር ልዩ ስም",
      "የቤት ቁጥር",
      "የተጠሪ ሙሉ ስም",
      "የተጠሪ ስልክ",
      "የተጠሪ ተለዋጭ ስልክ",
      "የተጠሪ አድራሻ",
      "የተመዘገበበት ቀንና ሰዓት (በኢትዮጵያ አቆጣጠር)",
    ];

    const rows = filteredStudents.map((s) => {
      const addr = s.address || {
        subcity: s.subcity || "",
        woreda: s.woreda || "",
        neighborhood: s.neighborhood || "",
        houseNumber: s.houseNumber || "",
      };
      const em = getEmergencyContact(s);
      return [
        s.id,
        `"${s.fullName.replace(/"/g, '""')}"`,
        `"${s.christianName.replace(/"/g, '""')}"`,
        s.gender,
        `"${s.birthDay}/${s.birthMonth}/${s.birthYear} ዓ.ም"`,
        `"${s.phoneNumber}"`,
        `"${s.instrument}"`,
        `"${s.parishChurch.replace(/"/g, '""')}"`,
        `"${(s.sundaySchool || "").replace(/"/g, '""')}"`,
        `"${s.serviceLevel}"`,
        `"${addr.subcity}"`,
        `"${addr.woreda}"`,
        `"${addr.neighborhood || ""}"`,
        `"${addr.houseNumber || ""}"`,
        `"${em.fullName.replace(/"/g, '""')}"`,
        `"${em.primaryPhone}"`,
        `"${em.secondaryPhone || ""}"`,
        `"${(em.address || "").replace(/"/g, '""')}"`,
        `"${formatEthiopianDateTime(s.createdAt)}"`,
      ].join(",");
    });

    // Prepend UTF-8 BOM (\uFEFF) so Excel displays Amharic characters perfectly
    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute(
      "download",
      `ፍኖተ_ሰላም_የተማሪዎች_ዝርዝር_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // 2. Export to JSON
  const exportToJSON = () => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(filteredStudents, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute(
      "download",
      `ፍኖተ_ሰላም_የተማሪዎች_መረጃ_${new Date().toISOString().split("T")[0]}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // 3. Handle File Selection for Import (JSON or CSV)
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      try {
        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            setParsedImportData(parsed);
            setImportStatus(`የተዘጋጀ የJSON ፋይል ተገኝቷል (${parsed.length} ተማሪዎች)`);
          } else {
            setImportStatus("ስህተት፡ ፋይሉ የተማሪዎች ዝርዝር (Array) መያዝ አለበት።");
          }
        } else if (file.name.endsWith(".csv")) {
          const lines = content.split(/\r\n|\n/).filter((l) => l.trim().length > 0);
          if (lines.length > 1) {
            const records: any[] = [];
            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(",").map((c) => c.replace(/^"|"$/g, "").trim());
              if (cols.length >= 6) {
                records.push({
                  fullName: cols[1] || cols[0],
                  christianName: cols[2] || "",
                  gender: cols[3] || "ወንድ",
                  phoneNumber: cols[5] || cols[4],
                  instrument: cols[6] || "በገና",
                  parishChurch: cols[7] || "ቦሌ ሰሚት መካነ ሰላም መድኃኔዓለም እና መጥምቀ መለኮት ቅዱስ ዮሐንስ ቤተክርስቲያን",
                  serviceLevel: cols[9] || "ጀማሪ",
                  subcity: cols[10] || "",
                  woreda: cols[11] || "",
                  emergencyFullName: cols[14] || "",
                  emergencyPhone: cols[15] || "",
                });
              }
            }
            setParsedImportData(records);
            setImportStatus(`የተዘጋጀ የCSV ፋይል ተገኝቷል (${records.length} ተማሪዎች)`);
          }
        }
      } catch (err: any) {
        setImportStatus(`ስህተት፡ ፋይሉን ማንበብ አልተቻለም (${err.message})`);
      }
    };
    reader.readAsText(file);
  };

  // Submit parsed data for batch database import
  const submitImport = async () => {
    if (parsedImportData.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students: parsedImportData }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`በተሳካ ሁኔታ ${data.imported} ተማሪዎች ወደ ዳታቤዝ ገብተዋል!`);
        setIsImportModalOpen(false);
        setParsedImportData([]);
        setImportStatus("");
        fetchStudents();
      } else {
        alert(`ስህተት፡ ${data.error}`);
      }
    } catch {
      alert("ከአገልጋዩ ጋር መገናኘት አልተቻለም።");
    } finally {
      setImporting(false);
    }
  };

  /* ─────────────────────────────────────────────────────────────
     VIEW 1: Loading Authentication Screen
  ───────────────────────────────────────────────────────────── */
  if (isAuthenticated === null) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center py-24 text-slate-500">
        <svg className="animate-spin h-10 w-10 text-emerald-600 mb-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="font-semibold text-sm">የይለፍ ቃል ሁኔታ በማረጋገጥ ላይ...</p>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     VIEW 2: Protected Admin Login Screen
  ───────────────────────────────────────────────────────────── */
  if (isAuthenticated === false) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center p-4 min-h-[80vh]">
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xl p-8 sm:p-10 max-w-md w-full text-center animate-fade-in relative overflow-hidden">
          {/* Top subtle decorative strip */}
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-600 via-yellow-500 to-red-600"></div>

          {/* Logo */}
          <div className="w-24 h-24 rounded-full overflow-hidden mx-auto mb-4 drop-shadow-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>

          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 mb-2 inline-block">
            ቦሌ ሰሚት መካነ ሰላም መድኃኔዓለም ቤተክርስቲያን
          </span>

          <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight mt-1">
            የአስተዳዳሪ መግቢያ (Admin)
          </h2>
          <p className="text-xs text-slate-500 mt-1 mb-6 font-medium">
            የተማሪዎችን መረጃ ለማየት እባክዎ የምስጢር ቁጥርዎን ያስገቡ
          </p>

          {loginError && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2 text-left">
              <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">የተጠቃሚ ስም (Username)</label>
              <input
                type="text"
                required
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="admin"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">የይለፍ ቃል (Password)</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-11 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold rounded-xl transition shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 text-sm mt-2"
            >
              {loginLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  በማረጋገጥ ላይ...
                </>
              ) : (
                "ግባ (Login)"
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <Link href="/" className="text-emerald-700 hover:underline font-semibold flex items-center gap-1">
              ← ወደ ምዝገባ ገጽ ተመለስ
            </Link>
            <span className="text-slate-400">ደህንነቱ የተጠበቀ</span>
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     VIEW 3: Authenticated Admin Portal
  ───────────────────────────────────────────────────────────── */
  return (
    <div className="flex-grow flex flex-col py-8 px-4 md:px-8 w-full max-w-7xl mx-auto">
      {/* Top Header */}
      <header className="mb-8 flex flex-col md:flex-row items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="flex items-center gap-4 text-center md:text-left">
          <div className="w-16 h-16 rounded-full overflow-hidden drop-shadow-sm flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="ፍኖተ ሰላም" className="w-full h-full object-contain" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-emerald-700 block">
              ቦሌ ሰሚት መካነ ሰላም መድኃኔዓለም እና መጥምቀ መለኮት ቅዱስ ዮሐንስ ቤተክርስቲያን
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold text-emerald-900 tracking-tight">
              ፍኖተ ሰላም — የምዝገባ መቆጣጠሪያ ፓነል (Admin)
            </h1>
            <p className="text-slate-500 mt-0.5 text-xs font-medium">የተመዘገቡ ተማሪዎች መረጃ ዝርዝር፣ ማጣሪያ፣ ኤክስፖርት እና ዳታቤዝ አስተዳደር</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap justify-center items-center gap-2.5">
          {/* Refresh */}
          <button
            onClick={fetchStudents}
            className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 font-semibold rounded-xl text-xs transition flex items-center gap-1.5 text-slate-700 shadow-sm"
          >
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3m-3-3v12" />
            </svg>
            አድስ
          </button>

          {/* Import to DB */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition flex items-center gap-1.5 shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            መረጃ አስገባ (Import)
          </button>

          {/* Export to CSV/Excel */}
          <button
            onClick={exportToCSV}
            disabled={students.length === 0}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 text-white font-semibold rounded-xl text-xs transition flex items-center gap-1.5 shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            Excel / CSV
          </button>

          {/* Register New */}
          <Link
            href="/"
            className="px-3.5 py-2 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-semibold rounded-xl text-xs transition flex items-center gap-1.5 shadow-sm"
          >
            + ተማሪ መዝግብ
          </Link>

          {/* Logout */}
          <button
            onClick={handleLogout}
            title="ከአስተዳዳሪ ክፍል ውጣ"
            className="px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 font-semibold rounded-xl text-xs transition flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            ውጣ
          </button>
        </div>
      </header>

      {/* Stats Cards Section */}
      <section className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-extrabold text-slate-800">{stats.total}</span>
          <span className="text-xs text-slate-400 font-semibold mt-1">ጠቅላላ ተማሪዎች</span>
        </div>
        {instruments.map((inst) => {
          const keyMap: Record<string, number> = {
            "በገና": stats.begena,
            "ማሲንቆ": stats.masinko,
            "ከበሮ": stats.kebero,
            "መለከት": stats.meleket,
            "ነጋሪት": stats.negarit,
          };
          const count = keyMap[inst.id] ?? 0;
          return (
            <div key={inst.id} className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
              <div className="w-9 h-9 rounded-xl overflow-hidden bg-[#f7f2ea] p-1 mb-1 border border-slate-100 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={inst.image} alt={inst.name} className="w-full h-full object-contain" />
              </div>
              <span className="text-lg font-bold text-emerald-700">{count}</span>
              <span className="text-xs text-slate-500 font-semibold">{inst.name}</span>
            </div>
          );
        })}
      </section>

      {/* Advanced Filtering Controls Toolbar */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm mb-6 flex flex-col gap-4">
        {/* Row 1: Search & Filter Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* 1. Search Box */}
          <div className="relative md:col-span-2">
            <input
              type="text"
              placeholder="በተማሪ ስም፣ ክርስትና ስም፣ ስልክ ወይም ደብር ፈልግ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition text-xs font-medium"
            />
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* 2. Registration Year Filter in Ethiopian Calendar (ዓ.ም) */}
          <div>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition text-slate-700"
            >
              <option value="all">የምዝገባ ዓመት፡ ሁሉም</option>
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>ዓመት፡ {yr} ዓ.ም</option>
              ))}
            </select>
          </div>

          {/* 3. Gender Filter */}
          <div>
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition text-slate-700"
            >
              <option value="all">ጾታ፡ ሁሉም</option>
              <option value="ወንድ">ወንድ</option>
              <option value="ሴት">ሴት</option>
            </select>
          </div>

          {/* 4. Service Level Filter */}
          <div>
            <select
              value={serviceLevelFilter}
              onChange={(e) => setServiceLevelFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition text-slate-700"
            >
              <option value="all">የአገልግሎት ደረጃ፡ ሁሉም</option>
              <option value="ጀማሪ">ጀማሪ</option>
              <option value="ዘማሪ">ዘማሪ</option>
              <option value="የሰንበት ተማሪ">የሰንበት ተማሪ</option>
              <option value="ዲያቆን">ዲያቆን</option>
              <option value="ሌላ">ሌላ</option>
            </select>
          </div>
        </div>

        {/* Row 2: Instrument Pills & Quick Count Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400 mr-1">የዜማ መሣሪያ፡</span>
            <button
              onClick={() => setInstrumentFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                instrumentFilter === "all"
                  ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              ሁሉም ({students.length})
            </button>
            {instruments.map((inst) => (
              <button
                key={inst.id}
                onClick={() => setInstrumentFilter(inst.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                  instrumentFilter === inst.id
                    ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>{inst.name}</span>
              </button>
            ))}
          </div>

          <div className="text-xs font-semibold text-slate-500">
            የተጣሩ ተማሪዎች፡ <span className="font-extrabold text-emerald-800">{filteredStudents.length}</span> / {students.length}
          </div>
        </div>
      </section>

      {/* Main Student List Table */}
      <section className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden flex-grow flex flex-col">
        {loading ? (
          <div className="flex-grow flex flex-col items-center justify-center py-20 text-slate-400 my-auto">
            <svg className="animate-spin h-10 w-10 text-emerald-600 mb-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="font-semibold text-sm">መረጃዎች በመጫን ላይ ናቸው...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="flex-grow flex flex-col items-center justify-center py-20 text-slate-400 my-auto text-center px-4">
            <svg className="w-16 h-16 text-slate-200 mb-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0110.089 20M3.112 18.914a1.018 1.018 0 010-1.317 11.312 11.312 0 018.667-3.3M11.75 14.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M3.112 18.914a1.018 1.018 0 000 1.317 11.312 11.312 0 008.667 3.3m0-11.233a9.06 9.06 0 00-2.347-.304 9.03 9.03 0 00-4.12.952 4.125 4.125 0 007.533 2.493M9.008 11.969a3.75 3.75 0 114.95 0M8.963 8.242a3.75 3.75 0 114.95 0" />
            </svg>
            <h3 className="text-lg font-bold text-slate-600">ምንም ተማሪ አልተገኘም</h3>
            <p className="text-xs text-slate-400 mt-1">የፍለጋ ቃሉን ወይም ማጣሪያዎችን ይቀይሩ።</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-slate-500">
              <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-xs border-b border-slate-100">
                <tr>
                  <th scope="col" className="px-6 py-4">ተማሪ / ስም</th>
                  <th scope="col" className="px-6 py-4">የክርስትና ስም</th>
                  <th scope="col" className="px-6 py-4">ጾታ</th>
                  <th scope="col" className="px-6 py-4">ስልክ ቁጥር</th>
                  <th scope="col" className="px-6 py-4">የዜማ መሣሪያ</th>
                  <th scope="col" className="px-6 py-4">ደብር / ቤተክርስቲያን</th>
                  <th scope="col" className="px-6 py-4">ደረጃ</th>
                  <th scope="col" className="px-6 py-4 text-right">ድርጊት</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((student) => {
                  const studentPhoto = getStudentPhoto(student);
                  return (
                    <tr key={student.id} className="hover:bg-slate-50/60 transition">
                      {/* Student Profile & Photo */}
                      <td className="px-6 py-4 flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full overflow-hidden bg-slate-200 border-2 border-emerald-500/20 shadow-sm flex-shrink-0">
                          {studentPhoto ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={studentPhoto}
                              alt={student.fullName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400 bg-slate-100">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div>
                          <span className="font-bold text-slate-800 block text-sm">{student.fullName}</span>
                          <span className="text-[11px] text-slate-400 font-semibold">#{student.id}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4 font-semibold text-slate-700">{student.christianName}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-lg ${
                          student.gender === "ሴት" ? "bg-pink-50 text-pink-700 border border-pink-100" : "bg-blue-50 text-blue-700 border border-blue-100"
                        }`}>
                          {student.gender}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-700">{student.phoneNumber}</td>
                      
                      {/* Instrument with matching Icon */}
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getInstrumentImage(student.instrument)}
                            alt={student.instrument}
                            className="w-4 h-4 object-contain rounded"
                          />
                          {student.instrument}
                        </span>
                      </td>

                      <td className="px-6 py-4 font-medium text-slate-600 text-xs max-w-xs truncate">{student.parishChurch}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-600">
                          {student.serviceLevel}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedStudent(student)}
                          className="px-3 py-1.5 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg text-xs transition border border-slate-200 shadow-sm"
                        >
                          ዝርዝር (Details)
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────────
         MODAL 1: Details Dialog Modal (Ethiopian Date & Time)
      ───────────────────────────────────────────────────────────── */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-2xl w-full max-h-[88vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-100 border-2 border-emerald-500 shadow-md flex-shrink-0">
                  {getStudentPhoto(selectedStudent) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={getStudentPhoto(selectedStudent)}
                      alt={selectedStudent.fullName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 bg-slate-100">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-lg md:text-xl">{selectedStudent.fullName}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400 font-bold">የምዝገባ መለያ ቁጥር፡ #{selectedStudent.id}</span>
                    <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md">
                      {selectedStudent.instrument}
                    </span>
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => setSelectedStudent(null)}
                className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 text-sm">
              {/* Registration Date Banner in Ethiopian Calendar */}
              <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-500">የተመዘገበበት ቀንና ሰዓት (በኢትዮጵያ አቆጣጠር)፡</span>
                <span className="font-extrabold text-xs text-emerald-900 bg-white px-3 py-1 rounded-xl shadow-xs border border-emerald-100">
                  📅 {formatEthiopianDateTime(selectedStudent.createdAt)}
                </span>
              </div>

              {/* Personal Info */}
              <div>
                <h4 className="font-bold text-emerald-800 border-b border-emerald-50 pb-2 mb-3">፩. የተማሪው የግል መረጃ</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-400 block text-xs">የክርስትና ስም</span>
                    <span className="font-semibold text-slate-800">{selectedStudent.christianName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs">ጾታ</span>
                    <span className="font-semibold text-slate-800">{selectedStudent.gender}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs">ስልክ ቁጥር</span>
                    <span className="font-semibold text-slate-800">{selectedStudent.phoneNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs">የትውልድ ቀን (ዓ.ም)</span>
                    <span className="font-semibold text-slate-800">
                      {selectedStudent.birthDay}/{selectedStudent.birthMonth}/{selectedStudent.birthYear} ዓ.ም ({2017 - selectedStudent.birthYear} ዓመት)
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs">የተመረጠ የዜማ መሣሪያ</span>
                    <span className="font-bold text-emerald-700 flex items-center gap-1.5 mt-0.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getInstrumentImage(selectedStudent.instrument)}
                        alt={selectedStudent.instrument}
                        className="w-5 h-5 object-contain rounded"
                      />
                      {selectedStudent.instrument}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs">ደብር / አጥቢያ ቤተክርስቲያን</span>
                    <span className="font-semibold text-slate-800">{selectedStudent.parishChurch}</span>
                  </div>
                  {selectedStudent.sundaySchool && (
                    <div>
                      <span className="text-slate-400 block text-xs">የሰንበት ትምህርት ቤት</span>
                      <span className="font-semibold text-slate-800">{selectedStudent.sundaySchool}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-400 block text-xs">የአገልግሎት ደረጃ</span>
                    <span className="font-semibold text-slate-800">{selectedStudent.serviceLevel}</span>
                  </div>
                </div>
              </div>

              {/* Address Info */}
              <div>
                <h4 className="font-bold text-emerald-800 border-b border-emerald-50 pb-2 mb-3">፪. የመኖሪያ አድራሻ</h4>
                <p className="font-semibold text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
                  {getAddress(selectedStudent)}
                </p>
              </div>

              {/* Emergency Contact */}
              <div>
                <h4 className="font-bold text-emerald-800 border-b border-emerald-50 pb-2 mb-3">፫. የአደጋ ጊዜ ተጠሪ</h4>
                {(() => {
                  const c = getEmergencyContact(selectedStudent);
                  return (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <span className="text-slate-400 block text-xs">ሙሉ ስም</span>
                        <span className="font-semibold text-slate-800">{c.fullName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-xs">የመጀመሪያ ስልክ ቁጥር</span>
                        <span className="font-semibold text-slate-800">{c.primaryPhone}</span>
                      </div>
                      {c.secondaryPhone && (
                        <div>
                          <span className="text-slate-400 block text-xs">ተለዋጭ ስልክ ቁጥር</span>
                          <span className="font-semibold text-slate-800">{c.secondaryPhone}</span>
                        </div>
                      )}
                      <div className="col-span-2">
                        <span className="text-slate-400 block text-xs">አድራሻ</span>
                        <span className="font-semibold text-slate-800">{c.address}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 flex justify-between items-center">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition flex items-center gap-2 shadow-sm"
              >
                🖨️ ካርድ አትም (Print Slip)
              </button>
              <button
                onClick={() => setSelectedStudent(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition"
              >
                ዝጋ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
         MODAL 2: Batch Database Import Modal (CSV / JSON)
      ───────────────────────────────────────────────────────────── */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-xl w-full max-h-[85vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">መረጃ ወደ ዳታቤዝ አስገባ (Import)</h3>
                <p className="text-xs text-slate-400">የተማሪዎችን መረጃ ከCSV ወይም JSON ፋይል በቀጥታ ያስገቡ</p>
              </div>
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setParsedImportData([]);
                  setImportStatus("");
                }}
                className="p-2 hover:bg-slate-100 text-slate-400 rounded-full"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* File Dropzone */}
              <div
                onClick={() => importFileRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-8 text-center cursor-pointer bg-slate-50 hover:bg-indigo-50/40 transition flex flex-col items-center"
              >
                <svg className="w-12 h-12 text-indigo-500 mb-2" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span className="font-bold text-sm text-slate-700">CSV ወይም JSON ፋይል ይምረጡ</span>
                <span className="text-xs text-slate-400 mt-1">.csv, .json (ከዚህ በፊት የተላከ ፋይል ማስገባት ይቻላል)</span>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".csv,.json"
                  className="hidden"
                  onChange={handleImportFile}
                />
              </div>

              {importStatus && (
                <div className="p-3.5 bg-indigo-50 border border-indigo-100 rounded-xl text-xs font-semibold text-indigo-800">
                  {importStatus}
                </div>
              )}

              {/* Preview Rows */}
              {parsedImportData.length > 0 && (
                <div className="border border-slate-100 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-xs text-left text-slate-600">
                    <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                      <tr>
                        <th className="p-2">#</th>
                        <th className="p-2">ሙሉ ስም</th>
                        <th className="p-2">ስልክ ቁጥር</th>
                        <th className="p-2">የዜማ መሣሪያ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedImportData.slice(0, 10).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2 font-bold">{idx + 1}</td>
                          <td className="p-2">{row.fullName}</td>
                          <td className="p-2">{row.phoneNumber}</td>
                          <td className="p-2 font-bold text-emerald-700">{row.instrument}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs"
              >
                ይቅር
              </button>
              <button
                type="button"
                disabled={parsedImportData.length === 0 || importing}
                onClick={submitImport}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5"
              >
                {importing ? "በማስገባት ላይ..." : `ወደ ዳታቤዝ አስገባ (${parsedImportData.length} ተማሪዎች)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
