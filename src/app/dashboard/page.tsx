import { Dashboard } from "@/components/dashboard";
import { getDbServerClient } from "@/lib/db/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const dbSession = await getDbServerClient();
  const {
    data: { user },
  } = await dbSession.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  return <Dashboard userEmail={user.email ?? ""} />;
}
