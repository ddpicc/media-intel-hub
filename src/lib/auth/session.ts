import { createHmac, timingSafeEqual } from "node:crypto";

type SessionPayload = {
  uid: string;
  email: string;
  exp: number;
};

export const AUTH_COOKIE_NAME = "mih_session";

function getAuthSecret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value) {
    throw new Error("Missing environment variable: AUTH_SECRET");
  }
  return value;
}

function b64urlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function b64urlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
}

export function createSessionToken(user: { id: string; email: string }, maxAgeSeconds = 60 * 60 * 24 * 14) {
  const payload: SessionPayload = {
    uid: user.id,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };
  const payloadPart = b64urlEncode(JSON.stringify(payload));
  const signature = sign(payloadPart);
  return `${payloadPart}.${signature}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [payloadPart, signature] = token.split(".");
  if (!payloadPart || !signature) return null;

  const expected = sign(payloadPart);
  const actualBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(b64urlDecode(payloadPart)) as SessionPayload;
    if (!payload.uid || !payload.email || !payload.exp) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
