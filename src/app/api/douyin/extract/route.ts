import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getDbAdminClient, getDbServerClient } from "@/lib/db/server";
import { mediaWorkerRequest } from "@/lib/worker/client";

export const runtime = "nodejs";

const MEDIA_WORKER_POLL_INTERVAL_MS = 1200;
const MEDIA_WORKER_POLL_TIMEOUT_MS = 10 * 60_000;
type ExtractPlatform = "douyin" | "bilibili";

type RemoteTaskCreate = {
  task_id?: string;
  detail?: string;
};

type RemoteTaskStatus = {
  status: "pending" | "running" | "succeeded" | "failed";
  output?: {
    success?: boolean;
    video_id?: string;
    title?: string;
    text?: string;
    download_url?: string;
  } | null;
  error?: string | null;
};

const DEFAULT_VIDEO_COVER_URL = "/images/video-cover-placeholder.svg";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function toScopedItemId(userId: string, rawItemId: string) {
  return rawItemId.startsWith(`${userId}:`) ? rawItemId : `${userId}:${rawItemId}`;
}

function toScopedSourceUrl(userId: string, rawSourceUrl: string) {
  return `${rawSourceUrl}#u:${userId}`;
}

function hashId(input: string) {
  return createHash("sha1").update(input).digest("hex").slice(0, 16);
}

function detectPlatform(rawInput: string): ExtractPlatform {
  const normalized = rawInput.toLowerCase();
  if (normalized.includes("bilibili.com/video/") || normalized.includes("b23.tv/") || /bv[0-9a-z]+/i.test(rawInput)) {
    return "bilibili";
  }
  if (normalized.includes("douyin.com/") || normalized.includes("iesdouyin.com/")) {
    return "douyin";
  }
  throw new Error("暂仅支持抖音或哔哩哔哩视频链接");
}

async function runExtractViaMediaWorker(url: string, platform: ExtractPlatform) {
  const taskEndpoint = platform === "bilibili" ? "/v1/tasks/bilibili-extract" : "/v1/tasks/douyin-extract";
  const createPayload = await mediaWorkerRequest<RemoteTaskCreate>(taskEndpoint, {
    method: "POST",
    body: JSON.stringify({ url }),
  });

  if (!createPayload.task_id) {
    throw new Error(createPayload.detail || "提交媒体任务失败");
  }

  const taskId = createPayload.task_id;
  const start = Date.now();
  while (Date.now() - start < MEDIA_WORKER_POLL_TIMEOUT_MS) {
    const statusPayload = await mediaWorkerRequest<RemoteTaskStatus>(`/v1/tasks/${encodeURIComponent(taskId)}`, {
      method: "GET",
    });

    if (statusPayload.status === "succeeded") {
      if (!statusPayload.output) {
        throw new Error("媒体任务返回成功但无输出");
      }
      return {
        taskId,
        success: Boolean(statusPayload.output.success ?? true),
        videoId: statusPayload.output.video_id ?? "",
        title: statusPayload.output.title ?? "",
        text: statusPayload.output.text ?? "",
        downloadUrl: statusPayload.output.download_url ?? "",
      };
    }

    if (statusPayload.status === "failed") {
      throw new Error(statusPayload.error || "媒体任务执行失败");
    }

    await sleep(MEDIA_WORKER_POLL_INTERVAL_MS);
  }

  throw new Error("媒体任务超时，请稍后重试");
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

    const body = (await request.json()) as {
      url?: string;
      itemId?: string;
      title?: string;
      coverUrl?: string;
      shareUrl?: string;
    };
    const url = body.url?.trim();
    if (!url) {
      return NextResponse.json({ error: "缺少 url" }, { status: 400 });
    }
    const platform = detectPlatform(url);
    const titleFallback = platform === "bilibili" ? "B站文案提取" : "抖音文案提取";

    const result = await runExtractViaMediaWorker(url, platform);
    const rawItemId = body.itemId?.trim() || result.videoId || `${platform}:${hashId(url)}`;
    const scopedItemId = toScopedItemId(user.id, rawItemId);
    const sourceUrl = (body.shareUrl?.trim() || url).trim();
    const nowIso = new Date().toISOString();

    const admin = getDbAdminClient();
    const scopedSourceUrl = toScopedSourceUrl(user.id, sourceUrl);
    const { data: source, error: sourceError } = await admin
      .from("monitor_sources")
      .upsert(
        {
          platform,
          source_url: scopedSourceUrl,
          creator_id: "",
          creator_name: "",
          status: "active",
          last_seen_item_id: scopedItemId,
          last_seen_published_at: nowIso,
          last_polled_at: nowIso,
          user_id: user.id,
        },
        { onConflict: "platform,source_url" },
      )
      .select("id")
      .single();

    if (sourceError || !source) {
      return NextResponse.json({ error: sourceError?.message ?? "保存来源失败" }, { status: 500 });
    }

    const { data: existing } = await admin
      .from("monitor_items")
      .select("title,cover_url,published_at,metrics")
      .eq("platform", platform)
      .eq("item_id", scopedItemId)
      .eq("user_id", user.id)
      .maybeSingle();

    const title = (existing?.title || body.title?.trim() || result.title || titleFallback).trim();
    const contentText = result.text?.trim() || "";
    const nextMetrics = {
      ...(typeof existing?.metrics === "object" && existing.metrics ? existing.metrics : {}),
      extract_success: result.success,
      extract_status: "succeeded",
      extract_error: null,
      worker_task_id: result.taskId,
      video_id: result.videoId || rawItemId,
      download_url: result.downloadUrl,
      updated_at: nowIso,
    };

    const normalizedCoverUrl = (existing?.cover_url || body.coverUrl?.trim() || "").trim() || DEFAULT_VIDEO_COVER_URL;

    const { data: item, error: itemError } = await admin
      .from("monitor_items")
      .upsert(
        {
          platform,
          item_id: scopedItemId,
          source_id: source.id,
          title,
          content_text: contentText,
          source_url: sourceUrl,
          cover_url: normalizedCoverUrl,
          published_at: existing?.published_at ?? nowIso,
          metrics: nextMetrics,
          fetch_stage: "detail",
          user_id: user.id,
        },
        { onConflict: "platform,item_id" },
      )
      .select("id,platform,item_id,title,content_text,source_url,cover_url,published_at,metrics,fetch_stage,created_at,updated_at")
      .single();

    if (itemError || !item) {
      return NextResponse.json({ error: itemError?.message ?? "更新卡片失败" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      item,
      raw: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "提取失败",
      },
      { status: 502 },
    );
  }
}
