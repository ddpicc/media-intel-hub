import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { getDbAdminClient, getDbServerClient } from "@/lib/db/server";
import { mediaWorkerRequest } from "@/lib/worker/client";

export const runtime = "nodejs";

type WorkerProcessStatus = { item_id: string; running: boolean; pid: number | null };
type WorkerTranscriptTail = {
  item_id: string;
  running: boolean;
  pid: number | null;
  lines: string[];
  next_cursor: number;
  cursor_reset?: boolean;
};
type WorkerTranscriptCursor = {
  item_id: string;
  running: boolean;
  pid: number | null;
  current_cursor: number;
};

type MetricsRecord = Record<string, unknown>;

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function buildSharedRuntimeItemId(streamUrl: string) {
  const digest = createHash("sha1").update(streamUrl.trim()).digest("hex").slice(0, 16);
  return `live_shared:${digest}`;
}

function buildArtifactPaths(itemId: string) {
  const baseName = sanitizeFileSegment(itemId);
  const baseDir = path.join(process.cwd(), "data", "live-transcripts");
  return {
    baseDir,
    transcriptPath: path.join(baseDir, `${baseName}.md`),
    stdoutPath: path.join(baseDir, `${baseName}.stdout.log`),
    stderrPath: path.join(baseDir, `${baseName}.stderr.log`),
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

function metricNumber(metrics: unknown, key: string, fallback = 0) {
  const record = normalizeMetrics(metrics);
  const raw = Number(record[key]);
  return Number.isFinite(raw) ? raw : fallback;
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
  return metricString(item.metrics, "shared_live_runtime_id") || buildSharedRuntimeItemId(item.source_url);
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

async function hasOtherLiveSubscribers(runtimeItemId: string, sourceUrl: string, excludeItemId: string) {
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
    const rowRuntime = metricString(metrics, "shared_live_runtime_id") || buildSharedRuntimeItemId(row.source_url || "");
    return rowRuntime === runtimeItemId && isLiveStateActive(metrics.live_state);
  });
}

function mergeTranscriptContent(prevContent: string, lines: string[], reset: boolean) {
  const chunk = lines.join("\n").trim();
  if (!chunk) {
    return reset ? prevContent : prevContent;
  }
  if (reset) {
    return chunk;
  }
  const base = (prevContent || "").trim();
  return base ? `${base}\n${chunk}` : chunk;
}

function parseTimestampToSeconds(token: string) {
  const parts = token.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) {
    const [mm, ss] = parts;
    return mm * 60 + ss;
  }
  if (parts.length === 3) {
    const [hh, mm, ss] = parts;
    return hh * 3600 + mm * 60 + ss;
  }
  return null;
}

function formatSecondsToTimestamp(totalSeconds: number, sourceToken: string) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(safe / 3600);
  const mm = Math.floor((safe % 3600) / 60);
  const ss = safe % 60;
  if (sourceToken.split(":").length === 2) {
    const totalMinutes = hh * 60 + mm;
    return `${String(totalMinutes).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function normalizeTranscriptLinesForSession(lines: string[], priorOffsetSec: number | null) {
  const timestampRegex = /(\[?)(\d{1,2}:\d{2}(?::\d{2})?)(\]?)/g;
  let offsetSec = priorOffsetSec;
  if (offsetSec === null) {
    for (const line of lines) {
      const match = timestampRegex.exec(line);
      timestampRegex.lastIndex = 0;
      if (!match) continue;
      const parsed = parseTimestampToSeconds(match[2]);
      if (parsed !== null) {
        offsetSec = parsed;
        break;
      }
    }
  }
  if (offsetSec === null) return { lines, offsetSec: null };
  const normalizedLines = lines.map((line) =>
    line.replace(timestampRegex, (_, prefix: string, token: string, suffix: string) => {
      const parsed = parseTimestampToSeconds(token);
      if (parsed === null) return `${prefix}${token}${suffix}`;
      return `${prefix}${formatSecondsToTimestamp(parsed - offsetSec, token)}${suffix}`;
    }),
  );
  return { lines: normalizedLines, offsetSec };
}

async function loadItem(userId: string, rawItemId: string) {
  const admin = getDbAdminClient();
  const { data, error } = await admin
    .from("monitor_items")
    .select("id,item_id,platform,title,content_text,source_url,metrics,user_id")
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
    const metrics = normalizeMetrics(item.metrics);
    const sessionStartCursor = Math.max(0, Math.floor(metricNumber(metrics, "session_start_cursor", 0)));
    const cursor = Math.max(sessionStartCursor, Math.floor(metricNumber(metrics, "transcript_cursor", sessionStartCursor)));
    const runtimeItemId = getRuntimeItemId(item);
    const tail = await mediaWorkerRequest<WorkerTranscriptTail>(
      `/v1/wechat-live/transcription/${encodeURIComponent(runtimeItemId)}/tail?cursor=${cursor}`,
      { method: "GET" },
    );

    const admin = getDbAdminClient();
    const normalized = normalizeTranscriptLinesForSession(
      Array.isArray(tail.lines) ? tail.lines : [],
      Number.isFinite(Number(metrics.session_ts_offset_sec)) ? Number(metrics.session_ts_offset_sec) : null,
    );
    const transcriptText = mergeTranscriptContent(
      item.content_text ?? "",
      normalized.lines,
      Boolean(tail.cursor_reset),
    );
    const nextMetrics = {
      ...metrics,
      pid: tail.pid,
      live_state: tail.running ? "running" : "stopped",
      status: tail.running ? "转写中" : "已停止",
      shared_live_runtime_id: runtimeItemId,
      session_start_cursor: sessionStartCursor,
      transcript_cursor: Math.max(sessionStartCursor, Number(tail.next_cursor ?? 0)),
      session_ts_offset_sec: normalized.offsetSec,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updateError } = await admin
      .from("monitor_items")
      .update({
        content_text: transcriptText,
        metrics: nextMetrics,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .eq("user_id", user.id)
      .select("id,platform,item_id,title,content_text,source_url,cover_url,published_at,metrics,fetch_stage,created_at,updated_at")
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? "更新状态失败" }, { status: 500 });
    }

    return NextResponse.json({ status: { item_id: tail.item_id, running: tail.running, pid: tail.pid }, item: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "查询状态失败" },
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
      const rowRuntime = metricString(metrics, "shared_live_runtime_id") || buildSharedRuntimeItemId(item.source_url);
      return rowRuntime === runtimeItemId && isLiveStateActive(metrics.live_state);
    });
    const peerMetrics = activePeer ? normalizeMetrics(activePeer.metrics) : {};
    const generatedPaths = buildArtifactPaths(runtimeItemId);
    const peerTranscriptPath = metricString(peerMetrics, "local_transcript_path");
    const peerStdoutPath = metricString(peerMetrics, "local_stdout_path");
    const peerStderrPath = metricString(peerMetrics, "local_stderr_path");
    const paths = {
      baseDir: peerTranscriptPath ? path.dirname(peerTranscriptPath) : generatedPaths.baseDir,
      transcriptPath: peerTranscriptPath || generatedPaths.transcriptPath,
      stdoutPath: peerStdoutPath || generatedPaths.stdoutPath,
      stderrPath: peerStderrPath || generatedPaths.stderrPath,
    };
    fs.mkdirSync(paths.baseDir, { recursive: true });
    fs.appendFileSync(paths.stdoutPath, "", "utf8");
    fs.appendFileSync(paths.stderrPath, "", "utf8");
    if (!fs.existsSync(paths.transcriptPath)) {
      fs.writeFileSync(paths.transcriptPath, `# ${item.title}\n\n## 实时正文\n\n`, "utf8");
    }

    const worker = await mediaWorkerRequest<WorkerProcessStatus>("/v1/wechat-live/transcription/start", {
      method: "POST",
      body: JSON.stringify({
        item_id: runtimeItemId,
        user_id: user.id,
        stream_url: item.source_url,
        transcript_path: paths.transcriptPath,
        stdout_path: paths.stdoutPath,
        stderr_path: paths.stderrPath,
      }),
    });

    const cursorInfo = await mediaWorkerRequest<WorkerTranscriptCursor>(
      `/v1/wechat-live/transcription/${encodeURIComponent(runtimeItemId)}/cursor`,
      { method: "GET" },
    );

    const metrics = normalizeMetrics(item.metrics);
    const sessionStartCursor = Math.max(0, Math.floor(Number(cursorInfo.current_cursor ?? 0)));
    const nextMetrics = {
      ...metrics,
      live_state: worker.running ? "running" : "starting",
      status: worker.running ? "转写中" : "启动中",
      pid: worker.pid,
      shared_live_runtime_id: runtimeItemId,
      session_start_cursor: sessionStartCursor,
      transcript_cursor: sessionStartCursor,
      session_ts_offset_sec: null,
      local_transcript_path: paths.transcriptPath,
      local_stdout_path: paths.stdoutPath,
      local_stderr_path: paths.stderrPath,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_error: "",
    };

    const { data: updated, error: updateError } = await admin
      .from("monitor_items")
      .update({ content_text: "", metrics: nextMetrics, updated_at: new Date().toISOString() })
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
      { error: error instanceof Error ? error.message : "启动转写失败" },
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
    const shouldStopWorker = !(await hasOtherLiveSubscribers(runtimeItemId, item.source_url, item.item_id));
    const worker = shouldStopWorker
      ? await mediaWorkerRequest<WorkerProcessStatus>("/v1/wechat-live/transcription/stop", {
          method: "POST",
          body: JSON.stringify({ item_id: runtimeItemId, user_id: user.id }),
        })
      : { item_id: runtimeItemId, running: true, pid: null };

    const admin = getDbAdminClient();
    const metrics = normalizeMetrics(item.metrics);
    const sessionStartCursor = Math.max(0, Math.floor(metricNumber(metrics, "session_start_cursor", 0)));
    const cursor = Math.max(sessionStartCursor, Math.floor(metricNumber(metrics, "transcript_cursor", sessionStartCursor)));
    const tail = await mediaWorkerRequest<WorkerTranscriptTail>(
      `/v1/wechat-live/transcription/${encodeURIComponent(runtimeItemId)}/tail?cursor=${cursor}`,
      { method: "GET" },
    );
    const normalized = normalizeTranscriptLinesForSession(
      Array.isArray(tail.lines) ? tail.lines : [],
      Number.isFinite(Number(metrics.session_ts_offset_sec)) ? Number(metrics.session_ts_offset_sec) : null,
    );
    const transcriptText = mergeTranscriptContent(item.content_text ?? "", normalized.lines, Boolean(tail.cursor_reset));

    const nextMetrics = {
      ...metrics,
      live_state: "stopped",
      status: "已停止",
      pid: null,
      shared_live_runtime_id: runtimeItemId,
      session_start_cursor: sessionStartCursor,
      transcript_cursor: Math.max(sessionStartCursor, Number(tail.next_cursor ?? 0)),
      session_ts_offset_sec: normalized.offsetSec,
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updateError } = await admin
      .from("monitor_items")
      .update({
        content_text: transcriptText || item.content_text,
        metrics: nextMetrics,
        updated_at: new Date().toISOString(),
      })
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
      { error: error instanceof Error ? error.message : "停止转写失败" },
      { status: 500 },
    );
  }
}
