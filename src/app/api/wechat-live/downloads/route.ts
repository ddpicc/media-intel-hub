import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { getDbAdminClient, getDbServerClient } from "@/lib/db/server";
import { mediaWorkerRequest } from "@/lib/worker/client";

export const runtime = "nodejs";

type WorkerProcessStatus = { item_id: string; running: boolean; pid: number | null };
type MetricsRecord = Record<string, unknown>;

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function buildSharedRuntimeItemId(streamUrl: string) {
  const digest = createHash("sha1").update(streamUrl.trim()).digest("hex").slice(0, 16);
  return `live_shared:${digest}`;
}

function buildDownloadArtifactPaths(itemId: string) {
  const baseName = sanitizeFileSegment(itemId).slice(-16) || "live";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `live-${baseName}-${timestamp}.mp4`;
  const baseDir = path.join(process.cwd(), "data", "live-recordings");
  return {
    baseDir,
    filename,
    recordingPath: path.join(baseDir, filename),
    stdoutPath: path.join(baseDir, `${baseName}.download.stdout.log`),
    stderrPath: path.join(baseDir, `${baseName}.download.stderr.log`),
  };
}

function normalizeMetrics(metrics: unknown): MetricsRecord {
  return metrics && typeof metrics === "object" && !Array.isArray(metrics)
    ? (metrics as MetricsRecord)
    : {};
}

function metricString(metrics: unknown, key: string) {
  const record = normalizeMetrics(metrics);
  const raw = record[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function isLiveStateActive(state: unknown) {
  const value = String(state ?? "").toLowerCase();
  return value === "running" || value === "starting";
}

function isDownloadStateActive(state: unknown) {
  const value = String(state ?? "").toLowerCase();
  return value === "downloading" || value === "starting";
}

function getRuntimeItemId(item: { item_id: string; source_url: string; metrics: unknown }) {
  return metricString(item.metrics, "shared_download_runtime_id") || buildSharedRuntimeItemId(item.source_url);
}

async function assertSingleActiveSource(userId: string, currentRowId: string, currentSourceUrl: string) {
  const admin = getDbAdminClient();
  const { data, error } = await admin
    .from("monitor_items")
    .select("id,item_id,title,source_url,metrics")
    .eq("platform", "wechat_live")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const blocking = (data ?? []).find((row) => {
    if (row.id === currentRowId) return false;
    if ((row.source_url ?? "").trim() === currentSourceUrl) return false;
    const metrics = normalizeMetrics(row.metrics);
    return isLiveStateActive(metrics.live_state) || isDownloadStateActive(metrics.download_state);
  });
  if (blocking) {
    throw new Error(`当前仅支持单直播源并发。请先停止「${blocking.title || blocking.item_id}」再启动新直播源。`);
  }
}

async function hasOtherDownloadSubscribers(runtimeItemId: string, sourceUrl: string, excludeItemId: string) {
  const admin = getDbAdminClient();
  const { data, error } = await admin
    .from("monitor_items")
    .select("item_id,source_url,metrics")
    .eq("platform", "wechat_live")
    .eq("source_url", sourceUrl);
  if (error) throw new Error(error.message);
  return (data ?? []).some((row) => {
    if (row.item_id === excludeItemId) return false;
    const metrics = normalizeMetrics(row.metrics);
    const rowRuntime = metricString(metrics, "shared_download_runtime_id") || buildSharedRuntimeItemId(row.source_url || "");
    return rowRuntime === runtimeItemId && isDownloadStateActive(metrics.download_state);
  });
}

async function loadItem(userId: string, rawItemId: string) {
  const admin = getDbAdminClient();
  const { data, error } = await admin
    .from("monitor_items")
    .select("id,item_id,platform,source_url,metrics,user_id")
    .eq("platform", "wechat_live")
    .eq("user_id", userId)
    .eq("item_id", rawItemId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("直播卡片不存在");
  }
  return data;
}

export async function GET(request: NextRequest) {
  try {
    const dbSession = await getDbServerClient();
    const {
      data: { user },
    } = await dbSession.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const itemId = request.nextUrl.searchParams.get("itemId")?.trim() ?? "";
    if (!itemId) {
      return NextResponse.json({ error: "缺少 itemId" }, { status: 400 });
    }

    const item = await loadItem(user.id, itemId);
    const runtimeItemId = getRuntimeItemId(item);
    const worker = await mediaWorkerRequest<WorkerProcessStatus>(
      `/v1/wechat-live/download/${encodeURIComponent(runtimeItemId)}`,
      { method: "GET" },
    );

    const admin = getDbAdminClient();
    const metrics = normalizeMetrics(item.metrics);
    const nextMetrics = {
      ...metrics,
      download_pid: worker.pid,
      download_state: worker.running ? "downloading" : "stopped",
      shared_download_runtime_id: runtimeItemId,
      download_updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updateError } = await admin
      .from("monitor_items")
      .update({ metrics: nextMetrics, updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("user_id", user.id)
      .select("id,platform,item_id,title,content_text,source_url,cover_url,published_at,metrics,fetch_stage,created_at,updated_at")
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? "更新状态失败" }, { status: 500 });
    }

    return NextResponse.json({ status: worker, item: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "查询下载状态失败" },
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

    const body = (await request.json()) as { itemId?: string };
    const itemId = body.itemId?.trim() ?? "";
    if (!itemId) {
      return NextResponse.json({ error: "缺少 itemId" }, { status: 400 });
    }

    const item = await loadItem(user.id, itemId);
    await assertSingleActiveSource(user.id, item.id, item.source_url);
    const runtimeItemId = buildSharedRuntimeItemId(item.source_url);
    const admin = getDbAdminClient();
    const { data: peerRows, error: peerError } = await admin
      .from("monitor_items")
      .select("item_id,metrics")
      .eq("platform", "wechat_live")
      .eq("source_url", item.source_url);
    if (peerError) {
      return NextResponse.json({ error: peerError.message }, { status: 500 });
    }
    const activePeer = (peerRows ?? []).find((row) => {
      if (row.item_id === item.item_id) return false;
      const metrics = normalizeMetrics(row.metrics);
      const rowRuntime = metricString(metrics, "shared_download_runtime_id") || buildSharedRuntimeItemId(item.source_url);
      return rowRuntime === runtimeItemId && isDownloadStateActive(metrics.download_state);
    });
    const peerMetrics = activePeer ? normalizeMetrics(activePeer.metrics) : {};
    const generatedPaths = buildDownloadArtifactPaths(runtimeItemId);
    const peerRecordingPath = metricString(peerMetrics, "download_local_path");
    const peerStdoutPath = metricString(peerMetrics, "download_stdout_path");
    const peerStderrPath = metricString(peerMetrics, "download_stderr_path");
    const paths = {
      baseDir: peerRecordingPath ? path.dirname(peerRecordingPath) : generatedPaths.baseDir,
      filename: metricString(peerMetrics, "download_filename") || generatedPaths.filename,
      recordingPath: peerRecordingPath || generatedPaths.recordingPath,
      stdoutPath: peerStdoutPath || generatedPaths.stdoutPath,
      stderrPath: peerStderrPath || generatedPaths.stderrPath,
    };
    fs.mkdirSync(paths.baseDir, { recursive: true });
    fs.appendFileSync(paths.stdoutPath, "", "utf8");
    fs.appendFileSync(paths.stderrPath, "", "utf8");

    const worker = await mediaWorkerRequest<WorkerProcessStatus>("/v1/wechat-live/download/start", {
      method: "POST",
      body: JSON.stringify({
        item_id: runtimeItemId,
        user_id: user.id,
        stream_url: item.source_url,
        recording_path: paths.recordingPath,
        stdout_path: paths.stdoutPath,
        stderr_path: paths.stderrPath,
      }),
    });

    const metrics = normalizeMetrics(item.metrics);
    const nextMetrics = {
      ...metrics,
      download_state: worker.running ? "downloading" : "starting",
      download_pid: worker.pid,
      shared_download_runtime_id: runtimeItemId,
      download_started_at: new Date().toISOString(),
      download_updated_at: new Date().toISOString(),
      download_local_path: paths.recordingPath,
      download_stdout_path: paths.stdoutPath,
      download_stderr_path: paths.stderrPath,
      download_filename: paths.filename,
      download_error: "",
    };

    const { data: updated, error: updateError } = await admin
      .from("monitor_items")
      .update({ metrics: nextMetrics, updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("user_id", user.id)
      .select("id,platform,item_id,title,content_text,source_url,cover_url,published_at,metrics,fetch_stage,created_at,updated_at")
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? "更新状态失败" }, { status: 500 });
    }

    return NextResponse.json({ status: worker, item: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "启动下载失败" },
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

    const body = (await request.json()) as { itemId?: string };
    const itemId = body.itemId?.trim() ?? "";
    if (!itemId) {
      return NextResponse.json({ error: "缺少 itemId" }, { status: 400 });
    }

    const item = await loadItem(user.id, itemId);
    const runtimeItemId = getRuntimeItemId(item);
    const shouldStopWorker = !(await hasOtherDownloadSubscribers(runtimeItemId, item.source_url, item.item_id));
    const worker = shouldStopWorker
      ? await mediaWorkerRequest<WorkerProcessStatus>("/v1/wechat-live/download/stop", {
          method: "POST",
          body: JSON.stringify({ item_id: runtimeItemId, user_id: user.id }),
        })
      : { item_id: runtimeItemId, running: true, pid: null };

    const admin = getDbAdminClient();
    const metrics = normalizeMetrics(item.metrics);
    const nextMetrics = {
      ...metrics,
      download_state: "stopped",
      download_pid: null,
      shared_download_runtime_id: runtimeItemId,
      download_ended_at: new Date().toISOString(),
      download_updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updateError } = await admin
      .from("monitor_items")
      .update({ metrics: nextMetrics, updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("user_id", user.id)
      .select("id,platform,item_id,title,content_text,source_url,cover_url,published_at,metrics,fetch_stage,created_at,updated_at")
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? "更新状态失败" }, { status: 500 });
    }

    return NextResponse.json({ status: worker, item: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "停止下载失败" },
      { status: 500 },
    );
  }
}
