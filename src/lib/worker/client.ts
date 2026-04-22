const MEDIA_WORKER_BASE_URL = (process.env.MEDIA_WORKER_BASE_URL ?? "").trim().replace(/\/$/, "");
const MEDIA_WORKER_TOKEN = (process.env.MEDIA_WORKER_TOKEN ?? "").trim();

export function ensureWorkerEnv() {
  if (!MEDIA_WORKER_BASE_URL) {
    throw new Error("MEDIA_WORKER_BASE_URL 未配置");
  }
  if (!MEDIA_WORKER_TOKEN) {
    throw new Error("MEDIA_WORKER_TOKEN 未配置");
  }
  return {
    baseUrl: MEDIA_WORKER_BASE_URL,
    token: MEDIA_WORKER_TOKEN,
  };
}

export async function mediaWorkerRequest<T>(path: string, init?: RequestInit) {
  const { baseUrl, token } = ensureWorkerEnv();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Worker-Token": token,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as T & { detail?: string };
  if (!response.ok) {
    throw new Error(payload.detail || `media-worker 请求失败: ${response.status}`);
  }
  return payload;
}
