import { cookies } from "next/headers";
import { getDbAdminClient } from "@/lib/db/server";
import { AUTH_COOKIE_NAME, createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

const SESSION_MAX_AGE = 60 * 60 * 24 * 14;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function validateCredentialInput(email: string, password: string) {
  if (!email || !email.includes("@")) {
    throw new Error("邮箱格式不正确");
  }
  if (password.length < 6) {
    throw new Error("密码至少 6 位");
  }
}

export async function getCurrentUserFromSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  return { id: payload.uid, email: payload.email };
}

export async function setAuthSession(user: { id: string; email: string }) {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, createSessionToken(user, SESSION_MAX_AGE), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearAuthSession() {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function registerWithEmail(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  validateCredentialInput(email, password);

  const admin = getDbAdminClient();
  const { data: existed, error: existedError } = await admin
    .from("app_users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existedError) throw new Error(existedError.message);
  if (existed) throw new Error("邮箱已注册");

  const { data: inserted, error: insertError } = await admin
    .from("app_users")
    .insert({
      email,
      password_hash: hashPassword(password),
    })
    .select("id,email")
    .single();
  if (insertError || !inserted) throw new Error(insertError?.message ?? "注册失败");

  await setAuthSession({ id: inserted.id, email: inserted.email });
  return inserted;
}

export async function loginWithEmail(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  validateCredentialInput(email, password);

  const admin = getDbAdminClient();
  const { data, error } = await admin
    .from("app_users")
    .select("id,email,password_hash")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !verifyPassword(password, data.password_hash)) {
    throw new Error("邮箱或密码错误");
  }

  await setAuthSession({ id: data.id, email: data.email });
  return { id: data.id, email: data.email };
}
