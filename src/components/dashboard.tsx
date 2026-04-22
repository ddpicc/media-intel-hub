"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bell,
  Check,
  ChevronRight,
  CloudDownload,
  Eye,
  History,
  LayoutDashboard,
  Loader2,
  MoreVertical,
  Pencil,
  Play,
  Radio,
  Settings,
  SlidersHorizontal,
  Square,
  X,
} from "lucide-react";

type Platform = "douyin" | "bilibili" | "wechat_live";
type TaskStatus = "completed" | "failed" | "running";

type MonitorItem = {
  id: string;
  platform: Platform;
  item_id: string;
  title: string;
  content_text: string;
  source_url: string;
  cover_url: string;
  published_at: string | null;
  metrics: Record<string, unknown>;
  fetch_stage: "list" | "detail" | "comments";
  created_at: string;
  updated_at: string;
};

type DashboardProps = {
  userEmail: string;
};

function requestJson<T>(url: string, init?: RequestInit) {
  return fetch(url, { ...init, cache: "no-store" }).then(async (res) => {
    const payload = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
      throw new Error(payload.error || `请求失败: ${res.status}`);
    }
    return payload;
  });
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("zh-CN", { hour12: false });
}

function truncateText(value: string, maxLength = 26) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00m 00s";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function calcDurationSeconds(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return Math.max(0, (endDate.getTime() - startDate.getTime()) / 1000);
}

function getTaskStatus(item: MonitorItem): TaskStatus {
  const liveState = String(item.metrics?.live_state ?? "").toLowerCase();
  const downloadState = String(item.metrics?.download_state ?? "").toLowerCase();
  const failureHints = ["error", "failed", "fail"];
  const runningHints = ["running", "processing", "queued", "pending"];

  if (failureHints.some((hint) => liveState.includes(hint) || downloadState.includes(hint))) return "failed";
  if (runningHints.some((hint) => liveState.includes(hint) || downloadState.includes(hint))) return "running";
  return "completed";
}

function isLiveSourceAvailable(item: MonitorItem) {
  return item.platform !== "wechat_live" || item.metrics?.probe_available !== false;
}

function getLiveStatusText(item: MonitorItem) {
  const liveState = String(item.metrics?.live_state ?? "").toLowerCase();
  const downloadState = String(item.metrics?.download_state ?? "").toLowerCase();
  const isLiveRunning = liveState.includes("running");
  const isLiveStarting = liveState.includes("starting");
  const isDownloadRunning = downloadState.includes("downloading");
  const isDownloadStarting = downloadState.includes("starting");

  if (isLiveRunning && isDownloadRunning) return "转写中 / 下载中";
  if (isLiveStarting && isDownloadStarting) return "转写启动中 / 下载启动中";
  if (isLiveRunning) return "转写中";
  if (isLiveStarting) return "转写启动中";
  if (isDownloadRunning) return "下载中";
  if (isDownloadStarting) return "下载启动中";
  return "待执行";
}

function isLiveTranscribing(item: MonitorItem) {
  return String(item.metrics?.live_state ?? "").toLowerCase().includes("running");
}

function isLiveDownloading(item: MonitorItem) {
  return String(item.metrics?.download_state ?? "").toLowerCase().includes("downloading");
}

const navItems = [
  { key: "overview", label: "总览", icon: LayoutDashboard, href: "/dashboard?tab=overview" },
  { key: "douyin", label: "文案提取", icon: Eye, href: "/dashboard?tab=douyin" },
  { key: "live", label: "直播监测", icon: Radio, href: "/dashboard?tab=live" },
  { key: "task", label: "任务历史", icon: History, href: "/dashboard?tab=task" },
  { key: "settings", label: "系统设置", icon: Settings, href: "/dashboard?tab=task" },
] as const;

export function Dashboard({ userEmail }: DashboardProps) {
  const LIVE_PAGE_SIZE = 8;
  const DOUYIN_PAGE_SIZE = 6;
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const activeTab: "overview" | "task" | "douyin" | "live" =
    tab === "douyin" ? "douyin" : tab === "live" ? "live" : tab === "task" ? "task" : "overview";

  const [items, setItems] = useState<MonitorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [douyinUrl, setDouyinUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [douyinPage, setDouyinPage] = useState(1);
  const [livePage, setLivePage] = useState(1);
  const [liveModalOpen, setLiveModalOpen] = useState(false);
  const [liveStreamUrl, setLiveStreamUrl] = useState("");
  const [addingLiveSource, setAddingLiveSource] = useState(false);
  const [liveSourceError, setLiveSourceError] = useState<string | null>(null);
  const [openActionMenuItemId, setOpenActionMenuItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [selectedLiveItemId, setSelectedLiveItemId] = useState<string | null>(null);
  const [liveActionItemId, setLiveActionItemId] = useState<string | null>(null);
  const [liveActionType, setLiveActionType] = useState<"transcribe" | "download" | null>(null);
  const [editingLiveItemId, setEditingLiveItemId] = useState<string | null>(null);
  const [editingLiveTitle, setEditingLiveTitle] = useState("");
  const [renamingLiveItemId, setRenamingLiveItemId] = useState<string | null>(null);
  const [playingLiveItemId, setPlayingLiveItemId] = useState<string | null>(null);
  const [hoveredLiveItemId, setHoveredLiveItemId] = useState<string | null>(null);
  const [probingLiveItemId, setProbingLiveItemId] = useState<string | null>(null);
  const [scanningLiveSources, setScanningLiveSources] = useState(false);
  const livePreviewVideoRef = useRef<HTMLVideoElement | null>(null);

  const refreshItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await requestJson<{ items: MonitorItem[] }>("/api/monitor/items");
      setItems(payload.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadItems = async () => {
      try {
        const payload = await requestJson<{ items: MonitorItem[] }>("/api/monitor/items");
        if (cancelled) return;
        setItems(payload.items ?? []);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadItems();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-action-menu='true']")) return;
      setOpenActionMenuItemId(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const douyinItems = useMemo(() => items.filter((item) => item.platform === "douyin" || item.platform === "bilibili"), [items]);
  const liveItems = useMemo(
    () =>
      items
        .filter((item) => item.platform === "wechat_live")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [items],
  );
  const selectedLiveItem = useMemo(
    () => liveItems.find((item) => item.id === selectedLiveItemId) ?? null,
    [liveItems, selectedLiveItemId],
  );
  const playingLiveItem = useMemo(
    () => liveItems.find((item) => item.id === playingLiveItemId) ?? null,
    [liveItems, playingLiveItemId],
  );
  const douyinTotalPages = Math.max(1, Math.ceil(douyinItems.length / DOUYIN_PAGE_SIZE));
  const currentDouyinPage = Math.min(douyinPage, douyinTotalPages);
  const pagedDouyinItems = useMemo(() => {
    const start = (currentDouyinPage - 1) * DOUYIN_PAGE_SIZE;
    return douyinItems.slice(start, start + DOUYIN_PAGE_SIZE);
  }, [douyinItems, currentDouyinPage, DOUYIN_PAGE_SIZE]);
  const playingStreamUrl = playingLiveItem?.source_url?.trim() ?? "";
  const liveTotalPages = Math.max(1, Math.ceil(liveItems.length / LIVE_PAGE_SIZE));
  const currentLivePage = Math.min(livePage, liveTotalPages);
  const pagedLiveItems = useMemo(() => {
    const start = (currentLivePage - 1) * LIVE_PAGE_SIZE;
    return liveItems.slice(start, start + LIVE_PAGE_SIZE);
  }, [liveItems, currentLivePage, LIVE_PAGE_SIZE]);

  useEffect(() => {
    if (!playingLiveItemId) return;
    const playingItem = liveItems.find((item) => item.id === playingLiveItemId);
    if (!playingItem || !isLiveSourceAvailable(playingItem)) {
      setPlayingLiveItemId(null);
      setHoveredLiveItemId(null);
    }
  }, [liveItems, playingLiveItemId]);

  const selectedLiveItemIdForPoll = selectedLiveItem?.item_id ?? "";
  const selectedLiveStateForPoll = String(selectedLiveItem?.metrics?.live_state ?? "").toLowerCase();

  useEffect(() => {
    if (activeTab !== "live") return;
    if (!selectedLiveItemIdForPoll) return;
    const shouldPoll = selectedLiveStateForPoll.includes("running") || selectedLiveStateForPoll.includes("starting");
    if (!shouldPoll) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const payload = await requestJson<{ item: MonitorItem }>(
          `/api/wechat-live/transcriptions?itemId=${encodeURIComponent(selectedLiveItemIdForPoll)}`,
        );
        if (cancelled) return;
        setItems((prev) => prev.map((row) => (row.id === payload.item.id ? payload.item : row)));
      } catch {
        // keep silent; global error message is handled in action handlers
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeTab, selectedLiveItemIdForPoll, selectedLiveStateForPoll]);

  useEffect(() => {
    if (liveItems.length === 0) {
      setSelectedLiveItemId(null);
      return;
    }
    if (!selectedLiveItemId || !liveItems.some((item) => item.id === selectedLiveItemId)) {
      setSelectedLiveItemId(liveItems[0].id);
    }
  }, [liveItems, selectedLiveItemId]);

  useEffect(() => {
    const videoElement = livePreviewVideoRef.current;
    if (!videoElement) return;
    const playerElement = videoElement;

    const streamUrl = playingStreamUrl;
    if (!streamUrl) {
      playerElement.pause();
      playerElement.removeAttribute("src");
      playerElement.load();
      return;
    }

    let disposed = false;
    let flvPlayer: {
      attachMediaElement: (element: HTMLVideoElement) => void;
      load: () => void;
      play: () => Promise<void> | void;
      pause: () => void;
      unload: () => void;
      detachMediaElement: () => void;
      destroy: () => void;
      on?: (eventName: string, listener: (...args: unknown[]) => void) => void;
    } | null = null;

    async function setupPreview() {
      const isFlv = /\.flv(?:$|\?)/i.test(streamUrl);
      try {
        if (isFlv) {
          const flvjs = await import("flv.js");
          if (disposed) return;
          const flvModule = flvjs.default ?? flvjs;
          if (!flvModule.isSupported()) {
            throw new Error("当前浏览器不支持 FLV 直播预览");
          }
          playerElement.removeAttribute("src");
          playerElement.load();
          const player = flvModule.createPlayer(
            { type: "flv", url: streamUrl, isLive: true },
            { enableStashBuffer: false, stashInitialSize: 128 },
          );
          flvPlayer = player;
          const errorEventName =
            typeof flvModule.Events?.ERROR === "string" ? flvModule.Events.ERROR : "error";
          player.on?.(errorEventName, (_errorType, errorDetail, errorInfo) => {
            const detail =
              typeof errorDetail === "string" && errorDetail.trim()
                ? errorDetail
                : typeof errorInfo === "string" && errorInfo.trim()
                  ? errorInfo
                  : "直播流预览失败";
            setError(detail.includes("404") ? "直播流已失效或签名过期（404）。" : `直播流预览失败：${detail}`);
          });
          player.attachMediaElement(playerElement);
          player.load();
          const playResult = player.play();
          if (playResult instanceof Promise) {
            void playResult.catch(() => {
              setError("浏览器阻止了自动播放，请手动允许媒体播放。");
            });
          }
          return;
        }
        playerElement.src = streamUrl;
        void playerElement.play().catch(() => {
          setError("浏览器阻止了自动播放，请手动允许媒体播放。");
        });
      } catch (previewError) {
        setError(previewError instanceof Error ? previewError.message : "直播流预览失败");
        setPlayingLiveItemId(null);
      }
    }

    void setupPreview();

    return () => {
      disposed = true;
      if (flvPlayer) {
        flvPlayer.pause();
        flvPlayer.unload();
        flvPlayer.detachMediaElement();
        flvPlayer.destroy();
      } else {
        playerElement.pause();
        playerElement.removeAttribute("src");
        playerElement.load();
      }
    };
  }, [playingLiveItemId, playingStreamUrl]);

  const rows = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        taskId: `#TB-${item.item_id.slice(0, 8)}`,
        type: item.platform === "wechat_live" ? "下载" : "转写",
        status: getTaskStatus(item),
        startTime: item.updated_at,
        duration: formatDuration(calcDurationSeconds(item.created_at, item.updated_at)),
      })),
    [items],
  );

  const taskTodayCount = useMemo(() => {
    const now = new Date();
    return rows.filter((row) => {
      const d = new Date(row.startTime);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    }).length;
  }, [rows]);

  const taskFailedCount = useMemo(() => rows.filter((row) => row.status === "failed").length, [rows]);
  const taskTranscribeCount = useMemo(() => rows.filter((row) => row.type === "转写").length, [rows]);
  const taskRunningCount = useMemo(() => rows.filter((row) => row.status === "running").length, [rows]);
  const weeklyLiveMinutes = useMemo(() => {
    const now = new Date();
    const currentDay = now.getDay();
    const diffToMonday = currentDay === 0 ? 6 : currentDay - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const totalSeconds = liveItems.reduce((sum, item) => {
      const updated = new Date(item.updated_at);
      if (Number.isNaN(updated.getTime()) || updated < monday) return sum;
      return sum + calcDurationSeconds(item.created_at, item.updated_at);
    }, 0);

    return Math.round(totalSeconds / 60);
  }, [liveItems]);
  const successRate = useMemo(() => {
    if (!rows.length) return 100;
    const success = rows.filter((row) => row.status === "completed").length;
    return (success / rows.length) * 100;
  }, [rows]);

  const trendHeatmap = useMemo(() => {
    const days = 30;
    const now = new Date();
    const dayCounts = new Map<string, number>();
    for (const item of items) {
      const dt = new Date(item.updated_at);
      const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
      dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    }

    const values: number[] = [];
    const labels: string[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const day = new Date(now);
      day.setDate(now.getDate() - i);
      const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
      values.push(dayCounts.get(key) ?? 0);
      labels.push(`${day.getMonth() + 1}/${day.getDate()}`);
    }

    const max = Math.max(1, ...values);
    return { values, labels, max };
  }, [items]);

  const handleDouyinExtract = async () => {
    const url = douyinUrl.trim();
    if (!url) return;
    setExtracting(true);
    setError(null);
    let createdItemId = "";
    try {
      const infoPayload = await requestJson<{ success: boolean; item: MonitorItem; raw?: { video_id?: string; title?: string; share_url?: string; cover_url?: string } }>(
        "/api/douyin/info",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        },
      );
      createdItemId = infoPayload.item.id;
      setItems((prev) => {
        const idx = prev.findIndex((item) => item.id === infoPayload.item.id);
        if (idx === -1) return [infoPayload.item, ...prev];
        const next = [...prev];
        next[idx] = infoPayload.item;
        return next;
      });
      setDouyinUrl("");
      setDouyinPage(1);

      const extractPayload = await requestJson<{ success: boolean; item: MonitorItem; raw?: { text?: string } }>("/api/douyin/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          itemId: infoPayload.raw?.video_id || infoPayload.item.item_id,
          title: infoPayload.raw?.title || infoPayload.item.title,
          coverUrl: infoPayload.raw?.cover_url || infoPayload.item.cover_url,
          shareUrl: infoPayload.raw?.share_url || infoPayload.item.source_url,
        }),
      });
      setItems((prev) => {
        const idx = prev.findIndex((item) => item.id === extractPayload.item.id);
        if (idx === -1) return [extractPayload.item, ...prev];
        const next = [...prev];
        next[idx] = extractPayload.item;
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "提取失败";
      if (createdItemId) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === createdItemId
              ? {
                  ...item,
                  metrics: {
                    ...(item.metrics ?? {}),
                    extract_status: "failed",
                    extract_error: message,
                  },
                }
              : item,
          ),
        );
      }
      setError(message);
    } finally {
      setExtracting(false);
    }
  };

  const handleAddLiveSource = async () => {
    const streamUrl = liveStreamUrl.trim();
    if (!streamUrl) {
      setLiveSourceError("请输入直播源链接");
      return;
    }
    setAddingLiveSource(true);
    setLiveSourceError(null);
    try {
      const payload = await requestJson<{ source: unknown; item?: MonitorItem }>("/api/wechat-live/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamUrl }),
      });
      if (payload.item) {
        const newItem = payload.item;
        setItems((prev) => {
          const next = prev.filter((item) => item.id !== newItem.id);
          return [newItem, ...next];
        });
        setSelectedLiveItemId(newItem.id);
      }
      setLiveModalOpen(false);
      setLiveStreamUrl("");
      setLivePage(1);
    } catch (err) {
      setLiveSourceError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setAddingLiveSource(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    const item = items.find((row) => row.id === itemId);
    if (!item) return;
    if (!window.confirm(`确认删除卡片「${item.title || item.item_id}」吗？`)) return;

    setDeletingItemId(itemId);
    setError(null);
    try {
      await requestJson<{ success: boolean }>(`/api/monitor/items?id=${encodeURIComponent(itemId)}`, {
        method: "DELETE",
      });
      setItems((prev) => prev.filter((row) => row.id !== itemId));
      setOpenActionMenuItemId(null);
      if (selectedLiveItemId === itemId) {
        setSelectedLiveItemId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleDownloadMarkdown = (item: MonitorItem) => {
    const text = item.content_text?.trim();
    if (!text) {
      setError("当前卡片暂无可下载的文案内容");
      setOpenActionMenuItemId(null);
      return;
    }

    const safeTitle = (item.title || item.item_id || "video-transcript")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "-")
      .slice(0, 80);
    const fileName = `${safeTitle || "video-transcript"}.md`;
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);
    setOpenActionMenuItemId(null);
  };

  const handleStartLiveTranscription = async (item: MonitorItem) => {
    setLiveActionItemId(item.id);
    setLiveActionType("transcribe");
    setError(null);
    try {
      const payload = await requestJson<{ item: MonitorItem }>("/api/wechat-live/transcriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.item_id }),
      });
      setItems((prev) => prev.map((row) => (row.id === item.id ? payload.item : row)));
      setSelectedLiveItemId(item.id);
      setOpenActionMenuItemId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "启动转写失败");
    } finally {
      setLiveActionItemId(null);
      setLiveActionType(null);
    }
  };

  const handleStopLiveTranscription = async (item: MonitorItem) => {
    setLiveActionItemId(item.id);
    setLiveActionType("transcribe");
    setError(null);
    try {
      const payload = await requestJson<{ item: MonitorItem }>("/api/wechat-live/transcriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.item_id }),
      });
      setItems((prev) => prev.map((row) => (row.id === item.id ? payload.item : row)));
      setSelectedLiveItemId(item.id);
      setOpenActionMenuItemId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "停止转写失败");
    } finally {
      setLiveActionItemId(null);
      setLiveActionType(null);
    }
  };

  const handleStartLiveDownload = async (item: MonitorItem) => {
    setLiveActionItemId(item.id);
    setLiveActionType("download");
    setError(null);
    try {
      const payload = await requestJson<{ item: MonitorItem }>("/api/wechat-live/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.item_id }),
      });
      setItems((prev) => prev.map((row) => (row.id === item.id ? payload.item : row)));
      setSelectedLiveItemId(item.id);
      setOpenActionMenuItemId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "启动下载失败");
    } finally {
      setLiveActionItemId(null);
      setLiveActionType(null);
    }
  };

  const handleStopLiveDownload = async (item: MonitorItem) => {
    setLiveActionItemId(item.id);
    setLiveActionType("download");
    setError(null);
    try {
      const payload = await requestJson<{ item: MonitorItem }>("/api/wechat-live/downloads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.item_id }),
      });
      setItems((prev) => prev.map((row) => (row.id === item.id ? payload.item : row)));
      setSelectedLiveItemId(item.id);
      setOpenActionMenuItemId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "停止下载失败");
    } finally {
      setLiveActionItemId(null);
      setLiveActionType(null);
    }
  };

  const handleStartLiveRename = (item: MonitorItem) => {
    setEditingLiveItemId(item.id);
    setEditingLiveTitle(item.title || item.item_id);
    setOpenActionMenuItemId(null);
  };

  const handleCancelLiveRename = () => {
    setEditingLiveItemId(null);
    setEditingLiveTitle("");
    setRenamingLiveItemId(null);
  };

  const handleSubmitLiveRename = async (item: MonitorItem) => {
    const nextTitle = editingLiveTitle.trim();
    if (!nextTitle) {
      setError("名称不能为空");
      return;
    }
    setRenamingLiveItemId(item.id);
    setError(null);
    try {
      const payload = await requestJson<{ item: MonitorItem }>("/api/monitor/items/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "wechat_live",
          itemId: item.item_id,
          title: nextTitle,
        }),
      });
      setItems((prev) => prev.map((row) => (row.id === item.id ? payload.item : row)));
      setEditingLiveItemId(null);
      setEditingLiveTitle("");
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "改名失败");
    } finally {
      setRenamingLiveItemId(null);
    }
  };

  const handlePlayLive = async (item: MonitorItem) => {
    const streamUrl = item.source_url?.trim();
    if (!streamUrl) {
      setError("直播源地址为空，无法播放");
      return;
    }
    if (!isLiveSourceAvailable(item)) {
      setError("该直播源不可用，请先执行 AUTO-SCAN 或更换直播源");
      return;
    }
    setError(null);
    setProbingLiveItemId(item.id);
    try {
      await requestJson<{ success: boolean }>("/api/wechat-live/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamUrl }),
      });
      setPlayingLiveItemId(item.id);
    } catch (probeError) {
      setPlayingLiveItemId(null);
      setError(probeError instanceof Error ? probeError.message : "直播流当前不可用，无法预览");
    } finally {
      setProbingLiveItemId(null);
    }
  };

  const handleScanLiveSources = async () => {
    setScanningLiveSources(true);
    setError(null);
    try {
      const payload = await requestJson<{ success: boolean; invalidItemIds?: string[]; checkedCount?: number }>(
        "/api/wechat-live/sources/scan",
        {
          method: "POST",
        },
      );
      await refreshItems();
      const invalidCount = payload.invalidItemIds?.length ?? 0;
      if (invalidCount > 0) {
        setError(`AUTO-SCAN 完成：已标记 ${invalidCount} 个失效直播源（已从直播源操作中移除）`);
      }
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "AUTO-SCAN 失败");
    } finally {
      setScanningLiveSources(false);
    }
  };

  const renderLiveMonitor = () => {
    const transcriptSource = liveItems.find((item) => item.id === selectedLiveItemId) ?? liveItems[0];
    const transcriptLines = (transcriptSource?.content_text || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-120);

    return (
      <div className="mx-auto w-full max-w-[1120px]">
        <div className="mt-8 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="heading-font text-5xl font-semibold tracking-[-0.03em] text-white">直播实时转写</h1>
            <p className="mt-3 text-sm text-[#7e91af]">聚焦直播内容的实时文案转写，支持边播边看文本输出。</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setLiveSourceError(null);
                setLiveModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-[#25304a] bg-[#111a2c] px-3 py-2 text-sm text-[#d4def2] hover:bg-[#172238]"
            >
              添加直播源
            </button>
          </div>
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, index) => (
                <article key={`live-skeleton-${index}`} className="overflow-hidden rounded-xl border border-[#171f30] bg-[#0c121f]">
                  <div className="h-52 animate-pulse bg-[#101a2c]" />
                  <div className="space-y-2 p-3">
                    <div className="h-5 w-3/4 animate-pulse rounded bg-[#16243c]" />
                    <div className="h-4 w-5/6 animate-pulse rounded bg-[#121d31]" />
                    <div className="mt-2 flex items-center justify-between">
                      <div className="h-3 w-16 animate-pulse rounded bg-[#121d31]" />
                      <div className="h-3 w-16 animate-pulse rounded bg-[#121d31]" />
                    </div>
                  </div>
                </article>
              ))
            : pagedLiveItems.map((item) => {
                const isPlaying = playingLiveItemId === item.id;
                const showStop = isPlaying && hoveredLiveItemId === item.id;
                const isProbing = probingLiveItemId === item.id;
                const isSelected = selectedLiveItemId === item.id;
                const isEditingTitle = editingLiveItemId === item.id;
                const isRenaming = renamingLiveItemId === item.id;
                const isAvailable = isLiveSourceAvailable(item);
                return (
                  <article
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      const target = event.target;
                      if (target instanceof Element && target.closest("[data-action-menu='true']")) return;
                      setSelectedLiveItemId(item.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedLiveItemId(item.id);
                      }
                    }}
                    className={`overflow-hidden rounded-xl border bg-[#0c121f] transition-colors ${
                      isSelected ? "border-[#4e6fbd]" : "border-[#171f30]"
                    }`}
                  >
                    <div
                      className="group relative h-52 bg-[radial-gradient(circle_at_50%_40%,rgba(53,200,255,0.36),transparent_48%),linear-gradient(180deg,#07111f,#050a14)]"
                      onMouseEnter={() => setHoveredLiveItemId(item.id)}
                      onMouseLeave={() => setHoveredLiveItemId((prev) => (prev === item.id ? null : prev))}
                    >
                      {isPlaying ? (
                        <video
                          ref={livePreviewVideoRef}
                          controls
                          muted
                          playsInline
                          className="h-full w-full object-cover"
                          onError={() => {
                            setError("播放器加载失败，可能是链接已失效、跨域受限或浏览器不支持。");
                            setPlayingLiveItemId(null);
                          }}
                        />
                      ) : item.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.cover_url}
                        alt={item.title || item.item_id}
                        className="h-full w-full object-cover opacity-85"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = "/images/video-cover-placeholder.svg";
                        }}
                      />
                      ) : (
                        <div className="absolute inset-0" />
                      )}

                      {!isPlaying ? (
                        <div className="pointer-events-none absolute inset-0 z-[2] bg-black/15" />
                      ) : null}

                      {!isPlaying ? (
                        <button
                          type="button"
                          onClick={() => void handlePlayLive(item)}
                          disabled={isProbing || !isAvailable}
                          className="absolute inset-0 z-[3] grid place-items-center"
                          aria-label="播放直播源"
                        >
                          <span
                            className={`grid size-11 place-items-center rounded-full border shadow-[0_8px_24px_rgba(0,0,0,0.35)] ${
                              isAvailable
                                ? "border-[#2c3f65] bg-[#0d1a33cc] text-[#d8e6ff]"
                                : "border-[#3a2e38] bg-[#1d1820cc] text-[#9a8f98]"
                            }`}
                          >
                            {isProbing ? <Loader2 className="size-5 animate-spin" /> : <Play className="ml-0.5 size-5" />}
                          </span>
                        </button>
                      ) : null}
                      {!isAvailable ? (
                        <span className="absolute left-3 top-3 z-[4] rounded-full bg-[#3a1d25] px-2 py-0.5 text-[10px] text-[#ffb2bd]">
                          源已失效
                        </span>
                      ) : null}

                      {showStop ? (
                        <button
                          type="button"
                          onClick={() => setPlayingLiveItemId(null)}
                          className="absolute right-3 top-3 z-[4] grid size-9 place-items-center rounded-full border border-[#553545] bg-[#201521dd] text-[#ffd0da] shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
                          aria-label="停止播放"
                        >
                          <Square className="size-4" />
                        </button>
                      ) : null}
                    </div>
                    <div className="p-3">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        {isEditingTitle ? (
                          <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <input
                              value={editingLiveTitle}
                              onChange={(event) => setEditingLiveTitle(event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void handleSubmitLiveRename(item);
                                } else if (event.key === "Escape") {
                                  event.preventDefault();
                                  handleCancelLiveRename();
                                }
                              }}
                              className="w-full rounded border border-[#2e3d5a] bg-[#0a101b] px-2 py-1 text-sm text-[#dce5f7] outline-none focus:border-[#6686c8]"
                            />
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleSubmitLiveRename(item);
                              }}
                              disabled={isRenaming}
                              className="grid size-7 place-items-center rounded border border-[#2a3550] text-[#b8caec] hover:bg-[#1a2740] disabled:opacity-60"
                              aria-label="保存名称"
                            >
                              {isRenaming ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleCancelLiveRename();
                              }}
                              disabled={isRenaming}
                              className="grid size-7 place-items-center rounded border border-[#2a3550] text-[#b8caec] hover:bg-[#1a2740] disabled:opacity-60"
                              aria-label="取消编辑"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-lg font-semibold text-[#dce5f7]">{item.title || item.item_id}</p>
                          </div>
                        )}
                        <div className="flex shrink-0 items-center gap-1.5" data-action-menu="true">
                          {!isEditingTitle ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleStartLiveRename(item);
                              }}
                              className="grid size-7 place-items-center rounded border border-transparent text-[#7890b6] hover:border-[#2a3550] hover:bg-[#111a2c] hover:text-[#c8d8f7]"
                              aria-label="编辑直播源名称"
                              data-action-menu="true"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                          ) : null}
                          <div className="relative" data-action-menu="true">
                          <button
                            type="button"
                            onClick={() => setOpenActionMenuItemId((prev) => (prev === item.id ? null : item.id))}
                            className="grid size-7 place-items-center rounded border border-transparent text-[#7589ac] hover:border-[#2a3550] hover:bg-[#111a2c] hover:text-white"
                            data-action-menu="true"
                          >
                            <MoreVertical className="size-4" />
                          </button>
                          {openActionMenuItemId === item.id ? (
                            <div
                              className="absolute bottom-6 right-0 z-30 w-36 rounded-md border border-[#2a3550] bg-[#101a2c] p-1 shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
                              data-action-menu="true"
                            >
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id)}
                                disabled={deletingItemId === item.id || liveActionItemId === item.id}
                                className="w-full rounded px-2 py-1.5 text-left text-xs text-[#ffb1b8] hover:bg-[#2a1720] disabled:opacity-60"
                                data-action-menu="true"
                              >
                                {deletingItemId === item.id ? "删除中..." : "删除卡片"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                        </div>
                      </div>
                      <p className="text-xs text-[#7f92b1]">{truncateText(item.source_url || "RTMP://STREAM.MEDIA/CH102", 36)}</p>
                    </div>
                  </article>
                );
              })}
          {!loading && liveItems.length === 0 ? (
            <article className="rounded-xl border border-dashed border-[#22304b] bg-[#0c121f] p-6 md:col-span-4">
              <p className="text-sm text-[#8fa3c6]">暂无直播源，点击右上角「添加直播源」后将从最新一条开始显示。</p>
            </article>
          ) : null}
        </section>

        {!loading && liveItems.length > LIVE_PAGE_SIZE ? (
          <div className="mt-3 flex items-center justify-end gap-2 text-xs text-[#93a8cb]">
            <button
              type="button"
              onClick={() => setLivePage((prev) => Math.max(1, Math.min(prev, liveTotalPages) - 1))}
              disabled={currentLivePage === 1}
              className="rounded border border-[#2a3550] px-2 py-1 disabled:opacity-40"
            >
              上一页
            </button>
            <span>
              {currentLivePage} / {liveTotalPages}
            </span>
            <button
              type="button"
              onClick={() => setLivePage((prev) => Math.min(liveTotalPages, Math.min(prev, liveTotalPages) + 1))}
              disabled={currentLivePage === liveTotalPages}
              className="rounded border border-[#2a3550] px-2 py-1 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        ) : null}

        <section className="mt-5 grid gap-4 md:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
          <article className="min-w-0 rounded-xl border border-[#171f30] bg-[#0c121f] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">直播源操作</h2>
              <button
                type="button"
                onClick={() => void handleScanLiveSources()}
                disabled={scanningLiveSources}
                className="rounded bg-[#202c44] px-2 py-0.5 text-[10px] text-[#bed0f9] hover:bg-[#263453] disabled:opacity-60"
              >
                {scanningLiveSources ? "扫描中..." : "自动探测"}
              </button>
            </div>
            <div className="space-y-2.5">
              {loading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <div key={`source-skeleton-${index}`} className="rounded-lg border border-[#1c2740] bg-[#0a101b] px-3 py-2.5">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-[#16243c]" />
                      <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-[#121d31]" />
                    </div>
                  ))
                : pagedLiveItems.filter((item) => isLiveSourceAvailable(item)).map((item) => {
                    const isSelected = selectedLiveItemId === item.id;
                    const transcribing = isLiveTranscribing(item);
                    const downloading = isLiveDownloading(item);
                    return (
                      <div
                        key={item.id}
                        className={`rounded-lg border px-3 py-2.5 ${isSelected ? "border-[#4e6fbd] bg-[#101a2f]" : "border-[#1c2740] bg-[#0a101b]"}`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[#dce5f7]">{item.title || item.item_id}</p>
                          <p className="mt-0.5 text-[11px] text-[#8ea3c8]">{getLiveStatusText(item)}</p>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void (transcribing ? handleStopLiveTranscription(item) : handleStartLiveTranscription(item))
                            }
                            disabled={liveActionItemId === item.id}
                            className="rounded border border-[#2a3550] px-2 py-1 text-xs text-[#c6d7fa] hover:bg-[#1a2740] disabled:opacity-60"
                          >
                            {liveActionItemId === item.id && liveActionType === "transcribe"
                              ? transcribing
                                ? "停止中..."
                                : "启动中..."
                              : transcribing
                                ? "停止转写"
                                : "开始转写"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void (downloading ? handleStopLiveDownload(item) : handleStartLiveDownload(item))
                            }
                            disabled={liveActionItemId === item.id}
                            className="rounded border border-[#2a3550] px-2 py-1 text-xs text-[#c6d7fa] hover:bg-[#1a2740] disabled:opacity-60"
                          >
                            {liveActionItemId === item.id && liveActionType === "download"
                              ? downloading
                                ? "停止中..."
                                : "启动中..."
                              : downloading
                                ? "停止下载"
                                : "开始下载"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              {!loading && pagedLiveItems.filter((item) => isLiveSourceAvailable(item)).length === 0 ? (
                <p className="rounded-lg border border-[#1c2740] bg-[#0a101b] px-3 py-4 text-sm text-[#7f92b1]">
                  暂无可操作直播源
                </p>
              ) : null}
            </div>
          </article>

          <article className="min-w-0 rounded-xl border border-[#171f30] bg-[#0c121f] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">实时转写流 (文案预览)</h2>
              <button type="button" className="text-xs text-[#9eb5ea] hover:text-[#c5d5ff]">
                导出记录
              </button>
            </div>
            <div className="min-w-0 h-[360px] space-y-2 overflow-y-auto overflow-x-hidden rounded-lg border border-[#1c2740] bg-[#0a101b] p-3">
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={`transcript-skeleton-${index}`} className="h-6 animate-pulse rounded bg-[#14213a]" />
                ))
              ) : transcriptLines.length ? (
                transcriptLines.map((line, index) => (
                  <p key={`${line.slice(0, 12)}-${index}`} className={`break-all rounded px-2 py-1.5 text-sm leading-6 ${index === 3 ? "bg-[#1a2440] text-[#d6e2ff]" : "text-[#c3d2ef]"}`}>
                    {line}
                  </p>
                ))
              ) : (
                <p className="rounded px-2 py-1.5 text-sm leading-6 text-[#7f92b1]">暂无实时转录内容</p>
              )}
            </div>
          </article>
        </section>
      </div>
    );
  };

  const renderTaskHistory = () => (
    <>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#6880a4]">Luma Media · Task Logs</p>
          <h1 className="heading-font mt-2 text-5xl font-semibold tracking-[-0.03em] text-white">任务运行记录</h1>
          <p className="mt-3 text-sm text-[#7e91af]">查看并管理流光智媒的所有后台自动化任务，包括转写、下载及分发等环节的执行详情。</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-[#25304a] bg-[#111a2c] px-3 py-2 text-sm text-[#d4def2] hover:bg-[#172238]">
            <SlidersHorizontal className="size-4" />
            筛选
          </button>
          <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-[#25304a] bg-[#111a2c] px-3 py-2 text-sm text-[#d4def2] hover:bg-[#172238]">
            <CloudDownload className="size-4" />
            导出 CSV
          </button>
        </div>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-4">
        <article className="rounded-xl border border-[#171f30] bg-[#0c121f] p-4">
          <p className="text-xs text-[#7084a6]">今日执行</p>
          <p className="heading-font mt-2 text-4xl font-semibold text-white">{taskTodayCount.toLocaleString("zh-CN")}</p>
        </article>
        <article className="rounded-xl border border-[#171f30] bg-[#0c121f] p-4">
          <p className="text-xs text-[#7084a6]">转写总计</p>
          <p className="heading-font mt-2 text-4xl font-semibold text-white">{taskTranscribeCount.toLocaleString("zh-CN")}</p>
        </article>
        <article className="rounded-xl border border-[#171f30] bg-[#0c121f] p-4">
          <p className="text-xs text-[#7084a6]">任务总数</p>
          <p className="heading-font mt-2 text-4xl font-semibold text-white">{rows.length.toLocaleString("zh-CN")}</p>
        </article>
        <article className="rounded-xl border border-[#171f30] bg-[#0c121f] p-4">
          <p className="text-xs text-[#7084a6]">异常监控</p>
          <p className="heading-font mt-2 text-4xl font-semibold text-[#ff7f88]">{taskFailedCount}</p>
        </article>
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-[#171f30] bg-[#0c121f]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead className="border-b border-[#171f30] bg-[#0f1625] text-xs text-[#7d90b0]">
              <tr>
                <th className="px-4 py-3 font-medium">任务 ID</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">开始时间</th>
                <th className="px-4 py-3 font-medium">耗时</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-[#8193b0]" colSpan={6}>
                    加载中...
                  </td>
                </tr>
              ) : null}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-[#8193b0]" colSpan={6}>
                    暂无任务记录
                  </td>
                </tr>
              ) : null}
              {!loading
                ? rows.slice(0, 8).map((row) => (
                    <tr key={row.id} className="border-b border-[#141c2b] text-sm text-[#d7e1f5 last:border-b-0]">
                      <td className="px-4 py-3 font-medium text-[#cad6ef]">{row.taskId}</td>
                      <td className="px-4 py-3">{row.type}</td>
                      <td className="px-4 py-3">{row.status === "completed" ? "完成" : row.status === "failed" ? "失败" : "进行中"}</td>
                      <td className="px-4 py-3 text-[#a4b4cf]">{formatDate(row.startTime)}</td>
                      <td className="px-4 py-3 text-[#a4b4cf]">{row.duration}</td>
                      <td className="px-4 py-3 text-[#b4c6ee]">{row.status === "failed" ? "查看错误" : "查看日志"}</td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );

  const renderOverview = () => (
    <>
      <div className="mt-8">
        <h1 className="heading-font text-5xl font-semibold tracking-[-0.03em] text-white">工作台总览</h1>
        <p className="mt-3 text-sm text-[#7e91af]">欢迎回来，系统监测运行平稳，所有节点均已就绪。</p>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-[#171f30] bg-[#0c121f] p-4">
          <p className="text-xs text-[#7084a6]">今日提取数据</p>
          <p className="heading-font mt-2 text-4xl font-semibold text-white">{taskTodayCount.toLocaleString("zh-CN")}</p>
          <p className="mt-2 text-xs text-[#8ea0bf]">执行成功率 {successRate.toFixed(1)}%</p>
        </article>
        <article className="rounded-xl border border-[#171f30] bg-[#0c121f] p-4">
          <p className="text-xs text-[#7084a6]">运行中任务</p>
          <p className="heading-font mt-2 text-4xl font-semibold text-white">{taskRunningCount.toLocaleString("zh-CN")}</p>
          <p className="mt-2 text-xs text-[#8ea0bf]">待处理 {Math.max(0, rows.length - taskRunningCount)} 项</p>
        </article>
        <article className="rounded-xl border border-[#171f30] bg-[#0c121f] p-4">
          <p className="text-xs text-[#7084a6]">本周活跃时长</p>
          <p className="heading-font mt-2 text-4xl font-semibold text-[#b9ccff]">{weeklyLiveMinutes.toLocaleString("zh-CN")}</p>
          <p className="mt-2 text-xs text-[#8ea0bf]">
            累计直播转写分钟数
          </p>
        </article>
      </section>

      <section className="mt-5">
        <article className="rounded-xl border border-[#171f30] bg-[#0c121f] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">任务执行趋势</h2>
            <span className="text-xs text-[#88a1cf]">最近一个月</span>
          </div>
          <div className="rounded-lg border border-[#1a2233] bg-[#0a101b] p-3">
            <div className="grid grid-flow-col grid-rows-7 auto-cols-fr gap-1.5">
              {trendHeatmap.values.map((value, index) => {
                const intensity = value / trendHeatmap.max;
                let color = "bg-[#121a28]";
                if (intensity > 0.75) color = "bg-[#7fa0ff]";
                else if (intensity > 0.5) color = "bg-[#5f84ea]";
                else if (intensity > 0.25) color = "bg-[#3f62bf]";
                else if (intensity > 0) color = "bg-[#263f82]";

                return (
                  <div
                    key={`${trendHeatmap.labels[index]}-${index}`}
                    className={`h-4 w-full rounded-sm ${color}`}
                    title={`${trendHeatmap.labels[index]}: ${value}`}
                  />
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-[10px] text-[#6f86ab]">
              <span>{trendHeatmap.labels[0]}</span>
              <span>{trendHeatmap.labels[Math.floor(trendHeatmap.labels.length / 2)]}</span>
              <span>{trendHeatmap.labels[trendHeatmap.labels.length - 1]}</span>
            </div>
          </div>
        </article>
      </section>

      <section className="mt-5 rounded-xl border border-[#171f30] bg-[#0c121f] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">最近提取记录</h2>
          <Link href="/dashboard?tab=task" className="text-xs text-[#9eb5ea] hover:text-[#c5d5ff]">
            查看全部
          </Link>
        </div>
        <div className="space-y-3">
          {loading ? <p className="rounded-lg border border-[#1a2233] bg-[#0a101b] px-3 py-4 text-sm text-[#8193b0]">加载中...</p> : null}
          {!loading && items.length === 0 ? <p className="rounded-lg border border-[#1a2233] bg-[#0a101b] px-3 py-4 text-sm text-[#8193b0]">暂无提取记录</p> : null}
          {!loading
            ? items.slice(0, 4).map((item) => (
                <article key={item.id} className="flex items-center gap-3 rounded-lg border border-[#1a2233] bg-[#0a101b] p-3">
                  <div className="h-16 w-28 shrink-0 overflow-hidden rounded bg-[#0e1627]">
                    {item.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.cover_url}
                        alt={item.title || item.item_id}
                        className="h-full w-full object-cover"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = "/images/video-cover-placeholder.svg";
                        }}
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-xs text-[#6d84ab]">preview</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#dbe6fa]">{truncateText(item.title || item.item_id)}</p>
                    <p className="mt-1 text-xs text-[#7a90b4]">{formatDate(item.updated_at)}</p>
                  </div>
                  <span className="rounded-full bg-[#12311f] px-2 py-1 text-[10px] text-[#70f0a6]">
                    {item.platform === "douyin" ? "DOUYIN" : item.platform === "bilibili" ? "BILIBILI" : "LIVE"}
                  </span>
                </article>
              ))
            : null}
        </div>
      </section>
    </>
  );

  const renderDouyinMonitor = () => (
    <>
      <div className="mt-8">
        <h1 className="heading-font text-5xl font-semibold tracking-[-0.03em] text-white">视频文案提取</h1>
        <p className="mt-3 text-sm text-[#7e91af]">支持粘贴抖音、哔哩哔哩分享链接，统一提取视频文案并追踪任务状态。</p>
      </div>

      <section className="mt-6 rounded-xl border border-[#171f30] bg-[#0c121f] p-4">
        <p className="text-xs text-[#8aa0c4]">粘贴视频分享链接（抖音 / 哔哩哔哩）</p>
        <div className="mt-2 flex flex-col gap-3 md:flex-row">
          <input
            value={douyinUrl}
            onChange={(event) => setDouyinUrl(event.target.value)}
            placeholder="例如：https://v.douyin.com/... 或 https://www.bilibili.com/video/..."
            className="w-full rounded-md border border-[#28344d] bg-[#060d18] px-3 py-2.5 text-sm text-[#dbe6f8] outline-none placeholder:text-[#5f7598] focus:border-[#6a87c7]"
          />
          <button
            type="button"
            onClick={handleDouyinExtract}
            disabled={extracting}
            className="whitespace-nowrap rounded-md bg-[#9fb0ff] px-4 py-2.5 text-sm font-semibold text-[#102240] hover:bg-[#b1c0ff] disabled:opacity-50"
          >
            {extracting ? "提取中..." : "开始提取文案"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {["抖音分享链接", "哔哩哔哩视频链接"].map((label) => (
            <span key={label} className="rounded-full border border-[#2a3650] bg-[#101a2c] px-2.5 py-1 text-[#9eb5da]">
              {label}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">最近提取</h2>
        </div>
        <div className="space-y-3">
          {loading ? <p className="rounded-xl border border-[#171f30] bg-[#0c121f] px-4 py-6 text-sm text-[#8193b0]">加载中...</p> : null}
          {!loading && douyinItems.length === 0 ? (
            <p className="rounded-xl border border-[#171f30] bg-[#0c121f] px-4 py-6 text-sm text-[#8193b0]">暂无视频提取记录</p>
          ) : null}

          {!loading
            ? pagedDouyinItems.map((item) => {
                const extractStatus = String(item.metrics?.extract_status ?? "").toLowerCase();
                const isExtracting = extractStatus === "extracting";
                const isFailed = extractStatus === "failed";
                const statusText = isExtracting ? "提取中" : isFailed ? "失败" : "已完成";
                const statusClass = isExtracting
                  ? "bg-[#1a2537] text-[#adc0e6]"
                  : isFailed
                    ? "bg-[#3b1b24] text-[#ff9ca6]"
                    : "bg-[#1a2537] text-[#adc0e6]";
                return (
                <article key={item.id} className="flex items-center gap-4 rounded-xl border border-[#171f30] bg-[#0c121f] p-3">
                  <div className="relative flex h-20 w-36 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#0a1120]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.cover_url || "/images/video-cover-placeholder.svg"}
                      alt={item.title || item.item_id}
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = "/images/video-cover-placeholder.svg";
                      }}
                    />
                    {isExtracting ? (
                      <>
                        <div className="absolute inset-0 bg-black/35" />
                        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
                          <Loader2 className="size-6 animate-spin text-[#b7c8ef]" />
                        </div>
                      </>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-[#7d90b2]">
                      <span className={`rounded px-1.5 py-0.5 ${statusClass}`}>{statusText}</span>
                      <span>{formatDate(item.updated_at)}</span>
                    </div>
                    <p className="truncate text-sm font-medium text-[#dbe6fa]">{truncateText(item.title || item.item_id, 36)}</p>
                    {isFailed && item.metrics?.extract_error ? (
                      <p className="mt-1 truncate text-xs text-[#ff9ca6]">{String(item.metrics.extract_error)}</p>
                    ) : null}
                  </div>
                  <Link href={`/dashboard/items/${item.id}`} className="inline-flex items-center gap-1 rounded-md border border-[#2c3852] bg-[#131d31] px-2.5 py-1.5 text-xs text-[#cedbfd]">
                    查看详情
                    <ChevronRight className="size-3.5" />
                  </Link>
                  <div className="relative" data-action-menu="true">
                    <button
                      type="button"
                      onClick={() => setOpenActionMenuItemId((prev) => (prev === item.id ? null : item.id))}
                      className="text-[#778bad] hover:text-white"
                      data-action-menu="true"
                    >
                      <MoreVertical className="size-4" />
                    </button>
                    {openActionMenuItemId === item.id ? (
                      <div
                        className="absolute right-0 top-6 z-20 w-40 rounded-md border border-[#2a3550] bg-[#101a2c] p-1 shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
                        data-action-menu="true"
                      >
                        <button
                          type="button"
                          onClick={() => handleDownloadMarkdown(item)}
                          className="w-full rounded px-2 py-1.5 text-left text-xs text-[#d2def7] hover:bg-[#18243c]"
                          data-action-menu="true"
                        >
                          下载 Markdown
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          disabled={deletingItemId === item.id}
                          className="w-full rounded px-2 py-1.5 text-left text-xs text-[#ffb1b8] hover:bg-[#2a1720] disabled:opacity-60"
                          data-action-menu="true"
                        >
                          {deletingItemId === item.id ? "删除中..." : "删除卡片"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
                );
              })
            : null}
        </div>
        {!loading && douyinItems.length > DOUYIN_PAGE_SIZE ? (
          <div className="mt-3 flex items-center justify-end gap-2 text-xs text-[#93a8cb]">
            <button
              type="button"
              onClick={() => setDouyinPage((prev) => Math.max(1, Math.min(prev, douyinTotalPages) - 1))}
              className="rounded border border-[#2a3550] px-2 py-1 hover:bg-[#152035] disabled:opacity-50"
              disabled={currentDouyinPage <= 1}
            >
              上一页
            </button>
            <span>
              {currentDouyinPage} / {douyinTotalPages}
            </span>
            <button
              type="button"
              onClick={() => setDouyinPage((prev) => Math.min(douyinTotalPages, Math.min(prev, douyinTotalPages) + 1))}
              className="rounded border border-[#2a3550] px-2 py-1 hover:bg-[#152035] disabled:opacity-50"
              disabled={currentDouyinPage >= douyinTotalPages}
            >
              下一页
            </button>
          </div>
        ) : null}
      </section>
    </>
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#04070f] text-[#dce5f7]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1400px] grid-cols-1 md:grid-cols-[260px_1fr]">
        <aside className="border-r border-[#151a29] bg-[#050912] px-4 py-5">
          <Link href="/" className="block">
            <p className="heading-font text-2xl font-semibold tracking-[-0.02em] text-white">流光智媒</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[#697c9a]">Luma Media</p>
          </Link>

          <nav className="mt-8 space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                (item.key === "overview" && activeTab === "overview") ||
                (item.key === "douyin" && activeTab === "douyin") ||
                (item.key === "live" && activeTab === "live") ||
                (item.key === "task" && activeTab === "task");
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active ? "border border-[#2f3650] bg-[linear-gradient(90deg,#1c2236,#101627)] text-white" : "text-[#8ea0bf] hover:bg-[#0f1524] hover:text-white"
                  }`}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 rounded-xl border border-[#1a2233] bg-[#0b111d] p-3">
            <p className="text-sm font-semibold text-white">Admin User</p>
            <p className="mt-0.5 truncate text-xs text-[#7185a6]">{userEmail}</p>
            <p className="mt-2 inline-flex rounded-full bg-[#1e2536] px-2 py-0.5 text-[10px] text-[#a9b8d3]">Premium Account</p>
          </div>
        </aside>

        <section className="bg-[#060b15] px-6 py-5 md:px-8">
          <header className="flex items-center justify-end">
            <div className="flex items-center gap-3 text-[#8ea0bf]">
              <button type="button" className="grid size-8 place-items-center rounded-full border border-[#1e2a3d] bg-[#0b111e] hover:text-white">
                <Bell className="size-4" />
              </button>
            </div>
          </header>

          {activeTab === "douyin"
            ? renderDouyinMonitor()
            : activeTab === "live"
              ? renderLiveMonitor()
              : activeTab === "overview"
                ? renderOverview()
                : renderTaskHistory()}

          {error ? (
            <p className="mt-4 rounded-lg border border-[#4f2831] bg-[#25151a] px-3 py-2 text-sm text-[#ff9ca6]" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      </div>

      {liveModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-xl border border-[#202c43] bg-[#0c121f] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">添加直播源</h3>
              <button
                type="button"
                onClick={() => setLiveModalOpen(false)}
                className="grid size-8 place-items-center rounded-md border border-[#2a3550] text-[#9eb5da] hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <label className="mb-2 block text-xs text-[#8ea3c8]">直播流地址（RTMP/HLS）</label>
            <input
              value={liveStreamUrl}
              onChange={(event) => setLiveStreamUrl(event.target.value)}
              placeholder="例如：https://...m3u8 或 rtmp://..."
              className="w-full rounded-md border border-[#28344d] bg-[#060d18] px-3 py-2.5 text-sm text-[#dbe6f8] outline-none placeholder:text-[#5f7598] focus:border-[#6a87c7]"
            />

            {liveSourceError ? <p className="mt-3 text-xs text-[#ff9ca6]">{liveSourceError}</p> : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setLiveModalOpen(false)}
                className="rounded-md border border-[#2a3550] px-3 py-2 text-sm text-[#a9bde0] hover:bg-[#111a2c]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleAddLiveSource}
                disabled={addingLiveSource}
                className="rounded-md bg-[#9fb0ff] px-3 py-2 text-sm font-semibold text-[#102240] hover:bg-[#b1c0ff] disabled:opacity-50"
              >
                {addingLiveSource ? "提交中..." : "确认添加"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
