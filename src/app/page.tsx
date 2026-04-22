import { LandingPage } from "@/components/landing-page";
import { getDbServerClient } from "@/lib/db/server";

export default async function HomePage() {
  const dbSession = await getDbServerClient();
  const {
    data: { user },
  } = await dbSession.auth.getUser();

  return <LandingPage userEmail={user?.email} />;
}
