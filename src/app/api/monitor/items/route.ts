import { NextRequest, NextResponse } from "next/server";
import { getDbAdminClient, getDbServerClient } from "@/lib/db/server";

export async function GET(request: NextRequest) {
  try {
    const dbSession = await getDbServerClient();
    const {
      data: { user },
    } = await dbSession.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const limit = Math.min(
      Math.max(Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10) || 100, 1),
      300,
    );

    const admin = getDbAdminClient();
    const { data, error } = await admin
      .from("monitor_items")
      .select("id,platform,item_id,title,content_text,source_url,cover_url,published_at,metrics,fetch_stage,created_at,updated_at")
      .eq("user_id", user.id)
      .in("platform", ["douyin", "bilibili", "wechat_live"])
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "加载卡片失败" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const dbSession = await getDbServerClient();
    const {
      data: { user },
    } = await dbSession.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
    if (!id) {
      return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    }

    const admin = getDbAdminClient();

    const { data: item, error: itemError } = await admin
      .from("monitor_items")
      .select("id,platform,item_id,source_url")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (itemError) {
      return NextResponse.json({ error: itemError.message }, { status: 500 });
    }

    if (!item) {
      return NextResponse.json({ error: "卡片不存在" }, { status: 404 });
    }

    const { error: deleteError } = await admin.from("monitor_items").delete().eq("id", id).eq("user_id", user.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    if (item.platform === "wechat_live") {
      const scopedSourceUrl = `${item.source_url}#u:${user.id}`;
      const { error: sourceDeleteError } = await admin
        .from("monitor_sources")
        .delete()
        .eq("platform", "wechat_live")
        .eq("user_id", user.id)
        .eq("source_url", scopedSourceUrl);
      if (sourceDeleteError) {
        return NextResponse.json({ error: sourceDeleteError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除失败" },
      { status: 500 },
    );
  }
}
