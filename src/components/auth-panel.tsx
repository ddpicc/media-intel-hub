"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type AuthMode = "signin" | "signup";

export function AuthPanel() {
  const router = useRouter();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === "signin") {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(payload.error || "登录失败");
          return;
        }
        router.refresh();
        router.push("/dashboard");
        return;
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "注册失败");
        return;
      }
      setMessage("注册成功，已自动登录。");
      router.refresh();
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_10%_0%,_rgba(96,165,250,0.25)_0,_transparent_33%),radial-gradient(circle_at_92%_8%,_rgba(249,115,22,0.2)_0,_transparent_30%),linear-gradient(180deg,#f8fafc_0%,#f3f7fb_55%,#eef4fb_100%)] px-4 py-12 text-[#1e293b]">
      <div className="mx-auto mt-14 w-full max-w-md">
        <div className="panel-strong rounded-3xl p-6 md:p-8">
          <h1 className="heading-font text-center text-2xl font-semibold text-[#0f172a]">欢迎回来</h1>
          <p className="mt-2 text-center text-sm text-[#64748b]">使用邮箱和密码登录或注册</p>

          <div className="mt-6 grid grid-cols-2 rounded-xl border border-[#dbe3ef] bg-white p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                mode === "signin" ? "bg-[#0f172a] text-white" : "text-[#475569]"
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                mode === "signup" ? "bg-[#0f172a] text-white" : "text-[#475569]"
              }`}
            >
              注册
            </button>
          </div>

          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm text-[#475569]">
                邮箱
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="ring-focus w-full rounded-xl border border-[#cbd5e1] bg-white px-3 py-2 transition-colors focus:border-[#3b82f6] focus:outline-none"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm text-[#475569]">
                密码
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="ring-focus w-full rounded-xl border border-[#cbd5e1] bg-white px-3 py-2 transition-colors focus:border-[#3b82f6] focus:outline-none"
                required
                minLength={6}
              />
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            {message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="ring-focus w-full rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "请稍候..." : mode === "signin" ? "登录" : "注册"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
