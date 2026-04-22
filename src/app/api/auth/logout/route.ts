import { NextResponse } from "next/server";
import { clearAuthSession } from "@/lib/auth/server";

export async function POST() {
  await clearAuthSession();
  return NextResponse.json({ success: true });
}
