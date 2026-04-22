import { NextResponse } from "next/server";
import { loginWithEmail } from "@/lib/auth/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";
    await loginWithEmail(email, password);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "登录失败" },
      { status: 400 },
    );
  }
}
