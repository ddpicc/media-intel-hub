import { NextResponse } from "next/server";
import { getDbAdminClient, getDbServerClient } from "@/lib/db/server";
import { probeLiveStreamAvailability } from "@/lib/live/stream-probe";

export const runtime = "nodejs";

type MetricsRecord = Record<string, unknown>;

function normalizeMetrics(metrics: unknown): MetricsRecord {
  return metrics && typeof metrics === "object" && !Array.isArray(metrics) ? (metrics as MetricsRecord) : {};
}

export async function POST() {
  try {
    const dbSession = await getDbServerClient();
    const {
      data: { user },
    } = await dbSession.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const admin = getDbAdminClient();
    const { data: items, error } = await admin
      .from("monitor_items")
      .select("id,item_id,source_url,metrics,source_id")
      .eq("platform", "wechat_live")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const validItemIds: string[] = [];
    const invalidItemIds: string[] = [];

    for (const item of items ?? []) {
      const streamUrl = (item.source_url || "").trim();
      const probe = await probeLiveStreamAvailability(streamUrl, process.env.FFMPEG_PATH || "ffmpeg", {
        invalidData: "直播流数据格式异常，当前不可用。",
        unavailable: "直播流当前不可用。",
      });

      const nextMetrics = {
        ...normalizeMetrics(item.metrics),
        probe_available: probe.ok,
        probe_error: probe.ok ? "" : probe.error,
        probe_checked_at: new Date().toISOString(),
      };

      await admin
        .from("monitor_items")
        .update({
          metrics: nextMetrics,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("user_id", user.id);

      if (item.source_id) {
        await admin
          .from("monitor_sources")
          .update({
            status: probe.ok ? "active" : "inactive",
            last_polled_at: new Date().toISOString(),
          })
          .eq("id", item.source_id)
          .eq("user_id", user.id);
      }

      if (probe.ok) {
        validItemIds.push(item.id);
      } else {
        invalidItemIds.push(item.id);
      }
    }

    return NextResponse.json({
      success: true,
      validItemIds,
      invalidItemIds,
      checkedCount: (items ?? []).length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "自动探测失败" },
      { status: 500 },
    );
  }
}
