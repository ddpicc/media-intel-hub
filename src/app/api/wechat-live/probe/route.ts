import { NextRequest, NextResponse } from "next/server";
import { getDbServerClient } from "@/lib/db/server";
import { probeLiveStreamAvailability } from "@/lib/live/stream-probe";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const dbSession = await getDbServerClient();
  const {
    data: { user },
  } = await dbSession.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = (await request.json()) as { streamUrl?: string };
  const streamUrl = body.streamUrl?.trim() ?? "";
  if (!streamUrl) {
    return NextResponse.json({ error: "缺少直播流地址" }, { status: 400 });
  }

  const probe = await probeLiveStreamAvailability(streamUrl, process.env.FFMPEG_PATH || "ffmpeg", {
    invalidData: "直播流数据格式异常，当前无法预览。",
    unavailable: "直播流当前不可用，无法预览。",
  });

  if (!probe.ok) {
    return NextResponse.json({ error: probe.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
