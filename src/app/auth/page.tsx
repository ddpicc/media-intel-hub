import { AuthPanel } from "@/components/auth-panel";
import { getDbServerClient } from "@/lib/db/server";
import { redirect } from "next/navigation";

export default async function AuthPage() {
  const dbSession = await getDbServerClient();
  const {
    data: { user },
  } = await dbSession.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return <AuthPanel />;
}
