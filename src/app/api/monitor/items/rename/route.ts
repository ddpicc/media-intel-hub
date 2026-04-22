import { NextRequest, NextResponse } from "next/server";
import { getDbAdminClient, getDbServerClient } from "@/lib/db/server";
import type { Database } from "@/lib/db/types";

type MonitorItemRow = Database["public"]["Tables"]["monitor_items"]["Row"];

type RenameBody = {
  platform?: "douyin" | "wechat_live";
  itemId?: string;
  title?: string;
};

function toScopedItemId(userId: string, rawItemId: string) {
  return rawItemId.startsWith(`${userId}:`) ? rawItemId : `${userId}:${rawItemId}`;
}

function toCardPreview(item: MonitorItemRow) {
  return {
    id: item.id,
    platform: item.platform,
    item_id: item.item_id,
    title: item.title,
    content_text: item.content_text,
    source_url: item.source_url,
    cover_url: item.cover_url,
    published_at: item.published_at,
    metrics: item.metrics,
    fetch_stage: item.fetch_stage,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

export async function POST(request: NextRequest) {
  try {
    const dbSession = await getDbServerClient();
    const {
      data: { user },
    } = await dbSession.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const body = (await request.json()) as RenameBody;
    const platform = body.platform;
    const itemId = body.itemId?.trim() ?? "";
    const title = body.title?.trim() ?? "";
    if (!platform || !itemId || !title) {
      return NextResponse.json({ error: "platform、itemId、title 必填" }, { status: 400 });
    }
    if (platform !== "wechat_live") {
      return NextResponse.json({ error: "当前仅直播卡片支持改名" }, { status: 400 });
    }

    const admin = getDbAdminClient();
    const scopedItemId = toScopedItemId(user.id, itemId);
    const candidateIds = Array.from(new Set([itemId, scopedItemId]));

    const { data: updated, error } = await admin
      .from("monitor_items")
      .update({
        title,
        updated_at: new Date().toISOString(),
      })
      .eq("platform", platform)
      .eq("user_id", user.id)
      .in("item_id", candidateIds)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: "卡片不存在或无权限" }, { status: 404 });
    }

    return NextResponse.json({ item: toCardPreview(updated as MonitorItemRow) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新卡片名称失败" },
      { status: 500 },
    );
  }
}
