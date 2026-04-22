import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getDbAdminClient, getDbServerClient } from "@/lib/db/server";
import { mediaWorkerRequest } from "@/lib/worker/client";

function normalizeStreamUrl(value: string) {
  return value.trim();
}

function toScopedSourceUrl(userUid: string, rawSourceUrl: string) {
  return `${rawSourceUrl}#u:${userUid}`;
}

function toScopedItemId(userId: string, rawItemId: string) {
  return rawItemId.startsWith(`${userId}:`) ? rawItemId : `${userId}:${rawItemId}`;
}

function buildWechatLiveItemId(streamUrl: string) {
  const digest = createHash("sha1").update(streamUrl).digest("hex").slice(0, 16);
  return `live:${digest}`;
}

function buildSharedRuntimeItemId(streamUrl: string) {
  const digest = createHash("sha1").update(streamUrl.trim()).digest("hex").slice(0, 16);
  return `live_shared:${digest}`;
}

function isLiveStateActive(state: unknown) {
  const value = String(state ?? "").toLowerCase();
  return value === "running" || value === "starting";
}

function isDownloadStateActive(state: unknown) {
  const value = String(state ?? "").toLowerCase();
  return value === "downloading" || value === "starting";
}

function metricString(metrics: unknown, key: string) {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) return "";
  const raw = (metrics as Record<string, unknown>)[key];
  return typeof raw === "string" ? raw.trim() : "";
}

export async function GET() {
  try {
    const dbSession = await getDbServerClient();
    const {
      data: { user },
    } = await dbSession.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const admin = getDbAdminClient();
    const { data, error } = await admin
      .from("monitor_sources")
      .select("id,source_url,status,last_polled_at,created_at,updated_at")
      .eq("platform", "wechat_live")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const sources = (data ?? []).map((item) => ({
      id: item.id,
      stream_url: item.source_url.replace(/#u:[^#]+$/, ""),
      status: item.status,
      last_polled_at: item.last_polled_at,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));
    return NextResponse.json({ sources });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "加载直播源失败" },
      { status: 500 },
    );
  }
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

    const body = (await request.json()) as { streamUrl?: string };
    const streamUrl = normalizeStreamUrl(body.streamUrl ?? "");
    if (!streamUrl) {
      return NextResponse.json({ error: "缺少直播流地址" }, { status: 400 });
    }

    const admin = getDbAdminClient();
    const scopedSourceUrl = toScopedSourceUrl(user.id, streamUrl);
    const { data, error } = await admin
      .from("monitor_sources")
      .upsert(
        {
          platform: "wechat_live",
          source_url: scopedSourceUrl,
          creator_id: streamUrl,
          creator_name: "视频号直播",
          status: "active",
          user_id: user.id,
        },
        { onConflict: "platform,source_url" },
      )
      .select("id,source_url,status,last_polled_at,created_at,updated_at")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "保存直播流地址失败" }, { status: 500 });
    }

    const scopedItemId = toScopedItemId(user.id, buildWechatLiveItemId(streamUrl));
    const nowIso = new Date().toISOString();
    const { data: upsertedItem, error: itemError } = await admin
      .from("monitor_items")
      .upsert(
        {
          platform: "wechat_live",
          item_id: scopedItemId,
          source_id: data.id,
          title: `直播转写 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
          content_text: "",
          source_url: streamUrl,
          cover_url: "",
          published_at: nowIso,
          metrics: {
            status: "未启动",
            live_state: "stopped",
            download_state: "idle",
            stream_url: streamUrl,
            updated_at: nowIso,
          },
          fetch_stage: "detail",
          user_id: user.id,
        },
        { onConflict: "platform,item_id" },
      )
      .select("id,platform,item_id,title,content_text,source_url,cover_url,published_at,metrics,fetch_stage,created_at,updated_at")
      .single();

    if (itemError || !upsertedItem) {
      return NextResponse.json({ error: itemError?.message ?? "创建直播卡片失败" }, { status: 500 });
    }

    return NextResponse.json({
      source: {
        id: data.id,
        stream_url: data.source_url.replace(/#u:[^#]+$/, ""),
        status: data.status,
        last_polled_at: data.last_polled_at,
        created_at: data.created_at,
        updated_at: data.updated_at,
      },
      item: upsertedItem,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存直播源失败" },
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

    const streamUrl = request.nextUrl.searchParams.get("streamUrl")?.trim() ?? "";
    if (!streamUrl) {
      return NextResponse.json({ error: "缺少 streamUrl" }, { status: 400 });
    }

    const admin = getDbAdminClient();
    const scopedItemId = toScopedItemId(user.id, buildWechatLiveItemId(streamUrl));
    const runtimeItemId = buildSharedRuntimeItemId(streamUrl);

    const { data: rows, error: rowsError } = await admin
      .from("monitor_items")
      .select("item_id,source_url,metrics")
      .eq("platform", "wechat_live")
      .eq("source_url", streamUrl);
    if (rowsError) {
      return NextResponse.json({ error: rowsError.message }, { status: 500 });
    }
    const hasOtherLiveSubscriber = (rows ?? []).some((row) => {
      if (row.item_id === scopedItemId) return false;
      const rowRuntime = metricString(row.metrics, "shared_live_runtime_id") || buildSharedRuntimeItemId(row.source_url || "");
      const liveState = (row.metrics as Record<string, unknown> | null)?.live_state;
      return rowRuntime === runtimeItemId && isLiveStateActive(liveState);
    });
    const hasOtherDownloadSubscriber = (rows ?? []).some((row) => {
      if (row.item_id === scopedItemId) return false;
      const rowRuntime = metricString(row.metrics, "shared_download_runtime_id") || buildSharedRuntimeItemId(row.source_url || "");
      const downloadState = (row.metrics as Record<string, unknown> | null)?.download_state;
      return rowRuntime === runtimeItemId && isDownloadStateActive(downloadState);
    });

    if (!hasOtherLiveSubscriber) {
      await mediaWorkerRequest(`/v1/wechat-live/transcription/stop`, {
        method: "POST",
        body: JSON.stringify({ item_id: runtimeItemId, user_id: user.id }),
      }).catch(() => undefined);
    }

    if (!hasOtherDownloadSubscriber) {
      await mediaWorkerRequest(`/v1/wechat-live/download/stop`, {
        method: "POST",
        body: JSON.stringify({ item_id: runtimeItemId, user_id: user.id }),
      }).catch(() => undefined);
    }

    const { error: itemDeleteError } = await admin
      .from("monitor_items")
      .delete()
      .eq("platform", "wechat_live")
      .eq("user_id", user.id)
      .eq("item_id", scopedItemId);

    if (itemDeleteError) {
      return NextResponse.json({ error: itemDeleteError.message }, { status: 500 });
    }

    const { error: sourceDeleteError } = await admin
      .from("monitor_sources")
      .delete()
      .eq("platform", "wechat_live")
      .eq("user_id", user.id)
      .eq("source_url", toScopedSourceUrl(user.id, streamUrl));

    if (sourceDeleteError) {
      return NextResponse.json({ error: sourceDeleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除直播源失败" },
      { status: 500 },
    );
  }
}
