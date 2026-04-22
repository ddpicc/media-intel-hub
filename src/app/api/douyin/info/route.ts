import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getDbAdminClient, getDbServerClient } from "@/lib/db/server";
import { mediaWorkerRequest } from "@/lib/worker/client";

export const runtime = "nodejs";

type ExtractPlatform = "douyin" | "bilibili";

type VideoInfoPayload = {
  success?: boolean;
  video_id?: string;
  bvid?: string;
  cid?: number;
  title?: string;
  share_url?: string;
  download_url?: string;
  publish_time?: number | string | null;
  view_count?: number;
  like_count?: number;
  reply_count?: number;
  favorite_count?: number;
  coin_count?: number;
  owner_name?: string;
  share_count?: number;
  aweme_id?: string;
  digg_count?: number;
  comment_count?: number;
  collect_count?: number;
  nickname?: string;
  sec_uid?: string;
  cover_url?: string;
  cover_url_list?: string[];
};

const DEFAULT_VIDEO_COVER_URL = "/images/video-cover-placeholder.svg";

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

function toIsoDate(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return null;
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

    const body = (await request.json()) as { url?: string };
    const url = body.url?.trim();
    if (!url) {
      return NextResponse.json({ error: "缺少 url" }, { status: 400 });
    }
    const platform = detectPlatform(url);
    const infoEndpoint = platform === "bilibili" ? "/v1/bilibili/info" : "/v1/douyin/info";
    const titleFallback = platform === "bilibili" ? "B站文案提取" : "抖音文案提取";

    const info = await mediaWorkerRequest<VideoInfoPayload>(infoEndpoint, {
      method: "POST",
      body: JSON.stringify({ url }),
    });
    const rawItemId = (info.video_id || `${platform}:${hashId(url)}`).trim();
    const scopedItemId = toScopedItemId(user.id, rawItemId);
    const sourceUrl = (info.share_url || url).trim();
    const nowIso = new Date().toISOString();
    const publishedAt = toIsoDate(info.publish_time) ?? nowIso;

    const admin = getDbAdminClient();
    const scopedSourceUrl = toScopedSourceUrl(user.id, sourceUrl);
    const { data: source, error: sourceError } = await admin
      .from("monitor_sources")
      .upsert(
        {
          platform,
          source_url: scopedSourceUrl,
          creator_id: "",
          creator_name: info.nickname || info.owner_name || "",
          status: "active",
          last_seen_item_id: scopedItemId,
          last_seen_published_at: publishedAt,
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

    const normalizedCoverUrl = (info.cover_url || "").trim() || DEFAULT_VIDEO_COVER_URL;

    const nextMetrics = {
      extract_status: "extracting",
      extract_error: null,
      video_id: info.video_id || rawItemId,
      bvid: info.bvid || "",
      cid: Number(info.cid ?? 0),
      aweme_id: info.aweme_id || "",
      share_url: sourceUrl,
      download_url: info.download_url || "",
      view_count: Number(info.view_count ?? 0),
      like_count: Number(info.like_count ?? 0),
      reply_count: Number(info.reply_count ?? 0),
      favorite_count: Number(info.favorite_count ?? 0),
      coin_count: Number(info.coin_count ?? 0),
      digg_count: Number(info.digg_count ?? info.like_count ?? 0),
      comment_count: Number(info.comment_count ?? info.reply_count ?? 0),
      share_count: Number(info.share_count ?? 0),
      collect_count: Number(info.collect_count ?? info.favorite_count ?? 0),
      nickname: info.nickname || info.owner_name || "",
      sec_uid: info.sec_uid || "",
      cover_url_list: Array.isArray(info.cover_url_list) ? info.cover_url_list : [],
      updated_at: nowIso,
    };

    const { data: item, error: itemError } = await admin
      .from("monitor_items")
      .upsert(
        {
          platform,
          item_id: scopedItemId,
          source_id: source.id,
          title: (info.title || titleFallback).trim(),
          content_text: "",
          source_url: sourceUrl,
          cover_url: normalizedCoverUrl,
          published_at: publishedAt,
          metrics: nextMetrics,
          fetch_stage: "list",
          user_id: user.id,
        },
        { onConflict: "platform,item_id" },
      )
      .select("id,platform,item_id,title,content_text,source_url,cover_url,published_at,metrics,fetch_stage,created_at,updated_at")
      .single();

    if (itemError || !item) {
      return NextResponse.json({ error: itemError?.message ?? "创建卡片失败" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      item,
      raw: {
        platform,
        video_id: info.video_id ?? "",
        title: info.title ?? "",
        share_url: sourceUrl,
        cover_url: normalizedCoverUrl,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "获取元数据失败",
      },
      { status: 502 },
    );
  }
}
