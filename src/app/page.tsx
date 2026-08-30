"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { formatEthiopianDateTime } from "@/lib/ethiopianCalendar";

/* ──────────────────────────────────────
   Types
────────────────────────────────────── */
interface FormState {
  instrument: string;
  photo: string;
  fullName: string;
  christianName: string;
  gender: string;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  phoneNumber: string;
  sundaySchool: string;
  parishChurch: string;
  serviceLevel: string;
  subcity: string;
  woreda: string;
  neighborhood: string;
  houseNumber: string;
  emergencyFullName: string;
  emergencyPhone: string;
  emergencyAltPhone: string;
  emergencyAddress: string;
}

type FieldErrors = Partial<Record<keyof FormState | "photo_required", string>>;

// Current Ethiopian Year reference
const CURRENT_ETH_YEAR = 2017;
const MIN_AGE = 15;
const MAX_VALID_BIRTH_YEAR = CURRENT_ETH_YEAR - MIN_AGE; // 2002 ዓ.ም

// Default empty form state
const initialFormState: FormState = {
  instrument: "",
  photo: "",
  fullName: "",
  christianName: "",
  gender: "",
  birthYear: "",  // Default empty
  birthMonth: "", // Default empty
  birthDay: "",   // Default empty
  phoneNumber: "",
  sundaySchool: "",
  parishChurch: "",
  serviceLevel: "ጀማሪ",
  subcity: "",
  woreda: "",
  neighborhood: "",
  houseNumber: "",
  emergencyFullName: "",
  emergencyPhone: "",
  emergencyAltPhone: "",
  emergencyAddress: "",
};

/* ──────────────────────────────────────
   Constants
────────────────────────────────────── */
const ecMonths = [
  "መስከረም","ጥቅምት","ኅዳር","ታኅሣሥ","ጥር","የካቲት",
  "መጋቢት","ሚያዝያ","ግንቦት","ሰኔ","ሐምሌ","ነሐሴ","ጳጉሜ",
];

const instruments = [
  { id: "በገና",  name: "በገና",  desc: "የክቡር ዳዊት በገና (፲ ባለአውታር መዝሙር ማንቆርቆሪያ)", image: "/instruments/begena.jpg" },
  { id: "ማሲንቆ", name: "ማሲንቆ", desc: "ባለአንድ አውታር ባህላዊ/መንፈሳዊ የዜማ ማጀቢያ", image: "/instruments/masinko.jpg" },
  { id: "ከበሮ",  name: "ከበሮ",  desc: "የማኅሌት ከበሮ (የምስጋና እና የዝማሬ ማድመቂያ)", image: "/instruments/kebero.jpg" },
  { id: "መለከት", name: "መለከት", desc: "የትንሣኤ እና የምስጋና የዜማ መለከት", image: "/instruments/meleket.jpg" },
  { id: "ነጋሪት", name: "ነጋሪት", desc: "የሰራዊት ጌታ ታላቅ የማዕረግ ከበሮ", image: "/instruments/negarit.jpg" },
];

/* ──────────────────────────────────────
   Helpers
────────────────────────────────────── */

/** Compress an image file via canvas before uploading */
const compressImage = (file: File, maxDim = 1024, quality = 0.82): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h / w) * maxDim); w = maxDim; }
          else       { w = Math.round((w / h) * maxDim); h = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = ev.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/** Upload base64 to Cloudinary via our API route */
const uploadToCloudinary = async (base64: string): Promise<string> => {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64 }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Upload failed");
  }
  const data = await res.json();
  return data.url as string;
};

/** Accept only digit characters + leading + and interior - or space for phone */
const sanitizePhone = (raw: string) => raw.replace(/[^\d+\-\s]/g, "");

/** Validate Ethiopian phone number format: 09XXXXXXXX or +2519XXXXXXX etc. */
const isValidPhone = (phone: string) => {
  const cleaned = phone.replace(/[\s\-]/g, "");
  return /^(\+251|0)(9|7)\d{8}$/.test(cleaned) || /^\+\d{7,15}$/.test(cleaned);
};

/* ──────────────────────────────────────
   Sub-component: LiveCameraModal (Real Device Camera)
────────────────────────────────────── */
interface LiveCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64: string) => void;
}

function LiveCameraModal({ isOpen, onClose, onCapture }: LiveCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string>("");
  const [cameraLoading, setCameraLoading] = useState<boolean>(true);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);

  const startCamera = async (mode: "environment" | "user") => {
    setCameraLoading(true);
    setCameraError("");
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.warn("Direct camera constraint failed, falling back to simple video:", err);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } catch (fallbackErr: any) {
        setCameraError(
          "የካሜራ ፈቃድ ማግኘት አልተቻለም። እባክዎ በብሮውዘርዎ ላይ የካሜራ ፈቃድ (Camera Permission) ይስጡ።"
        );
      }
    } finally {
      setCameraLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null);
      startCamera(facingMode);
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isOpen, facingMode]);

  const switchCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const takeSnapshot = () => {
    if (!videoRef.current) return;
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    setCapturedImage(dataUrl);
  };

  const retakeSnapshot = () => {
    setCapturedImage(null);
    startCamera(facingMode);
  };

  const confirmSnapshot = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 text-white rounded-3xl overflow-hidden max-w-lg w-full shadow-2xl flex flex-col relative">
        {/* Shutter Flash Animation */}
        {isFlashing && (
          <div className="absolute inset-0 bg-white z-50 opacity-90 transition-opacity duration-200 pointer-events-none" />
        )}

        {/* Modal Header */}
        <div className="p-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
            <h3 className="font-bold text-sm text-slate-100">የተማሪ ፎቶ ማንሻ (Live Camera)</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Viewfinder Canvas / Video */}
        <div className="relative aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
          {cameraLoading && !capturedImage && (
            <div className="absolute flex flex-col items-center gap-3 text-slate-400">
              <svg className="animate-spin h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs font-semibold">ካሜራ በመክፈት ላይ...</span>
            </div>
          )}

          {cameraError ? (
            <div className="p-6 text-center text-red-400 text-xs font-medium space-y-2">
              <svg className="w-10 h-10 mx-auto text-red-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p>{cameraError}</p>
              <button
                onClick={() => startCamera(facingMode)}
                className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold"
              >
                እንደገና ሞክር
              </button>
            </div>
          ) : capturedImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={capturedImage} alt="Snapshot Preview" className="w-full h-full object-cover" />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
              />
              {/* Face Guide Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-48 h-56 border-2 border-dashed border-white/60 rounded-[45%] shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"></div>
              </div>
            </>
          )}
        </div>

        {/* Viewfinder Controls Footer */}
        <div className="p-5 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3">
          {capturedImage ? (
            <>
              <button
                type="button"
                onClick={retakeSnapshot}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-2xl text-xs transition border border-slate-700 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                እንደገና አንሳ
              </button>
              <button
                type="button"
                onClick={confirmSnapshot}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                ይህንን ፎቶ ተጠቀም
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={switchCamera}
                title="ካሜራ ቀይር (Switch Camera)"
                className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full border border-slate-700 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>

              {/* Shutter Button */}
              <button
                type="button"
                onClick={takeSnapshot}
                disabled={cameraLoading || !!cameraError}
                className="w-16 h-16 rounded-full bg-white p-1 shadow-lg hover:scale-105 active:scale-95 transition flex items-center justify-center mx-auto disabled:opacity-50"
              >
                <div className="w-full h-full rounded-full border-4 border-slate-900 bg-emerald-600 flex items-center justify-center">
                  <div className="w-4 h-4 bg-white rounded-full"></div>
                </div>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition"
              >
                ዝጋ
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────
   Sub-component: PhotoUpload
────────────────────────────────────── */
interface PhotoUploadProps {
  photoPreview: string;
  uploading: boolean;
  error?: string;
  onPhotoSelected: (base64: string) => void;
}

function PhotoUpload({ photoPreview, uploading, error, onPhotoSelected }: PhotoUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await compressImage(file);
    onPhotoSelected(base64);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const base64 = await compressImage(file);
      onPhotoSelected(base64);
    }
  };

  return (
    <div className="space-y-3">
      {/* Live WebRTC Camera Modal */}
      <LiveCameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={(base64) => onPhotoSelected(base64)}
      />

      <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-2xl border border-slate-200 bg-slate-50/50">
        {/* Photo Avatar Preview */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => setIsCameraOpen(true)}
          className={`relative w-28 h-28 rounded-2xl overflow-hidden border-2 cursor-pointer transition flex items-center justify-center bg-white shadow-inner flex-shrink-0 ${
            error
              ? "border-red-400 bg-red-50"
              : dragOver
              ? "border-emerald-500 bg-emerald-50 scale-105"
              : "border-dashed border-slate-300 hover:border-emerald-400"
          }`}
        >
          {uploading ? (
            <svg className="animate-spin h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoPreview} alt="ተማሪ ፎቶ" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-center px-2">
              <svg className={`w-10 h-10 ${dragOver ? "text-emerald-500" : "text-slate-300"}`} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
              </svg>
              <span className="text-[10px] text-slate-400 font-medium">ፎቶ ግዴታ ነው</span>
            </div>
          )}

          {photoPreview && !uploading && (
            <div className="absolute bottom-0.5 right-0.5 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 w-full sm:w-auto text-center sm:text-left">
          <div>
            <h4 className="font-semibold text-slate-700 text-sm mb-1">
              የተማሪ ፎቶ <span className="text-red-500">*</span>
            </h4>
            <p className="text-xs text-slate-400">
              ካሜራ በመክፈት በቀጥታ ፎቶ ያንሱ ወይም ከፋይል ይምረጡ
            </p>
          </div>

          <div className="flex flex-wrap justify-center sm:justify-start gap-2">
            {/* Live Camera Shutter Button */}
            <button
              type="button"
              onClick={() => setIsCameraOpen(true)}
              disabled={uploading}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition shadow-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              ፎቶ አንሳ (Camera)
            </button>

            {/* Gallery / File Picker */}
            <label className="px-4 py-2.5 bg-white border border-slate-200 hover:border-emerald-400 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer transition shadow-sm flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              ጋለሪ ይምረጡ
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
                disabled={uploading}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p className="text-xs text-red-500 font-semibold flex items-center gap-1 mt-1">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

/* ──────────────────────────────────────
   Sub-component: FormInput
────────────────────────────────────── */
interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  required?: boolean;
  error?: string;
}

function FormInput({ label, required, error, className = "", ...rest }: FormInputProps) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        {...rest}
        className={`w-full px-4 py-3 rounded-xl border transition text-sm focus:outline-none focus:ring-2 ${
          error
            ? "border-red-400 bg-red-50 focus:ring-red-500/20 focus:border-red-500"
            : "border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500"
        } ${className}`}
      />
      {error && (
        <p className="text-xs text-red-500 font-semibold flex items-center gap-1">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

/* ──────────────────────────────────────
   Main page
────────────────────────────────────── */
export default function Home() {
  const [step, setStep]               = useState<number>(1);
  const [formData, setFormData]       = useState<FormState>(initialFormState);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [photoUploading, setPhotoUploading] = useState<boolean>(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading]         = useState<boolean>(false);
  const [success, setSuccess]         = useState<boolean>(false);
  const [submittedStudent, setSubmittedStudent] = useState<any>(null);
  const [showPrintSlip, setShowPrintSlip] = useState<boolean>(false);
  const [topError, setTopError]       = useState<string>("");

  /* ── Restore draft from localStorage on mount ── */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("eotc_registration_draft");
      if (saved) {
        const parsed = JSON.parse(saved);
        setFormData(parsed);
        if (parsed.photo) setPhotoPreview(parsed.photo);
      }
    } catch {
      // Ignore
    }
  }, []);

  const saveDraft = (data: FormState) => {
    try {
      localStorage.setItem("eotc_registration_draft", JSON.stringify(data));
    } catch {
      // Ignore
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const updated = { ...formData, [name]: value };
    setFormData(updated);
    saveDraft(updated);
    if (fieldErrors[name as keyof FormState]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>, fieldName: "phoneNumber" | "emergencyPhone" | "emergencyAltPhone") => {
    const raw = e.target.value;
    const sanitized = sanitizePhone(raw);
    const updated = { ...formData, [fieldName]: sanitized };
    setFormData(updated);
    saveDraft(updated);
    if (fieldErrors[fieldName]) {
      setFieldErrors((prev) => ({ ...prev, [fieldName]: undefined }));
    }
  };

  const handleGenderChange = (val: string) => {
    const updated = { ...formData, gender: val };
    setFormData(updated);
    saveDraft(updated);
    if (fieldErrors.gender) {
      setFieldErrors((prev) => ({ ...prev, gender: undefined }));
    }
  };

  const handlePhotoSelected = async (base64: string) => {
    setPhotoPreview(base64);
    setPhotoUploading(true);
    setFieldErrors((prev) => ({ ...prev, photo_required: undefined }));

    try {
      const cloudUrl = await uploadToCloudinary(base64);
      const updated = { ...formData, photo: cloudUrl };
      setFormData(updated);
      saveDraft(updated);
      setPhotoPreview(cloudUrl);
    } catch {
      const updated = { ...formData, photo: base64 };
      setFormData(updated);
      saveDraft(updated);
    } finally {
      setPhotoUploading(false);
    }
  };

  // Calculated Age in Ethiopian Calendar
  const parsedBirthYear = parseInt(formData.birthYear);
  const calculatedAge = parsedBirthYear ? CURRENT_ETH_YEAR - parsedBirthYear : 0;

  // Dynamic days based on selected month (ጳጉሜ is 6 days, others 30)
  const maxDaysInMonth = formData.birthMonth === "ጳጉሜ" ? 6 : 30;

  /* ── Navigation ── */
  const nextStep = () => {
    if (validate()) {
      setStep((prev) => Math.min(prev + 1, 6));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const prevStep = () => {
    setStep((prev) => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ── Validation ── */
  const validate = (): boolean => {
    const errors: FieldErrors = {};
    setTopError("");

    switch (step) {
      case 1:
        if (!formData.instrument) {
          setTopError("እባክዎ መማር የሚፈልጉትን የዜማ መሣሪያ ይምረጡ!");
          return false;
        }
        break;

      case 2:
        // 1. Mandatory Photo
        if (!formData.photo || !formData.photo.trim()) {
          errors.photo_required = "የተማሪ ፎቶ ማስገባት ግዴታ ነው!";
        }
        // 2. Mandatory Full Name
        if (!formData.fullName.trim()) {
          errors.fullName = "ሙሉ ስም እስከ አያት ማስገባት ግዴታ ነው!";
        }
        // 3. Mandatory Christian Name
        if (!formData.christianName.trim()) {
          errors.christianName = "የክርስትና ስም ማስገባት ግዴታ ነው!";
        }
        // 4. Mandatory Gender
        if (!formData.gender) {
          errors.gender = "እባክዎ ጾታ ይምረጡ!";
        }
        // 5. Mandatory Phone Number & Format
        if (!formData.phoneNumber.trim()) {
          errors.phoneNumber = "የስልክ ቁጥር ማስገባት ግዴታ ነው!";
        } else if (!isValidPhone(formData.phoneNumber)) {
          errors.phoneNumber = "ትክክለኛ ስልክ ቁጥር ያስገቡ (ምሳሌ: 0912345678 ወይም +251912345678)";
        }
        // 6. Mandatory Date of Birth selection
        if (!formData.birthYear) {
          errors.birthYear = "እባክዎ የትውልድ ዓመት ይምረጡ!";
        } else if (calculatedAge < MIN_AGE) {
          errors.birthYear = `የተማሪው ዕድሜ ከ15 ዓመት በላይ መሆን አለበት! (የአሁኑ ዕድሜ፡ ${calculatedAge} ዓመት)`;
        }
        if (!formData.birthMonth) {
          errors.birthMonth = "እባክዎ የትውልድ ወር ይምረጡ!";
        }
        if (!formData.birthDay) {
          errors.birthDay = "እባክዎ የትውልድ ቀን ይምረጡ!";
        }
        break;

      case 3:
        if (!formData.parishChurch.trim())
          errors.parishChurch = "እባክዎ የአጥቢያ ቤተክርስቲያን ስም ያስገቡ!";
        break;

      case 4:
        if (!formData.subcity.trim())
          errors.subcity = "ክፍለ ከተማ ማስገባት ግዴታ ነው!";
        if (!formData.woreda.trim())
          errors.woreda = "ወረዳ ማስገባት ግዴታ ነው!";
        break;

      case 5:
        if (!formData.emergencyFullName.trim())
          errors.emergencyFullName = "የአደጋ ጊዜ ተጠሪ ሙሉ ስም ማስገባት ግዴታ ነው!";
        if (!formData.emergencyPhone.trim()) {
          errors.emergencyPhone = "የተጠሪ ስልክ ቁጥር ማስገባት ግዴታ ነው!";
        } else if (!isValidPhone(formData.emergencyPhone)) {
          errors.emergencyPhone = "ትክክለኛ ስልክ ቁጥር ያስገቡ (ምሳሌ: 0912345678)";
        }
        if (formData.emergencyAltPhone.trim() && !isValidPhone(formData.emergencyAltPhone)) {
          errors.emergencyAltPhone = "ትክክለኛ ስልክ ቁጥር ያስገቡ";
        }
        break;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return false;
    }
    setFieldErrors({});
    return true;
  };

  /* ── Submit ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTopError("");

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmittedStudent({
          ...formData,
          id: data.id || Math.floor(1000 + Math.random() * 9000),
          createdAt: new Date().toISOString(),
        });
        setSuccess(true);
        localStorage.removeItem("eotc_registration_draft");
        setFormData(initialFormState);
        setPhotoPreview("");
      } else {
        setTopError(data.error || "የምዝገባ ጥያቄው አልተሳካም። እባክዎ እንደገና ይሞክሩ።");
      }
    } catch {
      setTopError("ከአገልጋዩ ጋር መገናኘት አልተቻለም። እባክዎ የኢንተርኔት ግንኙነትዎን ያረጋግጡ።");
    } finally {
      setLoading(false);
    }
  };

  /* ──────────────────────────────────── */
  return (
    <div className="flex-grow flex flex-col py-10 px-4 md:px-8 max-w-4xl mx-auto w-full">
      {/* Header */}
      <header className="mb-8 text-center flex flex-col items-center">
        <div className="relative w-28 h-28 md:w-32 md:h-32 mb-4 drop-shadow-md hover:scale-105 transition-transform duration-300">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="ፍኖተ ሰላም ሰንበት ትምህርት ቤት ዓርማ"
            className="w-full h-full object-contain rounded-full"
          />
        </div>
        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100/80 mb-2">
          ቦሌ ሰሚት መካነ ሰላም መድኃኔዓለም እና መጥምቀ መለኮት ቅዱስ ዮሐንስ ቤተክርስቲያን
        </span>
        <h1 className="text-2xl md:text-3xl font-extrabold text-emerald-900 tracking-tight">
          ፍኖተ ሰላም ሰንበት ትምህርት ቤት
        </h1>
        <p className="text-slate-600 mt-1.5 font-semibold text-sm md:text-base">
          የዜማ መሣሪያዎች ማሰልጠኛ የተማሪዎች ምዝገባ
        </p>
      </header>

      {/* Progress Steps */}
      <div className="relative mb-12" aria-label="Registration Progress">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-200 -translate-y-1/2 rounded-full -z-10" />
        <div
          className="absolute top-1/2 left-0 h-1 bg-emerald-600 -translate-y-1/2 rounded-full transition-all duration-500 -z-10"
          style={{ width: `${((step - 1) / 5) * 100}%` }}
        />
        <div className="flex justify-between">
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => s < step && setStep(s)}
              disabled={s >= step}
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 shadow-sm border-2 ${
                step === s
                  ? "bg-emerald-600 text-white border-emerald-600 scale-110 ring-4 ring-emerald-50"
                  : s < step
                  ? "bg-emerald-50 text-emerald-600 border-emerald-600 hover:bg-emerald-100"
                  : "bg-white text-slate-400 border-slate-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Main Wizard Card */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden flex flex-col flex-1 p-6 md:p-10 transition-all">
        {success ? (
          /* Success Screen */
          <div className="text-center py-12 px-4 flex flex-col items-center justify-center my-auto">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mb-6 border border-emerald-200 animate-bounce">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-800">የተማሪ ምዝገባው በተሳካ ሁኔታ ተጠናቋል!</h2>
            <p className="text-slate-500 mt-4 max-w-md mx-auto leading-relaxed">
              የተማሪው መረጃ በተሳካ ሁኔታ ተመዝግቧል። የምዝገባ ካርድዎን አትመው መያዝ ይችላሉ። የምዝገባ አስተዳዳሪው በስልክ ያነጋግርዎታል።
            </p>

            {/* Print Slip Action Button */}
            {submittedStudent && (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setShowPrintSlip(true)}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-2xl shadow-md transition flex items-center gap-2 text-sm"
                >
                  <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24-3.323 2.61-6.029 6.03-6.029s6.27 2.706 6.03 6.029m-12.06 0a6 6 0 0012.06 0m-12.06 0H3.75m16.5 0H20.25m-14.25 4.5h12m-12 0l1.5 3h9l1.5-3m-12 0v-4.5m12 0v4.5" />
                  </svg>
                  📄 የምዝገባ ካርድ / ደረሰኝ አትም (Print Slip)
                </button>
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => { setSuccess(false); setStep(1); }}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-2xl shadow-md transition"
              >
                አዲስ ተማሪ መዝግብ
              </button>
              <Link
                href="/admin"
                className="px-6 py-3 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-2xl transition text-center"
              >
                የተመዝጋቢዎች ዝርዝር (Admin)
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1">
            {/* Top error banner */}
            {topError && (
              <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm font-semibold rounded-r-xl flex items-center gap-3">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{topError}</span>
              </div>
            )}

            {/* ── STEP 1: Instrument Selection ── */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <span className="text-emerald-600 text-lg">1.</span> መማር የሚፈልጉትን የዜማ መሣሪያ ይምረጡ <span className="text-red-500">*</span>
                  </h2>
                  <p className="text-slate-400 text-xs mt-1">ለመሰልጠን ከሚፈልጓቸው የቤተክርስቲያን የዜማ መሣሪያዎች አንዱን ይምረጡ</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {instruments.map((inst) => {
                    const isSelected = formData.instrument === inst.id;
                    return (
                      <div
                        key={inst.id}
                        onClick={() => {
                          const updated = { ...formData, instrument: inst.id };
                          setFormData(updated);
                          saveDraft(updated);
                          setTopError("");
                        }}
                        className={`cursor-pointer group relative rounded-3xl p-5 border-2 transition-all duration-300 flex flex-col items-center text-center ${
                          isSelected
                            ? "border-emerald-600 bg-emerald-50/40 shadow-lg shadow-emerald-600/10 scale-[1.02]"
                            : "border-slate-100 hover:border-emerald-200 hover:bg-slate-50/60"
                        }`}
                      >
                        {/* Radio indicator */}
                        <div className={`absolute top-4 right-4 w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                          isSelected ? "border-emerald-600 bg-emerald-600" : "border-slate-300"
                        }`}>
                          {isSelected && (
                            <div className="w-2 h-2 rounded-full bg-white"></div>
                          )}
                        </div>

                        {/* Instrument Icon Card */}
                        <div className="w-24 h-24 mb-4 rounded-2xl bg-[#f7f2ea] border border-amber-100 p-2 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={inst.image}
                            alt={inst.name}
                            className="w-full h-full object-contain drop-shadow-sm"
                          />
                        </div>

                        <h3 className="font-extrabold text-slate-800 text-base mb-1">{inst.name}</h3>
                        <p className="text-xs text-slate-500 leading-relaxed">{inst.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── STEP 2: Personal Information & Camera Photo ── */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <span className="text-emerald-600 text-lg">2.</span> የተማሪው የግል መረጃ
                  </h2>
                  <p className="text-slate-400 text-xs mt-1">ሁሉም መረጃዎች እና የተማሪ ፎቶ መሞላት ግዴታ ናቸው</p>
                </div>

                {/* Photo Section */}
                <PhotoUpload
                  photoPreview={photoPreview}
                  uploading={photoUploading}
                  error={fieldErrors.photo_required}
                  onPhotoSelected={handlePhotoSelected}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormInput
                    label="ሙሉ ስም (እስከ አያት)"
                    required
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    placeholder="ሙሉ ስም ያስገቡ"
                    error={fieldErrors.fullName}
                  />

                  <FormInput
                    label="የክርስትና ስም"
                    required
                    type="text"
                    name="christianName"
                    value={formData.christianName}
                    onChange={handleInputChange}
                    placeholder="የክርስትና ስም ያስገቡ"
                    error={fieldErrors.christianName}
                  />

                  {/* Gender */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-slate-700">
                      ጾታ <span className="text-red-500">*</span>
                    </label>
                    <div className={`flex gap-6 mt-2 p-3 rounded-xl border transition ${
                      fieldErrors.gender ? "border-red-400 bg-red-50" : "border-transparent"
                    }`}>
                      {["ወንድ", "ሴት"].map((g) => (
                        <label key={g} className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                          <input
                            type="radio"
                            name="gender"
                            value={g}
                            checked={formData.gender === g}
                            onChange={() => handleGenderChange(g)}
                            className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-slate-300"
                          />
                          {g}
                        </label>
                      ))}
                    </div>
                    {fieldErrors.gender && (
                      <p className="text-xs text-red-500 font-semibold flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {fieldErrors.gender}
                      </p>
                    )}
                  </div>

                  {/* Phone — numeric-only enforced */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-slate-700">
                      የስልክ ቁጥር <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        name="phoneNumber"
                        value={formData.phoneNumber}
                        onChange={(e) => handlePhoneChange(e, "phoneNumber")}
                        placeholder="0912345678 ወይም +251912345678"
                        inputMode="tel"
                        className={`w-full px-4 py-3 pl-10 rounded-xl border transition text-sm focus:outline-none focus:ring-2 ${
                          fieldErrors.phoneNumber
                            ? "border-red-400 bg-red-50 focus:ring-red-500/20 focus:border-red-500"
                            : "border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500"
                        }`}
                      />
                      <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    {fieldErrors.phoneNumber ? (
                      <p className="text-xs text-red-500 font-semibold flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {fieldErrors.phoneNumber}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400">ቁጥሮች ብቻ ይፈቀዳሉ (ምሳሌ: 0912345678)</p>
                    )}
                  </div>

                  {/* Date of Birth (Defaults to Empty & Age >= 15 Check) */}
                  <div className="space-y-1.5 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-semibold text-slate-700">
                        የተወለዱበት ቀን (ዓ.ም) <span className="text-red-500">*</span>
                      </label>
                      <span className="text-xs text-slate-400 font-medium">
                        የምዝገባ ዕድሜ፡ 15 ዓመት እና ከዚያ በላይ
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Birth Year */}
                      <div>
                        <select
                          name="birthYear"
                          value={formData.birthYear}
                          onChange={handleInputChange}
                          className={`w-full px-4 py-3 rounded-xl border bg-white focus:outline-none focus:ring-2 transition text-sm ${
                            fieldErrors.birthYear
                              ? "border-red-400 bg-red-50 focus:ring-red-500/20 focus:border-red-500"
                              : "border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500"
                          }`}
                        >
                          <option value="">ዓመት ይምረጡ</option>
                          {Array.from({ length: 70 }, (_, i) => MAX_VALID_BIRTH_YEAR + 3 - i).map((y) => (
                            <option key={y} value={y}>{y} ዓ.ም</option>
                          ))}
                        </select>
                        {fieldErrors.birthYear && (
                          <p className="text-xs text-red-500 font-semibold mt-1">{fieldErrors.birthYear}</p>
                        )}
                      </div>

                      {/* Birth Month */}
                      <div>
                        <select
                          name="birthMonth"
                          value={formData.birthMonth}
                          onChange={handleInputChange}
                          className={`w-full px-4 py-3 rounded-xl border bg-white focus:outline-none focus:ring-2 transition text-sm ${
                            fieldErrors.birthMonth
                              ? "border-red-400 bg-red-50 focus:ring-red-500/20 focus:border-red-500"
                              : "border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500"
                          }`}
                        >
                          <option value="">ወር ይምረጡ</option>
                          {ecMonths.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        {fieldErrors.birthMonth && (
                          <p className="text-xs text-red-500 font-semibold mt-1">{fieldErrors.birthMonth}</p>
                        )}
                      </div>

                      {/* Birth Day (Dynamic max days) */}
                      <div>
                        <select
                          name="birthDay"
                          value={formData.birthDay}
                          onChange={handleInputChange}
                          className={`w-full px-4 py-3 rounded-xl border bg-white focus:outline-none focus:ring-2 transition text-sm ${
                            fieldErrors.birthDay
                              ? "border-red-400 bg-red-50 focus:ring-red-500/20 focus:border-red-500"
                              : "border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500"
                          }`}
                        >
                          <option value="">ቀን ይምረጡ</option>
                          {Array.from({ length: maxDaysInMonth }, (_, i) => i + 1).map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                        {fieldErrors.birthDay && (
                          <p className="text-xs text-red-500 font-semibold mt-1">{fieldErrors.birthDay}</p>
                        )}
                      </div>
                    </div>

                    {/* Real-time Age Indicator */}
                    <div className="mt-2 flex items-center gap-2">
                      {!formData.birthYear ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full">
                          📅 እባክዎ የትውልድ ዓመት ይምረጡ (ዕድሜ 15 እና ከዚያ በላይ)
                        </span>
                      ) : calculatedAge >= MIN_AGE ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                          <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          የተማሪው ዕድሜ፡ {calculatedAge} ዓመት (ዕድሜ ተፈቅዷል)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1 rounded-full">
                          <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          የተማሪው ዕድሜ፡ {calculatedAge} ዓመት (ምዝገባ የሚፈቀደው ከ15 ዓመት በላይ ለሆኑ ብቻ ነው)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 3: Sunday school & Parish ── */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <span className="text-emerald-600 text-lg">3.</span> የሰንበት ትምህርት ቤት እና አገልግሎት መረጃ
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormInput
                    label="የአጥቢያ ቤተክርስቲያን / ደብር"
                    required
                    type="text"
                    name="parishChurch"
                    value={formData.parishChurch}
                    onChange={handleInputChange}
                    placeholder="ምሳሌ፡ ደብረ አሚን ተክለሃይማኖት"
                    error={fieldErrors.parishChurch}
                  />
                  <FormInput
                    label="የሰንበት ትምህርት ቤት ስም (ካለ)"
                    type="text"
                    name="sundaySchool"
                    value={formData.sundaySchool}
                    onChange={handleInputChange}
                    placeholder="የሰንበት ትምህርት ቤት ስም"
                  />
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700">አሁን ያሉት የአገልግሎት ደረጃ</label>
                    <select
                      name="serviceLevel"
                      value={formData.serviceLevel}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition text-sm"
                    >
                      <option value="ጀማሪ">ጀማሪ (በቤተክርስቲያን አገልግሎት ላይ ያልተሳተፈ)</option>
                      <option value="ዘማሪ">ዘማሪ / ዘማሪት</option>
                      <option value="የሰንበት ተማሪ">የሰንበት ትምህርት ቤት ተማሪ</option>
                      <option value="ዲያቆን">ዲያቆን</option>
                      <option value="ሌላ">ሌላ</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 4: Address ── */}
            {step === 4 && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <span className="text-emerald-600 text-lg">4.</span> የመኖሪያ አድራሻ
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormInput
                    label="ክፍለ ከተማ"
                    required
                    type="text"
                    name="subcity"
                    value={formData.subcity}
                    onChange={handleInputChange}
                    placeholder="ክፍለ ከተማ ያስገቡ"
                    error={fieldErrors.subcity}
                  />
                  <FormInput
                    label="ወረዳ"
                    required
                    type="text"
                    name="woreda"
                    value={formData.woreda}
                    onChange={handleInputChange}
                    placeholder="ወረዳ ያስገቡ"
                    error={fieldErrors.woreda}
                  />
                  <FormInput
                    label="የሰፈር ልዩ ስም"
                    type="text"
                    name="neighborhood"
                    value={formData.neighborhood}
                    onChange={handleInputChange}
                    placeholder="ልዩ ቦታ ስም ያስገቡ"
                  />
                  <FormInput
                    label="የቤት ቁጥር"
                    type="text"
                    name="houseNumber"
                    value={formData.houseNumber}
                    onChange={handleInputChange}
                    placeholder="የቤት ቁጥር ያስገቡ"
                  />
                </div>
              </div>
            )}

            {/* ── STEP 5: Emergency contact ── */}
            {step === 5 && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <span className="text-emerald-600 text-lg">5.</span> የአደጋ ጊዜ ተጠሪ
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormInput
                    label="ሙሉ ስም እስከ አያት"
                    required
                    type="text"
                    name="emergencyFullName"
                    value={formData.emergencyFullName}
                    onChange={handleInputChange}
                    placeholder="የተጠሪ ሙሉ ስም"
                    error={fieldErrors.emergencyFullName}
                  />

                  {/* Emergency phone with sanitizer */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-slate-700">
                      ስልክ ቁጥር <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      name="emergencyPhone"
                      value={formData.emergencyPhone}
                      onChange={(e) => handlePhoneChange(e, "emergencyPhone")}
                      placeholder="0912345678"
                      inputMode="tel"
                      className={`w-full px-4 py-3 rounded-xl border transition text-sm focus:outline-none focus:ring-2 ${
                        fieldErrors.emergencyPhone
                          ? "border-red-400 bg-red-50 focus:ring-red-500/20 focus:border-red-500"
                          : "border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500"
                      }`}
                    />
                    {fieldErrors.emergencyPhone && (
                      <p className="text-xs text-red-500 font-semibold flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {fieldErrors.emergencyPhone}
                      </p>
                    )}
                  </div>

                  {/* Alt phone */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-slate-700">ተለዋጭ ስልክ ቁጥር</label>
                    <input
                      type="tel"
                      name="emergencyAltPhone"
                      value={formData.emergencyAltPhone}
                      onChange={(e) => handlePhoneChange(e, "emergencyAltPhone")}
                      placeholder="ተለዋጭ ስልክ"
                      inputMode="tel"
                      className={`w-full px-4 py-3 rounded-xl border transition text-sm focus:outline-none focus:ring-2 ${
                        fieldErrors.emergencyAltPhone
                          ? "border-red-400 bg-red-50 focus:ring-red-500/20 focus:border-red-500"
                          : "border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500"
                      }`}
                    />
                    {fieldErrors.emergencyAltPhone && (
                      <p className="text-xs text-red-500 font-semibold flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {fieldErrors.emergencyAltPhone}
                      </p>
                    )}
                  </div>

                  <FormInput
                    label="አድራሻ"
                    type="text"
                    name="emergencyAddress"
                    value={formData.emergencyAddress}
                    onChange={handleInputChange}
                    placeholder="አድራሻ ያስገቡ"
                  />
                </div>
              </div>
            )}

            {/* ── STEP 6: Summary ── */}
            {step === 6 && (
              <div className="space-y-6 flex flex-col flex-1">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <span className="text-emerald-600 text-lg">6.</span> ማጠቃለያ
                  </h2>
                </div>

                <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                  <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg">ማረጋገጫ</h3>
                      <p className="text-xs text-slate-400 mt-1">እባክዎ መረጃዎችን ያረጋግጡ እና ምዝገባ አስገባ ይጫኑ</p>
                    </div>
                    {photoPreview && (
                      <div className="w-14 h-14 rounded-full border-2 border-emerald-400 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoPreview} alt="ተማሪ" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                    {[
                      ["የተመረጠ መሣሪያ", formData.instrument],
                      ["ሙሉ ስም", formData.fullName],
                      ["የክርስትና ስም", formData.christianName],
                      ["ጾታ", formData.gender],
                      ["ስልክ ቁጥር", formData.phoneNumber],
                      ["የትውልድ ቀን", `${formData.birthDay}/${formData.birthMonth}/${formData.birthYear} ዓ.ም (${calculatedAge} ዓመት)`],
                      ["አጥቢያ ደብር", formData.parishChurch],
                      ["ክፍለ ከተማ / ወረዳ", `${formData.subcity} / ${formData.woreda}`],
                      ["የአደጋ ጊዜ ተጠሪ", formData.emergencyFullName],
                      ["ተጠሪ ስልክ", formData.emergencyPhone],
                    ].map(([key, val]) => (
                      <div key={key} className="flex justify-between border-b border-slate-100/70 pb-2 gap-2">
                        <span className="font-medium text-slate-400 text-xs flex-shrink-0">{key}:</span>
                        <span className="font-bold text-slate-800 text-xs text-right">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Navigation Bar */}
            <div className="mt-auto pt-8 border-t border-slate-100 flex items-center justify-between gap-4">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={prevStep}
                  className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-2xl transition shadow-sm flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  ቀድሞ
                </button>
              ) : (
                <div />
              )}

              {step < 6 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  disabled={photoUploading}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold rounded-2xl shadow-md transition ml-auto flex items-center gap-2"
                >
                  ቀጣይ
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold rounded-2xl shadow-md transition ml-auto flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      በመመዝገብ ላይ...
                    </>
                  ) : (
                    "ምዝገባ አስገባ"
                  )}
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
         Printable Registration Slip Modal
      ───────────────────────────────────────────────────────────── */}
      {showPrintSlip && submittedStudent && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            {/* Printable Slip Card */}
            <div id="printable-card" className="border-2 border-emerald-800 rounded-2xl p-6 bg-amber-50/20 relative">
              {/* Slip Header */}
              <div className="flex items-center gap-3 border-b-2 border-emerald-800 pb-4 mb-4">
                <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
                </div>
                <div className="text-center sm:text-left flex-1">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase block">
                    ቦሌ ሰሚት መካነ ሰላም መድኃኔዓለም እና ቅዱስ ዮሐንስ ቤተክርስቲያን
                  </span>
                  <h3 className="font-extrabold text-base text-slate-900 leading-tight">
                    ፍኖተ ሰላም ሰንበት ትምህርት ቤት
                  </h3>
                  <p className="text-xs text-emerald-700 font-bold">የዜማ መሣሪያዎች ማሰልጠኛ — የተማሪ ምዝገባ ካርድ</p>
                </div>
              </div>

              {/* Student Details & Photo Grid */}
              <div className="flex gap-4 mb-4">
                <div className="w-24 h-28 border-2 border-emerald-600 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 shadow-sm">
                  {submittedStudent.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={submittedStudent.photo} alt="Student" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">ፎቶ የለም</div>
                  )}
                </div>
                <div className="flex-1 space-y-1 text-xs">
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span className="text-slate-500 font-semibold">መለያ ቁጥር:</span>
                    <span className="font-extrabold text-emerald-800">#FS-2017-{submittedStudent.id}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span className="text-slate-500 font-semibold">ሙሉ ስም:</span>
                    <span className="font-bold text-slate-900">{submittedStudent.fullName}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span className="text-slate-500 font-semibold">የክርስትና ስም:</span>
                    <span className="font-bold text-slate-900">{submittedStudent.christianName}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span className="text-slate-500 font-semibold">የዜማ መሣሪያ:</span>
                    <span className="font-extrabold text-emerald-700">{submittedStudent.instrument}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span className="text-slate-500 font-semibold">ስልክ ቁጥር:</span>
                    <span className="font-bold text-slate-900">{submittedStudent.phoneNumber}</span>
                  </div>
                </div>
              </div>

              {/* Extra Meta */}
              <div className="grid grid-cols-2 gap-2 text-[11px] bg-white p-3 rounded-xl border border-slate-200 mb-4">
                <div>
                  <span className="text-slate-400 block font-semibold">አጥቢያ ደብር</span>
                  <span className="font-bold text-slate-800">{submittedStudent.parishChurch}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">አድራሻ</span>
                  <span className="font-bold text-slate-800">{submittedStudent.subcity}፣ ወረዳ {submittedStudent.woreda}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">የአደጋ ጊዜ ተጠሪ</span>
                  <span className="font-bold text-slate-800">{submittedStudent.emergencyFullName} ({submittedStudent.emergencyPhone})</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">የተመዘገበበት ቀን</span>
                  <span className="font-bold text-emerald-800">{formatEthiopianDateTime(submittedStudent.createdAt)}</span>
                </div>
              </div>

              {/* Signature & Stamp Line */}
              <div className="pt-2 flex justify-between text-[10px] text-slate-500 border-t border-dashed border-slate-300">
                <span>የመዝጋቢው ፊርማ፡ ________________</span>
                <span>የሰንበት ት/ቤቱ ማህተም</span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPrintSlip(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition"
              >
                ዝጋ
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition flex items-center gap-2 shadow-md"
              >
                🖨️ አትም (Print / Save PDF)
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2 pb-6">
        <p className="font-semibold text-slate-700">
          © {new Date().getFullYear()} ፍኖተ ሰላም ሰንበት ትምህርት ቤት | ቦሌ ሰሚት መካነ ሰላም መድኃኔዓለም እና መጥምቀ መለኮት ቅዱስ ዮሐንስ ቤተክርስቲያን
        </p>
        <p className="text-[11px] text-slate-400">የዜማ መሣሪያዎች ማሰልጠኛ የተማሪዎች ምዝገባ ሥርዓት</p>
        <Link href="/admin" className="text-emerald-700 hover:text-emerald-800 hover:underline font-bold mt-1 text-xs">
          የአስተዳዳሪ ክፍል (Admin Panel) →
        </Link>
      </footer>
    </div>
  );
}
