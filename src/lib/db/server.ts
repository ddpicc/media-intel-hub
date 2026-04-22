import { getCurrentUserFromSession } from "@/lib/auth/server";
import { createDbAdminClient } from "@/lib/db/client";

export async function getDbServerClient() {
  return {
    auth: {
      async getUser() {
        const user = await getCurrentUserFromSession();
        return { data: { user }, error: null };
      },
      async exchangeCodeForSession() {
        return { data: { session: null }, error: { message: "oauth callback disabled" } };
      },
    },
  };
}

export function getDbAdminClient() {
  return createDbAdminClient();
}
