import { spawn } from "node:child_process";

const STREAM_PROBE_DURATION_SECONDS = 2;
const STREAM_PROBE_TIMEOUT_MS = 8000;

type ProbeErrorMessages = {
  invalidData: string;
  unavailable: string;
};

const DEFAULT_MESSAGES: ProbeErrorMessages = {
  invalidData: "直播流数据格式异常，当前无法访问。",
  unavailable: "直播流当前不可用。",
};

function classifyStreamProbeError(stderrText: string, messages: ProbeErrorMessages) {
  const stderrLower = stderrText.toLowerCase();
  if (stderrLower.includes("404 not found")) {
    return "直播流已失效或签名过期，源站返回 404。";
  }
  if (stderrLower.includes("403 forbidden")) {
    return "直播流被拒绝访问，源站返回 403。";
  }
  if (stderrLower.includes("no such file or directory")) {
    return "服务端未找到 ffmpeg，可先检查 FFMPEG_PATH 配置。";
  }
  if (stderrLower.includes("input/output error") || stderrLower.includes("error reading http response")) {
    return "直播流暂时不可读，可能是网络中断或源站异常。";
  }
  if (stderrLower.includes("invalid data found")) {
    return messages.invalidData;
  }
  return messages.unavailable;
}

export async function probeLiveStreamAvailability(
  streamUrl: string,
  ffmpegPath: string,
  messages: Partial<ProbeErrorMessages> = {},
) {
  const mergedMessages: ProbeErrorMessages = {
    ...DEFAULT_MESSAGES,
    ...messages,
  };
  return await new Promise<{ ok: true } | { ok: false; error: string }>((resolve) => {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-t",
      String(STREAM_PROBE_DURATION_SECONDS),
      "-i",
      streamUrl,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "null",
      "-",
    ];
    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderrText = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ ok: false, error: "直播流探测超时，请稍后重试或检查链接是否还有效。" });
    }, STREAM_PROBE_TIMEOUT_MS);

    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderrText += chunk.toString();
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: error.message || "直播流探测失败。" });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      resolve({ ok: false, error: classifyStreamProbeError(stderrText, mergedMessages) });
    });
  });
}
