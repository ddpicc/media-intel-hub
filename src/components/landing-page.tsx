import Link from "next/link";
import { Bell, Bot, FileText, Plus, Search, Zap } from "lucide-react";

type LandingPageProps = {
  userEmail?: string | null;
};

export function LandingPage({ userEmail }: LandingPageProps) {
  const loggedIn = Boolean(userEmail);

  return (
    <main className="min-h-screen bg-[#020711] text-[#e7edf8]">
      <div className="mx-auto w-full max-w-[1280px] px-4 pb-8 pt-4 md:px-8 md:pb-12">
        <header className="rounded-t-2xl border-b border-[#1a2433] bg-[#060d1a]/95 px-5 py-3 md:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-7">
              <Link href="/" className="heading-font text-[17px] font-semibold text-white">
                流光智媒
                <span className="ml-2 text-[10px] uppercase text-[#6f7f97]">Luma Media</span>
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-md border border-[#1c2738] bg-[#030812] px-2.5 py-1.5 text-[11px] text-[#70829d] md:flex">
                <Search className="size-3.5" />
                Search in Luma Media...
              </div>
              <button className="grid size-8 place-items-center rounded-full border border-[#1e2a3b] bg-[#030812] text-[#9fb0ca]">
                <Bell className="size-3.5" />
              </button>
              <div className="grid size-8 place-items-center rounded-full border border-[#1e2a3b] bg-[linear-gradient(135deg,#3a4f6f,#162131)] text-[11px] font-semibold">
                {userEmail?.slice(0, 1).toUpperCase() || "U"}
              </div>
            </div>
          </div>
        </header>

        <section className="border-b border-[#121d2d] bg-[radial-gradient(circle_at_72%_40%,rgba(42,186,108,0.22),transparent_40%),linear-gradient(180deg,#060d1b_0%,#050b16_100%)] px-7 pb-11 pt-12 md:px-12 md:pt-14">
          <div className="grid gap-8 md:grid-cols-[1.05fr_0.95fr] md:items-center">
            <div>
              <p className="mb-5 inline-flex items-center rounded-full bg-[#0f3f28] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7ff0b5]">
                AI-powered distillation
              </p>
              <h1 className="heading-font text-[46px] font-semibold leading-[1.02] tracking-[-0.03em] text-white md:text-[58px]">
                将视频转化为
                <br />
                沉淀的知识
              </h1>
              <p className="mt-5 max-w-[480px] text-[13px] leading-6 text-[#99a9c2]">
                一键提取字幕、音频中的干货内容，自动生成结构化 Markdown 文本，构建您的个人知识体系。
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={loggedIn ? "/dashboard" : "/auth"}
                  className="rounded-md bg-[#1d4ed8] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#1e40af]"
                >
                  立即开始提取
                </Link>
                <Link
                  href="/dashboard"
                  className="rounded-md border border-[#263347] bg-[#0f1725] px-4 py-2.5 text-xs font-semibold text-[#d3deed] transition-colors hover:bg-[#172133]"
                >
                  查看演示视频
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-[#1a2434] bg-[linear-gradient(180deg,#141d2c,#0e1624)] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
              <div className="rounded-xl border border-[#283247] bg-[#131b2a] p-3">
                <div className="mb-3 flex items-center justify-between text-[10px] text-[#6f8099]">
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#ff5f56]" />
                    <span className="size-2 rounded-full bg-[#ffbd2e]" />
                    <span className="size-2 rounded-full bg-[#27c93f]" />
                  </div>
                  <span>preview placeholder</span>
                </div>
                <div className="rounded-lg border border-dashed border-[#3d4d67] bg-[#0d1421] p-4">
                  <div className="space-y-2">
                    <div className="h-1.5 w-full rounded bg-[#263347]" />
                    <div className="h-1.5 w-10/12 rounded bg-[#263347]" />
                    <div className="h-1.5 w-8/12 rounded bg-[#263347]" />
                  </div>
                  <div className="mt-6 flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[#5bf2ab]">Content details</p>
                    <span className="rounded bg-[#2f3c52] px-2 py-0.5 text-[9px] text-[#b7c5dc]">Add</span>
                  </div>
                  <p className="mt-4 text-[11px] text-[#8ea0bc]">Banner 图片占位符，后续替换为你的设计图。</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#030916] px-6 pb-14 pt-16 md:px-12">
          <div className="text-center">
            <h2 className="heading-font text-3xl font-semibold text-white">核心工序</h2>
            <p className="mt-3 text-xs text-[#7385a1]">从原始到洞察，只需三个步骤</p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <article className="rounded-xl border border-[#1a2434] bg-[#151d2b] p-5">
              <div className="mb-4 grid size-7 place-items-center rounded-md bg-[#202b40] text-[#9fb3d8]">
                <Zap className="size-4" />
              </div>
              <h3 className="heading-font text-[24px] font-semibold text-white">智能提取</h3>
              <p className="mt-3 max-w-[520px] text-[12px] leading-6 text-[#8e9fba]">
                无需下载视频，粘贴链接，支持音频剥离的文字提取。AI 同时解析视频外与实时镜像文本。
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#0b1320] px-2.5 py-1 text-[10px] text-[#899bb8]">MP4 Support</span>
                <span className="rounded-full bg-[#0b1320] px-2.5 py-1 text-[10px] text-[#899bb8]">Direct Link</span>
                <span className="rounded-full bg-[#0b1320] px-2.5 py-1 text-[10px] text-[#899bb8]">OCR Extraction</span>
              </div>
            </article>

            <article className="rounded-xl border border-[#1a2434] bg-[#151d2b] p-5">
              <div className="mb-4 grid size-7 place-items-center rounded-md bg-[#103324] text-[#6af0ab]">
                <Bot className="size-4" />
              </div>
              <h3 className="heading-font text-[24px] font-semibold text-white">AI 提炼</h3>
              <p className="mt-3 text-[12px] leading-6 text-[#8e9fba]">自动识别关键词和语义，提取口水话，生成的概要更清晰精准，直击要害。</p>
            </article>

            <article className="rounded-xl border border-[#1a2434] bg-[#151d2b] p-5">
              <div className="mb-4 grid size-7 place-items-center rounded-md bg-[#3a2d15] text-[#ffd07b]">
                <FileText className="size-4" />
              </div>
              <h3 className="heading-font text-[24px] font-semibold text-white">Markdown 导出</h3>
              <p className="mt-3 text-[12px] leading-6 text-[#8e9fba]">支持 Notion、Obsidian 等笔记软件，直接导入可用的第二大脑。</p>
            </article>
          </div>
        </section>

        <section className="rounded-b-2xl bg-[linear-gradient(180deg,#030916,#040a13)] px-6 pb-10 pt-14 md:px-12">
          <div className="mx-auto max-w-[620px] text-center">
            <h2 className="heading-font text-[34px] font-semibold text-white">准备好开始您的知识沉淀了吗？</h2>
            <p className="mt-4 text-[12px] text-[#7a8ca8]">加入 12,000+ 位内容创作者，开始您的知识沉淀之旅。</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={loggedIn ? "/dashboard" : "/auth"}
                className="rounded-md bg-[#1d4ed8] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#1e40af]"
              >
                免费注册试用
              </Link>
              <Link
                href="/dashboard"
                className="rounded-md border border-[#263347] bg-[#0f1725] px-5 py-2.5 text-xs font-semibold text-[#d3deed] transition-colors hover:bg-[#172133]"
              >
                联系商务合作
              </Link>
            </div>
            <div className="mt-12 flex items-center justify-center gap-5 text-[11px] text-[#6f809c]">
              <Link href="/">隐私政策</Link>
              <Link href="/">服务条款</Link>
              <Link href="/">使用手册</Link>
              <Link href="/">加入社群</Link>
            </div>
            <p className="mt-4 text-[10px] text-[#5f6d85]">© 2024 Luma Media. All rights reserved.</p>
          </div>
        </section>
      </div>

      <button
        type="button"
        className="fixed bottom-4 right-4 grid size-9 place-items-center rounded-md bg-[#d5e1ff] text-[#203150] shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
      >
        <Plus className="size-4" />
      </button>
    </main>
  );
}
