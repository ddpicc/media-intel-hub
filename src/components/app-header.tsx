import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";

type AppHeaderProps = {
  userEmail?: string | null;
  active?: "home" | "dashboard";
};

export function AppHeader({ userEmail, active = "home" }: AppHeaderProps) {
  const loggedIn = Boolean(userEmail);

  const linkClass = (current: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm transition-colors ${
      current ? "bg-[#eff6ff] text-[#1d4ed8]" : "text-[#475569] hover:bg-[#f8fafc]"
    }`;

  return (
    <header className="sticky left-0 right-0 top-0 z-30 px-3 py-3 md:px-5">
      <div className="panel mx-auto flex w-full max-w-7xl items-center justify-between rounded-2xl px-4 py-3 backdrop-blur md:px-5">
        <div className="flex items-center gap-5">
          <Link href="/" className="heading-font text-sm font-semibold tracking-[0.18em] text-[#1d4ed8]">
            流光智媒
          </Link>
          <Link href="/" className={linkClass(active === "home")}>
            首页
          </Link>
          <Link href="/dashboard" className={linkClass(active === "dashboard")}>
            监测看板
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {loggedIn ? (
            <>
              <span className="max-w-[280px] truncate text-xs text-[#64748b]">{userEmail}</span>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/auth"
              className="ring-focus rounded-lg bg-[#0f172a] px-3 py-1.5 text-xs text-white transition-colors hover:bg-[#1e293b]"
            >
              登录 / 注册
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
