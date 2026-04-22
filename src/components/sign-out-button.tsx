"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
    router.push("/auth");
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="ring-focus inline-flex items-center gap-1 rounded-lg bg-[#0f172a] px-3 py-1.5 text-xs text-white transition-colors hover:bg-[#1e293b]"
    >
      <LogOut className="size-3.5" />
      退出
    </button>
  );
}
