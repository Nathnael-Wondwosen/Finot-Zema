import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function POST(request: Request) {
  try {
    const { image } = await request.json();

    if (!image) {
      return NextResponse.json({ error: "ምስሉ ጠፍቷል" }, { status: 400 });
    }

    // Upload to Cloudinary with compression
    const result = await cloudinary.uploader.upload(image, {
      folder: "finot-zema/students",
      transformation: [
        // Compress and resize: max 800px on any side, quality 80%, face-aware crop
        { width: 800, height: 800, crop: "limit", quality: 80, fetch_format: "auto" },
      ],
      resource_type: "image",
    });

    return NextResponse.json({
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (err: any) {
    console.error("Cloudinary upload error:", err);
    return NextResponse.json(
      { error: "ፎቶው ወደ ደሳሳ መጫን አልተቻለም። እባክዎ እንደገና ይሞክሩ።" },
      { status: 500 }
    );
  }
}
