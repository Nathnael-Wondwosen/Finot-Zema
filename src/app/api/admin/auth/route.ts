import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "finot@2017";
const AUTH_COOKIE = "finot_admin_session";
const SESSION_TOKEN = process.env.ADMIN_SECRET_KEY || "finot_secret_session_token_key_2017";

// Check Auth Status
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE)?.value;

    if (token && token === SESSION_TOKEN) {
      return NextResponse.json({ authenticated: true, user: ADMIN_USER });
    }
    return NextResponse.json({ authenticated: false }, { status: 401 });
  } catch (err) {
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }
}

// Login
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const cookieStore = await cookies();
      cookieStore.set(AUTH_COOKIE, SESSION_TOKEN, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: "/",
      });

      return NextResponse.json({ success: true, user: ADMIN_USER });
    }

    return NextResponse.json(
      { error: "የተሳሳተ የተጠቃሚ ስም ወይም የይለፍ ቃል አስገብተዋል።" },
      { status: 401 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "የመግቢያ ሂደት አልተሳካም።" },
      { status: 500 }
    );
  }
}

// Logout
export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(AUTH_COOKIE);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "መውጣት አልተቻለም።" }, { status: 500 });
  }
}
