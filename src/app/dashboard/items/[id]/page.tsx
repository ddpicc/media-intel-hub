import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDbAdminClient, getDbServerClient } from "@/lib/db/server";
import { CopyTextButton } from "@/components/copy-text-button";
import { FallbackImage } from "@/components/fallback-image";

type DetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function MonitorItemDetailPage({ params }: DetailPageProps) {
  const { id } = await params;
  const dbSession = await getDbServerClient();
  const {
    data: { user },
  } = await dbSession.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const admin = getDbAdminClient();
  const { data: item, error } = await admin
    .from("monitor_items")
    .select("id,platform,item_id,title,content_text,source_url,cover_url,published_at,metrics,fetch_stage,created_at,updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !item) {
    notFound();
  }

  const metrics = (item.metrics ?? {}) as Record<string, unknown>;
  const diggCount = Number(metrics.digg_count ?? 0) || 0;
  const collectCount = Number(metrics.collect_count ?? 0) || 0;
  const commentCount = Number(metrics.comment_count ?? 0) || 0;
  const shareCount = Number(metrics.share_count ?? 0) || 0;
  const sourceUrl = (item.source_url || "").trim();
  const videoIdRaw = String(metrics.video_id ?? item.item_id ?? "").trim();
  const videoId = videoIdRaw.includes(":") ? videoIdRaw.split(":").pop() ?? "" : videoIdRaw;
  const fallbackUrl =
    item.platform === "douyin"
      ? videoId
        ? `https://www.douyin.com/video/${videoId}`
        : ""
      : item.platform === "bilibili"
        ? videoId
          ? `https://www.bilibili.com/video/${videoId}`
          : ""
        : "";
  const clickableUrl = sourceUrl || fallbackUrl;
  const contentText = item.content_text?.trim() || "";

  const formatNumber = (value: number) => value.toLocaleString("zh-CN");

  return (
    <main className="min-h-screen bg-[#04070f] px-6 py-8 text-[#dce5f7] md:px-10">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs text-[#8ea3c8]">文案提取详情</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{item.title || item.item_id}</h1>
          </div>
          <Link href="/dashboard?tab=douyin" className="rounded-md border border-[#2a3550] px-3 py-2 text-sm text-[#bcd0f1] hover:bg-[#111a2c]">
            返回列表
          </Link>
        </div>

        <section className="grid gap-4 md:grid-cols-[360px_1fr]">
          <article className="rounded-xl border border-[#171f30] bg-[#0c121f] p-4">
            <div className="overflow-hidden rounded-lg bg-[#0a101b]">
              <FallbackImage
                src={item.cover_url}
                fallbackSrc="/images/video-cover-placeholder.svg"
                alt={item.title || item.item_id}
                className="h-56 w-full object-cover"
              />
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="text-[#8ea3c8]">平台</dt>
                <dd className="text-white">{item.platform}</dd>
              </div>
              <div>
                <dt className="text-[#8ea3c8]">视频链接</dt>
                <dd className="break-all text-[#c3d2ef]">
                  {clickableUrl ? (
                    <a
                      href={clickableUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#a8c2ff] underline decoration-[#3c5ea8] underline-offset-2 hover:text-[#c9dcff]"
                    >
                      {clickableUrl}
                    </a>
                  ) : (
                    "-"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[#8ea3c8]">更新时间</dt>
                <dd className="text-[#c3d2ef]">{new Date(item.updated_at).toLocaleString("zh-CN", { hour12: false })}</dd>
              </div>
            </dl>

            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border border-[#1c2740] bg-[#0a101b] p-3">
                <p className="text-xs text-[#8ea3c8]">点赞</p>
                <p className="mt-1 text-lg font-semibold text-white">{formatNumber(diggCount)}</p>
              </div>
              <div className="rounded-lg border border-[#1c2740] bg-[#0a101b] p-3">
                <p className="text-xs text-[#8ea3c8]">收藏</p>
                <p className="mt-1 text-lg font-semibold text-white">{formatNumber(collectCount)}</p>
              </div>
              <div className="rounded-lg border border-[#1c2740] bg-[#0a101b] p-3">
                <p className="text-xs text-[#8ea3c8]">评论</p>
                <p className="mt-1 text-lg font-semibold text-white">{formatNumber(commentCount)}</p>
              </div>
              <div className="rounded-lg border border-[#1c2740] bg-[#0a101b] p-3">
                <p className="text-xs text-[#8ea3c8]">转发</p>
                <p className="mt-1 text-lg font-semibold text-white">{formatNumber(shareCount)}</p>
              </div>
            </div>
          </article>

          <article className="rounded-xl border border-[#171f30] bg-[#0c121f] p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">提取文案</h2>
              <CopyTextButton text={contentText} />
            </div>
            <div className="mt-3 rounded-lg border border-[#1c2740] bg-[#0a101b] p-4">
              <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-[#dbe6fa]">
                {contentText || "暂无文案内容"}
              </pre>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
